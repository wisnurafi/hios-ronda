const { Events } = require("discord.js");
const {
  log,
  runWithTraceContext,
  createInteractionTraceContext,
  createEventTraceContext,
} = require("../../log");
const { enforceControlLockdown } = require("../control");
const { getConfig } = require("./store");
const { openDashboard } = require("./dashboard");
const { handleHoneypotMessage } = require("./handler");
const { handleInfoButton } = require("./info");
const { recoverHoneypot, refreshCounter } = require("./setup");
const { ensureHoneypotEmojis } = require("./emojis");
const { syncLogsWebhookAvatar } = require("./webhook");

/**
 * Wire the honeypot feature into the client.
 */
function registerHoneypot(client) {
  client.once(Events.ClientReady, async (c) => {
    // (slash commands are deployed centrally from src/commands.js)
    for (const [guildId, guild] of c.guilds.cache) {
      // Self-heal config first (ephemeral disk may have wiped data/*.json),
      // then sanity-check the channel still exists.
      await recoverHoneypot(guild).catch((err) => log("recover error:", err.message));
      const cfg = getConfig(guildId);
      // Make sure the clean icons exist as custom emojis.
      if (cfg.honeypotChannelId) {
        await ensureHoneypotEmojis(guild).catch((err) => log("emoji ensure error:", err.message));
        // Refresh the "HIOS | Honeypot" webhook avatar if the art changed,
        // and re-render the warning so new artwork shows immediately.
        await syncLogsWebhookAvatar(guild, getConfig(guildId)).catch((err) =>
          log.warn("webhook avatar sync error:", err.message)
        );
        await refreshCounter(guild, getConfig(guildId)).catch((err) =>
          log.warn("warning refresh error:", err.message)
        );
      }
      if (cfg.honeypotChannelId && !guild.channels.cache.get(cfg.honeypotChannelId)) {
        log.warn(`honeypot channel missing in ${guild.name} — re-run setup from /honeypot`);
      }
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    const isDashboardCmd =
      interaction.isChatInputCommand() && interaction.commandName === "honeypot";
    const isInfoButton = interaction.isButton() && interaction.customId === "honeypot_info";
    if (!isDashboardCmd && !isInfoButton) return;
    await runWithTraceContext(createInteractionTraceContext(interaction), async () => {
      try {
        if (isDashboardCmd) {
          if (await enforceControlLockdown(interaction)) return;
          log.info("honeypot dashboard opened");
          await openDashboard(interaction);
        } else {
          log.debug("honeypot info button pressed");
          await handleInfoButton(interaction);
        }
      } catch (err) {
        log.warn("honeypot interaction error:", err.message);
      }
    });
  });

  client.on(Events.MessageCreate, (message) =>
    runWithTraceContext(
      createEventTraceContext({
        guildId: message.guildId || null,
        userId: message.author?.id || null,
        channelId: message.channelId || null,
        command: "messageCreate",
      }),
      () => handleHoneypotMessage(message)
    )
  );
}

module.exports = { registerHoneypot };
