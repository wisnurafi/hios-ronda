/**
 * Ronda voice-stats feature: night-owl leaderboard + weekly patrol report.
 *
 *  - Tracks voice sessions (VoiceStateUpdate) into Postgres (Neon).
 *  - Auto-migrates schema on startup; degrades gracefully when the DB
 *    is unavailable (bot keeps running, stats are skipped).
 *  - Announces both reports on each guild's own schedule (WIB) via a
 *    5-minute node-cron tick.
 *  - /begadang and /rapot open the per-feature dashboards.
 */

const { Events } = require("discord.js");
const cron = require("node-cron");
const { log } = require("../../log");
const { enforceControlLockdown } = require("../control");
const { initDb, startReconnectLoop } = require("./db");
const { handleVoiceStateUpdate, seedFromGuilds } = require("./tracker");
const { runDueAnnouncements } = require("./announce");
const { handleBegadangCommand, handleRapotCommand } = require("./commands");

function registerRonda(client, config) {
  // DB + auto-migrate first; tracker no-ops until the DB is ready.
  // If the DB is unreachable (e.g. Neon still waking up), keep retrying
  // in the background instead of staying disabled until a restart.
  initDb()
    .then(() => {
      startReconnectLoop();
      return seedFromGuilds(client);
    })
    .catch((err) => log("ronda init error:", err.message));

  client.once(Events.ClientReady, async () => {
    // Seed sessions that were already active before (re)start.
    await seedFromGuilds(client).catch((err) => log("ronda seed error:", err.message));

    // Announcement scheduler: every 5 minutes each guild's /begadang and
    // /rapot fire on their own configured day/time (WIB wall-clock).
    try {
      cron.schedule(
        "*/5 * * * *",
        () => {
          runDueAnnouncements(client).catch((err) =>
            log.warn("ronda announce error:", err.message)
          );
        },
        { timezone: "Asia/Jakarta" }
      );
      log("ronda: announcement scheduler running (5-min tick, per-guild schedules)");
    } catch (err) {
      log.warn("ronda: failed to schedule announcements:", err.message);
    }
  });

  client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    try {
      await handleVoiceStateUpdate(oldState, newState);
    } catch (err) {
      log.warn("ronda voiceStateUpdate error:", err.message);
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (!interaction.isChatInputCommand()) return;
      if (await enforceControlLockdown(interaction)) return;
      if (interaction.commandName === "begadang") {
        await handleBegadangCommand(interaction);
      } else if (interaction.commandName === "rapot") {
        await handleRapotCommand(interaction);
      }
    } catch (err) {
      log.warn("ronda interaction error:", err.message);
    }
  });

}

module.exports = { registerRonda };
