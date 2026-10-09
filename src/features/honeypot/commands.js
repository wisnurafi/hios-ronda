const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

const honeypotCommand = new SlashCommandBuilder()
  .setName("honeypot")
  .setDescription("Open the honeypot dashboard (spam trap settings)")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setDMPermission(false);

// Deployment lives in src/commands.js — guild command PUT replaces the
// whole list, so all commands must be deployed together in one payload.

module.exports = { honeypotCommand };
