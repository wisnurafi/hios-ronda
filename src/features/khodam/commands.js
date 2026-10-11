const { SlashCommandBuilder } = require("discord.js");

const khodamCommand = new SlashCommandBuilder()
  .setName("khodam")
  .setDescription("Open the Cek Khodam game dashboard")
  // No setDefaultMemberPermissions: the dashboard itself enforces
  // Administrator OR bot owner, so owners can use it without admin.
  .setDMPermission(false);

// Deployment lives in src/commands.js — guild command PUT replaces the
// whole list, so all commands must be deployed together in one payload.
// NOTE: players never touch this command — they use the public panel
// buttons. This only opens the admin dashboard.

module.exports = { khodamCommand };
