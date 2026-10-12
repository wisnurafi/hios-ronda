/**
 * Postgres (Neon) storage for voice stats (night owls + weekly patrol report).
 *
 * Connection is owned by the shared pool in src/db.js (one pool for the
 * whole bot). This module registers its schema and exposes the stats
 * queries. If DATABASE_URL is unset or unreachable, the module stays
 * disabled and the bot keeps running — stats for that period are simply
 * not recorded (logged as a warning).
 */

const db = require("../../db");
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

db.registerSchema("voice-stats", SCHEMA);

/**
 * Record one finished voice session.
 *
 * The write runs in a transaction with SELECT ... FOR UPDATE, so two
 * sessions for the same user ending at the same time serialize on the row
 * lock instead of both reading the same stale `prev` row (the old
 * read-modify-write outside a transaction could lose minutes that way).
 * If both racers find no row and collide on INSERT, the loser retries once
 * as an UPDATE. Merge logic itself is unchanged.
 */
async function recordSession({ guildId, userId, weekStart, minutes, nightMinutes, channelId }) {
  if (!db.isEnabled()) return;
  const pool = db.getPool();

  for (let attempt = 1; attempt <= 2; attempt++) {
    let client = null;
    try {
      client = await pool.connect();
      await client.query("BEGIN");
      const { rows } = await client.query(
        `SELECT total_minutes, night_minutes, sessions, longest_session_minutes, channels
           FROM ronda_voice_stats
          WHERE guild_id = $1 AND user_id = $2 AND week_start = $3
          FOR UPDATE`,
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
      const vals = [
        guildId,
        userId,
        weekStart,
        prev.total_minutes + minutes,
        prev.night_minutes + nightMinutes,
        prev.sessions + 1,
        Math.max(prev.longest_session_minutes, minutes),
        JSON.stringify(channels),
      ];
      if (rows[0]) {
        await client.query(
          `UPDATE ronda_voice_stats
              SET total_minutes = $4, night_minutes = $5, sessions = $6,
                  longest_session_minutes = $7, channels = $8::jsonb, updated_at = NOW()
            WHERE guild_id = $1 AND user_id = $2 AND week_start = $3`,
          vals
        );
      } else {
        await client.query(
          `INSERT INTO ronda_voice_stats
             (guild_id, user_id, week_start, total_minutes, night_minutes,
              sessions, longest_session_minutes, channels, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, NOW())`,
          vals
        );
      }
      await client.query("COMMIT");
      return;
    } catch (err) {
      if (client) await client.query("ROLLBACK").catch(() => {});
      // Lost the insert race (row appeared between our SELECT and INSERT):
      // retry once — the row exists now, so this becomes an UPDATE.
      if (err && err.code === "23505" && attempt === 1) continue;
      log.warn("voice-stats db: recordSession failed:", err.message);
      return;
    } finally {
      if (client) client.release();
    }
  }
}

/** Top night owls for a week: [{ user_id, night_minutes }]. */
async function topNightOwls(guildId, weekStart, limit = 5) {
  if (!db.isEnabled()) return [];
  try {
    const { rows } = await db.getPool().query(
      `SELECT user_id, night_minutes
         FROM ronda_voice_stats
        WHERE guild_id = $1 AND week_start = $2 AND night_minutes > 0
        ORDER BY night_minutes DESC
        LIMIT $3`,
      [guildId, weekStart, limit]
    );
    return rows;
  } catch (err) {
    log.warn("voice-stats db: topNightOwls failed:", err.message);
    return [];
  }
}

/** All rows for a week (for the patrol report aggregates). */
async function weekRows(guildId, weekStart) {
  if (!db.isEnabled()) return [];
  try {
    const { rows } = await db.getPool().query(
      `SELECT user_id, total_minutes, night_minutes, sessions,
              longest_session_minutes, channels
         FROM ronda_voice_stats
        WHERE guild_id = $1 AND week_start = $2`,
      [guildId, weekStart]
    );
    return rows;
  } catch (err) {
    log.warn("voice-stats db: weekRows failed:", err.message);
    return [];
  }
}

/** Drop data older than 8 weeks (keeps the free tier small). */
async function pruneOldWeeks() {
  if (!db.isEnabled()) return;
  try {
    const cutoff = weekStartWeeksAgo(Date.now(), 8);
    const res = await db.getPool().query(
      `DELETE FROM ronda_voice_stats WHERE week_start < $1::date`,
      [cutoff]
    );
    if (res.rowCount > 0) log(`ronda db: pruned ${res.rowCount} old week rows`);
  } catch (err) {
    log.warn("voice-stats db: pruneOldWeeks failed:", err.message);
  }
}

module.exports = {
  // Shared pool (src/db.js) — same names as before, so call sites don't change.
  initDb: db.initDb,
  isEnabled: db.isEnabled,
  startReconnectLoop: db.startReconnectLoop,
  recordSession,
  topNightOwls,
  weekRows,
  pruneOldWeeks,
};
