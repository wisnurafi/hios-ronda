const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { openWatchDashboard } = require("./dashboard");

const watchCommand = new SlashCommandBuilder()
  .setName("watch")
  .setDescription("Open the watch dashboard (Go Live notification settings)")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setDMPermission(false);

/** /watch — opens the interactive dashboard (ephemeral). */
async function handleWatchCommand(interaction) {
  await openWatchDashboard(interaction);
}

module.exports = { watchCommand, handleWatchCommand };
