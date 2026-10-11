/**
 * Postgres (Neon) storage for the Cek Khodam game.
 *
 * Same pattern as src/features/ronda/db.js: auto-migrate on startup
 * (CREATE TABLE IF NOT EXISTS), tiny pool for the free tier, reconnect
 * loop while disabled. If DATABASE_URL is unset/unreachable the game
 * features degrade with a friendly message instead of crashing.
 *
 * Tables:
 * - khodam_collection(guild_id, user_id, khodam_id, discovered_at)
 * - khodam_duel_stats(guild_id, user_id, khodam_id, wins, draws, losses)
 * - khodam_daily(guild_id, user_id, ymd, rolls_used)
 */

const { Pool } = require("pg");
const { log } = require("../../log");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS khodam_collection (
  guild_id      TEXT NOT NULL,
  user_id       TEXT NOT NULL,
  khodam_id     TEXT NOT NULL,
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (guild_id, user_id, khodam_id)
);
CREATE TABLE IF NOT EXISTS khodam_duel_stats (
  guild_id  TEXT NOT NULL,
  user_id   TEXT NOT NULL,
  khodam_id TEXT NOT NULL,
  wins      INTEGER NOT NULL DEFAULT 0,
  draws     INTEGER NOT NULL DEFAULT 0,
  losses    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, user_id, khodam_id)
);
CREATE TABLE IF NOT EXISTS khodam_daily (
  guild_id   TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  ymd        TEXT NOT NULL,
  rolls_used INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, user_id, ymd)
);
CREATE INDEX IF NOT EXISTS khodam_duel_stats_guild_idx
  ON khodam_duel_stats (guild_id);
`;

let pool = null;
let enabled = false;

function isEnabled() {
  return enabled;
}

async function initDb() {
  const url = (process.env.DATABASE_URL || "").trim();
  if (!url) {
    log.warn("khodam db: DATABASE_URL not set — khodam game disabled (bot still runs)");
    return;
  }
  const attempts = 3;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      pool = new Pool({
        connectionString: url,
        max: 3,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 30_000,
        ssl: { rejectUnauthorized: false },
      });
      pool.on("error", (err) => log("khodam db pool error:", err.message));
      await pool.query("SELECT 1");
      await pool.query(SCHEMA);
      enabled = true;
      log("khodam db: connected, schema ready");
      return;
    } catch (err) {
      log.warn(`khodam db: connect attempt ${attempt}/${attempts} failed:`, err.message);
      try {
        await pool?.end().catch(() => {});
      } catch {}
      pool = null;
      if (attempt < attempts) await new Promise((r) => setTimeout(r, 5000));
    }
  }
  log.warn("khodam db: unavailable — khodam game disabled (bot still runs)");
  enabled = false;
}

function startReconnectLoop() {
  const timer = setInterval(async () => {
    if (enabled) {
      clearInterval(timer);
      return;
    }
    if (!(process.env.DATABASE_URL || "").trim()) return;
    log("khodam db: retrying connection...");
    await initDb();
  }, 5 * 60_000);
  timer.unref?.();
}

// ---- daily quota ----

async function getDailyRolls(guildId, userId, ymd) {
  if (!enabled) return 0;
  try {
    const { rows } = await pool.query(
      `SELECT rolls_used FROM khodam_daily WHERE guild_id = $1 AND user_id = $2 AND ymd = $3`,
      [guildId, userId, ymd]
    );
    return rows[0]?.rolls_used || 0;
  } catch (err) {
    log.warn("khodam db: getDailyRolls failed:", err.message);
    return 0;
  }
}

async function incrementDailyRoll(guildId, userId, ymd) {
  if (!enabled) return 0;
  try {
    const { rows } = await pool.query(
      `INSERT INTO khodam_daily (guild_id, user_id, ymd, rolls_used)
       VALUES ($1, $2, $3, 1)
       ON CONFLICT (guild_id, user_id, ymd)
       DO UPDATE SET rolls_used = khodam_daily.rolls_used + 1
       RETURNING rolls_used`,
      [guildId, userId, ymd]
    );
    return rows[0]?.rolls_used || 0;
  } catch (err) {
    log.warn("khodam db: incrementDailyRoll failed:", err.message);
    return 0;
  }
}

// ---- collection ----

async function getCollection(guildId, userId) {
  if (!enabled) return [];
  try {
    const { rows } = await pool.query(
      `SELECT khodam_id, discovered_at FROM khodam_collection
        WHERE guild_id = $1 AND user_id = $2 ORDER BY discovered_at ASC`,
      [guildId, userId]
    );
    return rows;
  } catch (err) {
    log.warn("khodam db: getCollection failed:", err.message);
    return [];
  }
}

/** Returns true when inserted, false when the khodam was already owned. */
async function addToCollection(guildId, userId, khodamId) {
  if (!enabled) return false;
  try {
    const res = await pool.query(
      `INSERT INTO khodam_collection (guild_id, user_id, khodam_id)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [guildId, userId, khodamId]
    );
    return res.rowCount > 0;
  } catch (err) {
    log.warn("khodam db: addToCollection failed:", err.message);
    return false;
  }
}

