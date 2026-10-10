const { SlashCommandBuilder } = require("discord.js");
const { openGithubDashboard } = require("./dashboard");

const githubCommand = new SlashCommandBuilder()
  .setName("github")
  .setDescription("Open the GitHub logs dashboard (feed settings)")
  // No setDefaultMemberPermissions: the dashboard itself enforces
  // Administrator OR bot owner, so owners can use it without admin.
  .setDMPermission(false);

/** /github — opens the interactive dashboard (ephemeral). */
async function handleGithubCommand(interaction) {
  await openGithubDashboard(interaction);
}

module.exports = { githubCommand, handleGithubCommand };
