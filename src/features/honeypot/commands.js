const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { log } = require("../../log");

const honeypotCommand = new SlashCommandBuilder()
  .setName("honeypot")
  .setDescription("Open the honeypot dashboard (spam trap settings)")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setDMPermission(false);

/**
 * Register the /honeypot command in every guild (instant, unlike global).
 * Idempotent — safe to run on every startup.
 */
async function deployCommands(client) {
  const rest = new REST({ version: "10" }).setToken(client.token);
  const body = [honeypotCommand.toJSON()];
  for (const [guildId, guild] of client.guilds.cache) {
    try {
      await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), { body });
      log(`deployed /honeypot in ${guild.name}`);
    } catch (err) {
      log(`command deploy failed in ${guildId}: ${err.message}`);
    }
  }
}

module.exports = { deployCommands, honeypotCommand };
