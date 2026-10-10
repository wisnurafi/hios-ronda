/**
 * Ronda voice-stats feature: night-owl leaderboard + weekly patrol report.
 *
 *  - Tracks voice sessions (VoiceStateUpdate) into Postgres (Neon).
 *  - Auto-migrates schema on startup; degrades gracefully when the DB
 *    is unavailable (bot keeps running, stats are skipped).
 *  - Announces both reports every Monday 09:00 WIB via node-cron.
 *  - /begadang and /rapot open the per-feature dashboards.
 */

const { Events } = require("discord.js");
const cron = require("node-cron");
const { log } = require("../../log");
const { initDb } = require("./db");
const { handleVoiceStateUpdate, seedFromGuilds } = require("./tracker");
const { runWeeklyAnnouncements } = require("./announce");
const { handleBegadangCommand, handleRapotCommand } = require("./commands");

function registerRonda(client, config) {
  // DB + auto-migrate first; tracker no-ops until the DB is ready.
  initDb()
    .then(() => seedFromGuilds(client))
    .catch((err) => log("ronda init error:", err.message));

  client.once(Events.ClientReady, async () => {
    // Seed sessions that were already active before (re)start.
    await seedFromGuilds(client).catch((err) => log("ronda seed error:", err.message));

    // Weekly announcements: Monday 09:00 Asia/Jakarta.
    try {
      cron.schedule(
        "0 9 * * 1",
        () => {
          runWeeklyAnnouncements(client).catch((err) =>
            log("ronda weekly announce error:", err.message)
          );
        },
        { timezone: "Asia/Jakarta" }
      );
      log("ronda: weekly announcements scheduled (Mon 09:00 WIB)");
    } catch (err) {
      log("ronda: failed to schedule weekly announcements:", err.message);
    }
  });

  client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    try {
      await handleVoiceStateUpdate(oldState, newState);
    } catch (err) {
      log("ronda voiceStateUpdate error:", err.message);
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (!interaction.isChatInputCommand()) return;
      if (interaction.commandName === "begadang") {
        await handleBegadangCommand(interaction);
      } else if (interaction.commandName === "rapot") {
        await handleRapotCommand(interaction);
      }
    } catch (err) {
      log("ronda interaction error:", err.message);
    }
  });

}

module.exports = { registerRonda };
