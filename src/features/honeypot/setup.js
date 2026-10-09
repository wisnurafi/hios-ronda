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
const { ensureHoneypotEmojis } = require("./emojis");

const HONEYPOT_PNG = path.join(__dirname, "assets", "honeypot.png");
const DEFAULT_CHANNEL_NAME = "❗do-not-type-here❗";

function counterLabel(cfg) {
  const noun = cfg.action === "ban" ? "Bans" : "Catches";
  return `${noun}: ${cfg.catches}`;
}

// Bolded punishment phrase, follows the configured action.
function actionPhrase(action) {
  return (
    {
      ban: "**an immediate ban**",
      kick: "**an immediate kick**",
      timeout: "**an immediate softban**",
    }[action] || "**an immediate ban**"
  );
}

/**
 * Render the warning description. Supports the {action} placeholder;
 * also upgrades the legacy hardcoded "an immediate ban" text from
 * earlier versions.
 */
function renderWarningDescription(cfg) {
  const phrase = actionPhrase(cfg.action);
  const desc = cfg.warningDescription || "";
  if (desc.includes("{action}")) return desc.replaceAll("{action}", phrase);
  return desc.replace("an immediate ban", phrase);
}

/** Build the warning embed + counter button (mirrors the reference). */
function buildWarning(cfg) {
  const attachment = new AttachmentBuilder(HONEYPOT_PNG, { name: "honeypot.png" });
  const embed = new EmbedBuilder()
    .setTitle(cfg.warningTitle)
    .setDescription(renderWarningDescription(cfg))
    .setThumbnail("attachment://honeypot.png")
    .setTimestamp();
  const counterBtn = new ButtonBuilder()
    .setCustomId("honeypot_counter")
    .setLabel(counterLabel(cfg))
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(true);
  const honey = cfg.emojis?.honey;
  if (honey?.id) {
    counterBtn.setEmoji({ id: honey.id, name: honey.name });
  } else {
    counterBtn.setLabel(`🍯 ${counterLabel(cfg)}`);
  }
  const row = new ActionRowBuilder().addComponents(counterBtn);
  return { attachment, embed, row };
}

/**
 * Create the honeypot channel (if needed) and post/refresh the warning.
 * Returns the channel.
 */
async function setupHoneypot(guild, cfg) {
  const me = guild.members.me;

  // clean flat-white icons as custom emojis (fallback: unicode)
  await ensureHoneypotEmojis(guild);
  cfg = getConfig(guild.id);

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
    const { attachment, embed, row } = buildWarning(cfg);
    // re-upload the thumbnail too so art updates (e.g. new pot image) apply
    await message.edit({ embeds: [embed], components: [row], files: [attachment] });
  } catch (err) {
    log(`counter refresh failed: ${err.message}`);
  }
}

/**
 * Self-healing: rebuild local config if data/honeypot.json was wiped
 * (e.g. ephemeral disk on free hosting) by rediscovering the honeypot
 * channel by name and the warning message by its embed title.
 * Also recovers the catch counter from the button label.
 */
async function recoverHoneypot(guild) {
  const { getConfig, updateConfig } = require("./store");
  const cfg = getConfig(guild.id);

  const knownChannel = cfg.honeypotChannelId
    ? guild.channels.cache.get(cfg.honeypotChannelId)
    : null;
  if (knownChannel) return false; // config intact

  const channel = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildText && c.name === DEFAULT_CHANNEL_NAME
  );
  if (!channel) return false;

  let messageId = null;
  let catches = cfg.catches || 0;
  try {
    const messages = await channel.messages.fetch({ limit: 20 });
    const me = guild.members.me?.id;
    const warning = messages.find(
      (m) =>
        m.author.id === me &&
        m.embeds.some((e) => e.title === cfg.warningTitle || e.title === defaultsTitle())
    );
    if (warning) {
      messageId = warning.id;
      const label = warning.components[0]?.components[0]?.label || "";
      const m = label.match(/(?:Bans|Catches):\s*(\d+)/i);
      if (m) catches = parseInt(m[1], 10);
    }
  } catch (err) {
    log(`honeypot recovery scan failed: ${err.message}`);
  }

  updateConfig(guild.id, {
    honeypotChannelId: channel.id,
    honeypotMessageId: messageId,
    catches,
  });
  log(`recovered honeypot state in ${guild.name}: #${channel.name} (catches: ${catches})`);
  return true;
}

function defaultsTitle() {
  return "DO NOT SEND MESSAGES IN THIS CHANNEL";
}

module.exports = { setupHoneypot, refreshCounter, recoverHoneypot, buildWarning, DEFAULT_CHANNEL_NAME };
