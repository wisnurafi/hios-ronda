const { SlashCommandBuilder } = require("discord.js");
const { openBegadangDashboard, openRapotDashboard } = require("./dashboard");

const begadangCommand = new SlashCommandBuilder()
  .setName("begadang")
  .setDescription("Open the night-owl leaderboard dashboard (weekly announcement settings)")
  // No setDefaultMemberPermissions: the dashboard itself enforces
  // Administrator OR bot owner, so owners can use it without admin.
  .setDMPermission(false);

const rapotCommand = new SlashCommandBuilder()
  .setName("rapot")
  .setDescription("Open the weekly patrol report dashboard (announcement settings)")
  .setDMPermission(false);

async function handleBegadangCommand(interaction) {
  await openBegadangDashboard(interaction);
}

async function handleRapotCommand(interaction) {
  await openRapotDashboard(interaction);
}

module.exports = {
  begadangCommand,
  rapotCommand,
  handleBegadangCommand,
  handleRapotCommand,
};
