/**
 * Voice-stats feature: night-owl leaderboard + weekly patrol report.
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
const {
  log,
  runWithTraceContext,
  createInteractionTraceContext,
  createEventTraceContext,
} = require("../../log");
const { enforceControlLockdown } = require("../control");
const { initDb, startReconnectLoop } = require("./db");
const { handleVoiceStateUpdate, seedFromGuilds, clearGuildSessions } = require("./tracker");
const { runDueAnnouncements } = require("./announce");
const { handleBegadangCommand, handleRapotCommand } = require("./commands");

function registerVoiceStats(client, config) {
  // DB + auto-migrate first; tracker no-ops until the DB is ready.
  // If the DB is unreachable (e.g. Neon still waking up), keep retrying
  // in the background instead of staying disabled until a restart.
  initDb()
    .then(() => {
      startReconnectLoop();
      return seedFromGuilds(client);
    })
    .catch((err) => log("voice-stats init error:", err.message));

  client.once(Events.ClientReady, async () => {
    // Seed sessions that were already active before (re)start.
    await seedFromGuilds(client).catch((err) => log("voice-stats seed error:", err.message));

    // Announcement scheduler: every 5 minutes each guild's /begadang and
    // /rapot fire on their own configured day/time (WIB wall-clock).
    try {
      cron.schedule(
        "*/5 * * * *",
        () => {
          runDueAnnouncements(client).catch((err) =>
            log.warn("voice-stats announce error:", err.message)
          );
        },
        { timezone: "Asia/Jakarta" }
      );
      log("voice-stats: announcement scheduler running (5-min tick, per-guild schedules)");
    } catch (err) {
      log.warn("voice-stats: failed to schedule announcements:", err.message);
    }
  });

  client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    const guild = newState.guild ?? oldState.guild;
    const member = newState.member ?? oldState.member;
    await runWithTraceContext(
      createEventTraceContext({
        guildId: guild?.id || null,
        userId: member?.id || null,
        channelId: newState.channelId ?? oldState.channelId ?? null,
        command: "voiceStateUpdate",
      }),
      async () => {
        try {
          await handleVoiceStateUpdate(oldState, newState);
        } catch (err) {
          log.warn("voice-stats voiceStateUpdate error:", err.message);
        }
      }
    );
  });

  // Drop tracked sessions when the bot leaves/is removed from a guild.
  client.on(Events.GuildDelete, (guild) => {
    try {
      clearGuildSessions(guild.id);
    } catch (err) {
      log.warn("voice-stats guild cleanup error:", err.message);
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (!interaction.isChatInputCommand()) return;
      if (
        interaction.commandName !== "begadang" &&
        interaction.commandName !== "rapot"
      )
        return;
      await runWithTraceContext(createInteractionTraceContext(interaction), async () => {
        try {
          if (await enforceControlLockdown(interaction)) return;
          log.info(`${interaction.commandName} dashboard opened`);
          if (interaction.commandName === "begadang") {
            await handleBegadangCommand(interaction);
          } else {
            await handleRapotCommand(interaction);
          }
        } catch (err) {
          log.warn("voice-stats interaction error:", err.message);
        }
      });
    } catch (err) {
      log.warn("voice-stats interaction error:", err.message);
    }
  });

}

module.exports = { registerVoiceStats };
