const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { log } = require("../../log");
const { setNotifyEnabled } = require("./store");

const watchCommand = new SlashCommandBuilder()
  .setName("watch")
  .setDescription("Toggle the Go Live notification messages")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setDMPermission(false)
  .addSubcommand((sub) =>
    sub.setName("enable").setDescription("Turn on Go Live notification messages")
  )
  .addSubcommand((sub) =>
    sub.setName("disable").setDescription("Turn off Go Live notification messages")
  );

/** /watch enable|disable — ephemeral confirmation, per-guild setting. */
async function handleWatchCommand(interaction) {
  const enabled = interaction.options.getSubcommand() === "enable";
  setNotifyEnabled(interaction.guildId, enabled);
  log(`watch notifications ${enabled ? "enabled" : "disabled"} in ${interaction.guild.name}`);
  await interaction.reply({
    content: enabled
      ? "🔴 Go Live notification messages **enabled** — I'll announce new streams."
      : "⚫ Go Live notification messages **disabled** — I'll stay silent.",
    ephemeral: true,
  });
}

module.exports = { watchCommand, handleWatchCommand };
