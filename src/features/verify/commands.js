const { SlashCommandBuilder } = require("discord.js");

const verifyCommand = new SlashCommandBuilder()
  .setName("verify")
  .setDescription("Open the verification dashboard (one-click member verify)")
  // No setDefaultMemberPermissions: the dashboard itself enforces
  // Administrator OR bot owner, so owners can use it without admin.
  .setDMPermission(false);

// Deployment lives in src/commands.js — guild command PUT replaces the
// whole list, so all commands must be deployed together in one payload.
// NOTE: the actual verifying is done by the public Verify BUTTON, not this
// command — this only opens the admin dashboard.

module.exports = { verifyCommand };