async function removeFromCollection(guildId, userId, khodamId) {
  if (!enabled) return;
  try {
    await pool.query(
      `DELETE FROM khodam_collection WHERE guild_id = $1 AND user_id = $2 AND khodam_id = $3`,
      [guildId, userId, khodamId]
    );
  } catch (err) {
    log.warn("khodam db: removeFromCollection failed:", err.message);
  }
}

// ---- duel stats ----
// NOTE: duel stats are keyed by (guild,user,khodam) and are NEVER deleted
// when a khodam leaves the collection — replaced khodam keep their
// all-time history, per the final plan.

async function recordDuel(guildId, userId, khodamId, outcome) {
  // outcome: "win" | "draw" | "loss"
  if (!enabled) return;
  const col = outcome === "win" ? "wins" : outcome === "draw" ? "draws" : "losses";
  try {
    await pool.query(
      `INSERT INTO khodam_duel_stats (guild_id, user_id, khodam_id, wins, draws, losses)
       VALUES ($1, $2, $3, 0, 0, 0)
       ON CONFLICT (guild_id, user_id, khodam_id)
       DO UPDATE SET ${col} = khodam_duel_stats.${col} + 1`,
      [guildId, userId, khodamId]
    );
  } catch (err) {
    log.warn("khodam db: recordDuel failed:", err.message);
  }
}

/**
 * Top duelists by total wins: [{ user_id, wins, draws, losses }].
 * Tiebreak: fewer losses first (1W-0L outranks 1W-1L), then more draws.
 */
async function leaderboardByWins(guildId, limit = 5) {
  if (!enabled) return [];
  try {
    const { rows } = await pool.query(
      `SELECT user_id, SUM(wins) AS wins, SUM(draws) AS draws, SUM(losses) AS losses
         FROM khodam_duel_stats
        WHERE guild_id = $1
        GROUP BY user_id
       HAVING SUM(wins) > 0
        ORDER BY wins DESC, losses ASC, draws DESC
        LIMIT $2`,
      [guildId, limit]
    );
    return rows;
  } catch (err) {
    log.warn("khodam db: leaderboardByWins failed:", err.message);
    return [];
  }
}

/**
 * Best win rate per (user, khodam): [{ user_id, khodam_id, wins, draws, losses }].
 * minDuels keeps one-off lucky wins off the board.
 */
async function leaderboardByWinRate(guildId, limit = 5, minDuels = 3) {
  if (!enabled) return [];
  try {
    const { rows } = await pool.query(
      `SELECT user_id, khodam_id, wins, draws, losses,
              (wins::float / NULLIF(wins + draws + losses, 0)) AS win_rate
         FROM khodam_duel_stats
        WHERE guild_id = $1 AND (wins + draws + losses) >= $3
        ORDER BY win_rate DESC, wins DESC
        LIMIT $2`,
      [guildId, limit, minDuels]
    );
    return rows;
  } catch (err) {
    log.warn("khodam db: leaderboardByWinRate failed:", err.message);
    return [];
  }
}

module.exports = {
  isEnabled,
  initDb,
  startReconnectLoop,
  getDailyRolls,
  incrementDailyRoll,
  getCollection,
  addToCollection,
  removeFromCollection,
  recordDuel,
  leaderboardByWins,
  leaderboardByWinRate,
};
