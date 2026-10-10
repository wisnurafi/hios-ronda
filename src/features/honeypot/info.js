/**
 * The public "Info" button on the honeypot warning message.
 *
 * Anyone can click it — it replies with an ephemeral "What is a Honeypot?"
 * explainer (HIOS Agent branding) plus this server's stats.
 */

const path = require("path");
const { EmbedBuilder, AttachmentBuilder, MessageFlags } = require("discord.js");
const { log } = require("../../log");
const { getConfig } = require("./store");

const HONEYPOT_PNG = path.join(__dirname, "assets", "honeypot.png");

const ACTION_PHRASE = { ban: "banning them", kick: "kicking them", timeout: "timing them out" };

/** Info embed + thumbnail attachment. Stats are read fresh at click time. */
function buildInfoEmbed(guild, cfg) {
  const attachment = new AttachmentBuilder(HONEYPOT_PNG, { name: "honeypot.png" });
  const channelMention = cfg.honeypotChannelId ? `<#${cfg.honeypotChannelId}>` : "#honeypot";
  const punish = ACTION_PHRASE[cfg.action] || "banning them";
  const embed = new EmbedBuilder()
    .setTitle("🍯 HIOS Agent — Honeypot")
    .setDescription(
      "**What is a Honeypot?**\n" +
        "A honeypot is a channel used to detect unwanted activity.\n\n" +
        "HIOS Agent watches a channel that is visible to members but not intended for normal use. " +
        "Spam bots and compromised accounts may send messages to it while scanning or posting across a server.\n\n" +
        `When a message is sent to the honeypot channel, HIOS Agent can automatically remove the user by ${punish}.`
    )
    .addFields({
      name: "Server Stats",
      value: `Total moderated in this server: **${cfg.catches}**\n• ${channelMention}: **${cfg.catches}**`,
    })
    .setThumbnail("attachment://honeypot.png")
    .setTimestamp();
  return { attachment, embed };
}

async function handleInfoButton(interaction) {
  try {
    const guild = interaction.guild;
    if (!guild) return;
    const cfg = getConfig(guild.id);
    const { attachment, embed } = buildInfoEmbed(guild, cfg);
    await interaction.reply({
      embeds: [embed],
      files: [attachment],
      flags: MessageFlags.Ephemeral,
    });
  } catch (err) {
    log.warn("honeypot info button error:", err.message);
  }
}

module.exports = { buildInfoEmbed, handleInfoButton };
