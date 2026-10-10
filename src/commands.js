const { REST, Routes } = require("discord.js");
const { log } = require("./log");
const { honeypotCommand } = require("./features/honeypot/commands");
const { watchCommand } = require("./features/streamwatch/commands");
const { begadangCommand, rapotCommand } = require("./features/ronda/commands");
const { helpCommand } = require("./features/help/commands");
const { githubCommand } = require("./features/github/commands");

// All slash commands in ONE list: guild command PUT *replaces* the whole
// list, so deploying per-feature would make them delete each other.
const allCommands = [honeypotCommand, watchCommand, begadangCommand, rapotCommand, helpCommand, githubCommand];

/**
 * Register every slash command in every guild (instant, unlike global).
 * Idempotent — safe to run on every startup.
 */
async function deployCommands(client) {
  const rest = new REST({ version: "10" }).setToken(client.token);
  const body = allCommands.map((c) => c.toJSON());
  const names = allCommands.map((c) => `/${c.name}`).join(", ");
  for (const [guildId, guild] of client.guilds.cache) {
    try {
      await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), { body });
      log(`deployed ${names} in ${guild.name}`);
    } catch (err) {
      log(`command deploy failed in ${guildId}: ${err.message}`);
    }
  }
}

module.exports = { deployCommands };
