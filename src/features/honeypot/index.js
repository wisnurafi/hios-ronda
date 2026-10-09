const { Events } = require("discord.js");
const { log } = require("../../log");
const { getConfig } = require("./store");
const { deployCommands } = require("./commands");
const { openDashboard } = require("./dashboard");
const { handleHoneypotMessage } = require("./handler");

/**
 * Wire the honeypot feature into the client.
 */
function registerHoneypot(client) {
  client.once(Events.ClientReady, async (c) => {
    await deployCommands(c);
    // sanity: warn if the configured honeypot channel vanished
    for (const [guildId, guild] of c.guilds.cache) {
      const cfg = getConfig(guildId);
      if (cfg.honeypotChannelId && !guild.channels.cache.get(cfg.honeypotChannelId)) {
        log(`honeypot channel missing in ${guild.name} — re-run setup from /honeypot`);
      }
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isChatInputCommand() && interaction.commandName === "honeypot") {
        await openDashboard(interaction);
      }
    } catch (err) {
      log("honeypot interaction error:", err.message);
    }
  });

  client.on(Events.MessageCreate, handleHoneypotMessage);
}

module.exports = { registerHoneypot };
