const path = require("path");
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  ChannelType,
  PermissionFlagsBits,
} = require("discord.js");
const { log } = require("../../log");
const { getConfig, updateConfig } = require("./store");

const HONEYPOT_PNG = path.join(__dirname, "assets", "honeypot.png");
const DEFAULT_CHANNEL_NAME = "❗do-not-type-here❗";

function counterLabel(cfg) {
  const noun = cfg.action === "ban" ? "Bans" : "Catches";
  return `🍯 ${noun}: ${cfg.catches}`;
}

/** Build the warning embed + counter button (mirrors the reference). */
function buildWarning(cfg) {
  const attachment = new AttachmentBuilder(HONEYPOT_PNG, { name: "honeypot.png" });
  const embed = new EmbedBuilder()
    .setTitle(cfg.warningTitle)
    .setDescription(cfg.warningDescription)
    .setThumbnail("attachment://honeypot.png")
    .setTimestamp();
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("honeypot_counter")
      .setLabel(counterLabel(cfg))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
  );
  return { attachment, embed, row };
}

/**
 * Create the honeypot channel (if needed) and post/refresh the warning.
 * Returns the channel.
 */
async function setupHoneypot(guild, cfg) {
  const me = guild.members.me;

  // 1) channel
  let channel = cfg.honeypotChannelId
    ? guild.channels.cache.get(cfg.honeypotChannelId) ?? null
    : null;
  if (!channel) {
    if (!me.permissions.has(PermissionFlagsBits.ManageChannels)) {
      throw new Error("I need the Manage Channels permission to create the honeypot channel.");
    }
    channel = await guild.channels.create({
      name: DEFAULT_CHANNEL_NAME,
      type: ChannelType.GuildText,
      topic: "Honeypot — do not send messages here.",
      reason: "hios-ronda honeypot setup",
    });
    log(`created honeypot channel #${channel.name} in ${guild.id}`);
  }

  // 2) warning message (reuse + edit if we already posted one)
  const { attachment, embed, row } = buildWarning(cfg);
  let message = null;
  if (cfg.honeypotMessageId) {
    try {
      message = await channel.messages.fetch(cfg.honeypotMessageId);
      await message.edit({ embeds: [embed], components: [row] });
    } catch {
      message = null;
    }
  }
  if (!message) {
    message = await channel.send({
      embeds: [embed],
      components: [row],
      files: [attachment],
    });
  }

  updateConfig(guild.id, {
    honeypotChannelId: channel.id,
    honeypotMessageId: message.id,
  });
  return channel;
}

/** Refresh the counter button on the warning message. */
async function refreshCounter(guild, cfg) {
  if (!cfg.honeypotChannelId || !cfg.honeypotMessageId) return;
  try {
    const channel = await guild.channels.fetch(cfg.honeypotChannelId);
    if (!channel?.isTextBased()) return;
    const message = await channel.messages.fetch(cfg.honeypotMessageId);
    const { embed, row } = buildWarning(cfg);
    await message.edit({ embeds: [embed], components: [row] });
  } catch (err) {
    log(`counter refresh failed: ${err.message}`);
  }
}

module.exports = { setupHoneypot, refreshCounter, buildWarning, DEFAULT_CHANNEL_NAME };
