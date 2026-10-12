const { REST, Routes } = require("discord.js");
const { log } = require("./log");
const { honeypotCommand } = require("./features/honeypot/commands");
const { watchCommand } = require("./features/streamwatch/commands");
const { begadangCommand, rapotCommand } = require("./features/voice-stats/commands");
const { helpCommand } = require("./features/help/commands");
const { githubCommand } = require("./features/github/commands");
const { controlCommand } = require("./features/control/commands");
const { pingCommand } = require("./features/ping/commands");
const { verifyCommand } = require("./features/verify/commands");
const { khodamCommand } = require("./features/khodam/commands");

// All slash commands in ONE list: guild command PUT *replaces* the whole
// list, so deploying per-feature would make them delete each other.
const allCommands = [honeypotCommand, watchCommand, begadangCommand, rapotCommand, helpCommand, githubCommand, controlCommand, pingCommand, verifyCommand, khodamCommand];

// Command names for the /control except-autocomplete.
const commandNames = allCommands.map((c) => c.name);

/**
 * Register every slash command in every guild (instant, unlike global).
 * Idempotent — safe to run on every startup.
 */
async function deployCommands(client) {
  const rest = new REST({ version: "10" }).setToken(client.token);
  const body = allCommands.map((c) => c.toJSON());
  for (const [guildId, guild] of client.guilds.cache) {
    const t0 = Date.now();
    try {
      await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), { body });
      log.info("commands deployed", { guild: guild.name, ms: Date.now() - t0 });
    } catch (err) {
      log.warn(`command deploy failed in ${guildId}: ${err.message}`);
    }
  }
}

module.exports = { deployCommands, allCommands, commandNames };
