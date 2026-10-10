const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require("discord.js");

const helpCommand = new SlashCommandBuilder()
  .setName("help")
  .setDescription("Show what hios-ronda can do")
  .setDMPermission(false);

/** /help — ephemeral overview of every command. No admin needed. */
async function handleHelpCommand(interaction) {
  const embed = new EmbedBuilder()
    .setTitle("🛡️ hios-ronda — Night Patrol Bot")
    .setDescription(
      "I keep watch over the server: I follow anyone who goes live, " +
        "trap spammers with a honeypot, and publish weekly voice patrol reports."
    )
    .setColor(0x2b6cb0)
    .addFields(
      {
        name: "🔴 /watch",
        value: "Go Live watcher — auto-join live streams and notify the server.",
        inline: false,
      },
      {
        name: "🍯 /honeypot",
        value: "Spam trap — punish users who post in the trap channel.",
        inline: false,
      },
      {
        name: "🌙 /begadang",
        value: "Night-owl leaderboard — weekly top 5 voices between 00:00–05:00 WIB.",
        inline: false,
      },
      {
        name: "📋 /rapot",
        value: "Weekly patrol report — server voice totals, most active member, and more.",
        inline: false,
      },
      {
        name: "📡 /github",
        value: "GitHub logs — push/PR/release feed from your repos, posted by HIOS Agent.",
        inline: false,
      }
    )
    .setFooter({ text: "Dashboards are ephemeral and need Administrator (or bot owner)" })
    .setTimestamp();
  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

module.exports = { helpCommand, handleHelpCommand };
