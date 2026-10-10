/**
 * Postgres (Neon) storage for ronda voice stats.
 *
 * Auto-migrates on startup: CREATE TABLE IF NOT EXISTS, so no manual
 * migration is ever needed. If DATABASE_URL is unset or unreachable, the
 * module stays disabled and the bot keeps running — stats for that period
 * are simply not recorded (logged as a warning).
 */

const { Pool } = require("pg");
const { log } = require("../../log");
const { weekStartWeeksAgo } = require("./time");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS ronda_voice_stats (
  guild_id                TEXT NOT NULL,
  user_id                 TEXT NOT NULL,
  week_start              DATE NOT NULL,
  total_minutes           INTEGER NOT NULL DEFAULT 0,
  night_minutes           INTEGER NOT NULL DEFAULT 0,
  sessions                INTEGER NOT NULL DEFAULT 0,
  longest_session_minutes INTEGER NOT NULL DEFAULT 0,
  channels                JSONB NOT NULL DEFAULT '{}',
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (guild_id, user_id, week_start)
);
`;

let pool = null;
let enabled = false;

function isEnabled() {
  return enabled;
}

/** Connect + auto-migrate. Never throws — degrades to disabled on failure. */
async function initDb() {
  const url = (process.env.DATABASE_URL || "").trim();
  if (!url) {
    log("ronda db: DATABASE_URL not set — voice stats disabled (bot still runs)");
    return;
  }
  // Neon free tier suspends compute when idle — the first connection wakes
  // it up and can take 10-30s, so retry a few times before giving up.
  const attempts = 3;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      pool = new Pool({
        connectionString: url,
        max: 3, // tiny footprint for the free tier
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 30_000,
        ssl: { rejectUnauthorized: false }, // Neon requires SSL
      });
      pool.on("error", (err) => log("ronda db pool error:", err.message));
      await pool.query("SELECT 1");
      await pool.query(SCHEMA); // auto-migrate: no manual steps needed
      enabled = true;
      log("ronda db: connected, schema ready");
      return;
    } catch (err) {
      log(`ronda db: connect attempt ${attempt}/${attempts} failed:`, err.message);
      try {
        await pool?.end().catch(() => {});
      } catch {}
      pool = null;
      if (attempt < attempts) await new Promise((r) => setTimeout(r, 5000));
    }
  }
  log("ronda db: unavailable — voice stats disabled (bot still runs)");
  enabled = false;
}

/**
 * Periodic re-attempt while disabled (e.g. Neon was still waking up at
 * startup). Cheap: runs at most every 5 minutes, stops once connected.
 */
function startReconnectLoop() {
  const timer = setInterval(async () => {
    if (enabled) {
      clearInterval(timer);
      return;
    }
    if (!(process.env.DATABASE_URL || "").trim()) return;
    log("ronda db: retrying connection...");
    await initDb();
  }, 5 * 60_000);
  timer.unref?.();
}

/**
 * Record one finished voice session. Read-modify-write in JS (single
 * process, low write volume) so per-channel minutes merge correctly.
 */
async function recordSession({ guildId, userId, weekStart, minutes, nightMinutes, channelId }) {
  if (!enabled) return;
  try {
    const { rows } = await pool.query(
      `SELECT total_minutes, night_minutes, sessions, longest_session_minutes, channels
         FROM ronda_voice_stats
        WHERE guild_id = $1 AND user_id = $2 AND week_start = $3`,
      [guildId, userId, weekStart]
    );
    const prev = rows[0] || {
      total_minutes: 0,
      night_minutes: 0,
      sessions: 0,
      longest_session_minutes: 0,
      channels: {},
    };
    const channels = { ...(prev.channels || {}) };
    if (channelId) channels[channelId] = (channels[channelId] || 0) + minutes;
    await pool.query(
      `INSERT INTO ronda_voice_stats
         (guild_id, user_id, week_start, total_minutes, night_minutes,
          sessions, longest_session_minutes, channels, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,NOW())
       ON CONFLICT (guild_id, user_id, week_start) DO UPDATE SET
         total_minutes = EXCLUDED.total_minutes,
         night_minutes = EXCLUDED.night_minutes,
         sessions = EXCLUDED.sessions,
         longest_session_minutes = EXCLUDED.longest_session_minutes,
         channels = EXCLUDED.channels,
         updated_at = NOW()`,
      [
        guildId,
        userId,
        weekStart,
        prev.total_minutes + minutes,
        prev.night_minutes + nightMinutes,
        prev.sessions + 1,
        Math.max(prev.longest_session_minutes, minutes),
        JSON.stringify(channels),
      ]
    );
  } catch (err) {
    log("ronda db: recordSession failed:", err.message);
  }
}

/** Top night owls for a week: [{ user_id, night_minutes }]. */
async function topNightOwls(guildId, weekStart, limit = 5) {
  if (!enabled) return [];
  try {
    const { rows } = await pool.query(
      `SELECT user_id, night_minutes
         FROM ronda_voice_stats
        WHERE guild_id = $1 AND week_start = $2 AND night_minutes > 0
        ORDER BY night_minutes DESC
        LIMIT $3`,
      [guildId, weekStart, limit]
    );
    return rows;
  } catch (err) {
    log("ronda db: topNightOwls failed:", err.message);
    return [];
  }
}

/** All rows for a week (for the patrol report aggregates). */
async function weekRows(guildId, weekStart) {
  if (!enabled) return [];
  try {
    const { rows } = await pool.query(
      `SELECT user_id, total_minutes, night_minutes, sessions,
              longest_session_minutes, channels
         FROM ronda_voice_stats
        WHERE guild_id = $1 AND week_start = $2`,
      [guildId, weekStart]
    );
    return rows;
  } catch (err) {
    log("ronda db: weekRows failed:", err.message);
    return [];
  }
}

/** Drop data older than 8 weeks (keeps the free tier small). */
async function pruneOldWeeks() {
  if (!enabled) return;
  try {
    const cutoff = weekStartWeeksAgo(Date.now(), 8);
    const res = await pool.query(
      `DELETE FROM ronda_voice_stats WHERE week_start < $1::date`,
      [cutoff]
    );
    if (res.rowCount > 0) log(`ronda db: pruned ${res.rowCount} old week rows`);
  } catch (err) {
    log("ronda db: pruneOldWeeks failed:", err.message);
  }
}

module.exports = {
  initDb,
  isEnabled,
  startReconnectLoop,
  recordSession,
  topNightOwls,
  weekRows,
  pruneOldWeeks,
};
