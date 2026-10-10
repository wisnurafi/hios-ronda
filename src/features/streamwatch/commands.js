const { SlashCommandBuilder } = require("discord.js");
const { openWatchDashboard } = require("./dashboard");

const watchCommand = new SlashCommandBuilder()
  .setName("watch")
  .setDescription("Open the watch dashboard (Go Live notification settings)")
  // No setDefaultMemberPermissions: the dashboard itself enforces
  // Administrator OR bot owner, so owners can use it without admin.
  .setDMPermission(false);

/** /watch — opens the interactive dashboard (ephemeral). */
async function handleWatchCommand(interaction) {
  await openWatchDashboard(interaction);
}

module.exports = { watchCommand, handleWatchCommand };
