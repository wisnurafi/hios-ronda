const { Client, GatewayIntentBits } = require("discord.js");

/**
 * The gateway intents this bot needs.
 * Guilds + GuildVoiceStates: streamwatch (non-privileged).
 * GuildMessages + MessageContent: honeypot (MessageContent is privileged —
 * enable it in the Developer Portal under Bot > Privileged Gateway Intents).
 */
function createClient() {
  return new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });
}

module.exports = { createClient };
