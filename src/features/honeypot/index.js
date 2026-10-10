const { Events } = require("discord.js");
const { log } = require("../../log");
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
          log("webhook avatar sync error:", err.message)
        );
        await refreshCounter(guild, getConfig(guildId)).catch((err) =>
          log("warning refresh error:", err.message)
        );
      }
      if (cfg.honeypotChannelId && !guild.channels.cache.get(cfg.honeypotChannelId)) {
        log(`honeypot channel missing in ${guild.name} — re-run setup from /honeypot`);
      }
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isChatInputCommand() && interaction.commandName === "honeypot") {
        await openDashboard(interaction);
      } else if (interaction.isButton() && interaction.customId === "honeypot_info") {
        await handleInfoButton(interaction);
      }
    } catch (err) {
      log("honeypot interaction error:", err.message);
    }
  });

  client.on(Events.MessageCreate, handleHoneypotMessage);
}

module.exports = { registerHoneypot };
