const { Client, GatewayIntentBits } = require("discord.js");

/**
 * The gateway intents this bot needs. Both are non-privileged,
 * no special toggle required in the Developer Portal.
 */
function createClient() {
  return new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
  });
}

module.exports = { createClient };
