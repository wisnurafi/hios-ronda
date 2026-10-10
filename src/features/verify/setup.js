/**
 * Verify message setup: post/refresh the public embed + Verify button.
 *
 * The message lives in the configured channel and is edited in place on
 * every refresh (dashboard edits, startup) so the channel stays clean.
 * The shield art is attached as the embed thumbnail (same pattern as the
 * honeypot warning); the Verify button carries the checkmark custom emoji.
 */

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
const { ensureVerifyEmojis } = require("./emojis");

const SHIELD_PNG = path.join(__dirname, "assets", "shield.png");
const VERIFY_BUTTON_ID = "verify_button";
const DEFAULT_CHANNEL_NAME = "verify";

function buildVerifyMessage(cfg) {
  const attachment = new AttachmentBuilder(SHIELD_PNG, { name: "shield.png" });
  const embed = new EmbedBuilder()
    .setTitle(cfg.embedTitle)
    .setDescription(cfg.embedDescription)
    .setThumbnail("attachment://shield.png")
    .setColor(0x2f9e44)
    .setTimestamp();

  const verifyBtn = new ButtonBuilder()
    .setCustomId(VERIFY_BUTTON_ID)
    .setLabel(cfg.buttonLabel || "Verify")
    .setStyle(ButtonStyle.Success)
    .setDisabled(!cfg.enabled);
  const check = cfg.emojis?.check;
  if (check?.id) {
    verifyBtn.setEmoji({ id: check.id, name: check.name });
  } else {
    verifyBtn.setEmoji("✅");
  }

  const row = new ActionRowBuilder().addComponents(verifyBtn);
  return { attachment, embed, row };
}

/**
 * Post (or refresh in place) the verify message in the configured channel.
 * Throws when no channel is configured or the bot can't write there.
 * Returns the channel.
 */
async function setupVerify(guild, cfg) {
  await ensureVerifyEmojis(guild);
  cfg = getConfig(guild.id);

  let channel = cfg.verifyChannelId
    ? await guild.channels.fetch(cfg.verifyChannelId).catch(() => null)
    : null;
  if (!channel?.isTextBased()) {
    throw new Error("Set a verify channel first (dashboard → Set Channel).");
  }

  const { attachment, embed, row } = buildVerifyMessage(cfg);
  let message = null;
  if (cfg.verifyMessageId) {
    try {
      message = await channel.messages.fetch(cfg.verifyMessageId);
      // re-attach the shield so art updates apply, like the honeypot counter refresh
      await message.edit({ embeds: [embed], components: [row], files: [attachment] });
    } catch {
      message = null;
    }
  }
  if (!message) {
    message = await channel.send({ embeds: [embed], components: [row], files: [attachment] });
  }

  updateConfig(guild.id, {
    verifyChannelId: channel.id,
    verifyMessageId: message.id,
  });
  log(`verify message posted/refreshed in #${channel.name} (${guild.id})`);
  return channel;
}

/** Create a #verify text channel (dashboard convenience). */
async function createVerifyChannel(guild) {
  const me = guild.members.me;
  if (!me.permissions.has(PermissionFlagsBits.ManageChannels)) {
    throw new Error("I need the Manage Channels permission to create the verify channel.");
  }
  const channel = await guild.channels.create({
    name: DEFAULT_CHANNEL_NAME,
    type: ChannelType.GuildText,
    topic: "Click Verify to get access to the rest of the server.",
    reason: "hios-ronda verify setup",
  });
  // Clean up the bot's old verify message if it lived elsewhere.
  const cfg = getConfig(guild.id);
  if (cfg.verifyMessageId && cfg.verifyChannelId !== channel.id) {
    try {
      const oldChannel = await guild.channels.fetch(cfg.verifyChannelId).catch(() => null);
      const oldMsg = oldChannel?.isTextBased()
        ? await oldChannel.messages.fetch(cfg.verifyMessageId).catch(() => null)
        : null;
      if (oldMsg?.author.id === me.id) await oldMsg.delete().catch(() => {});
    } catch {}
    updateConfig(guild.id, { verifyMessageId: null });
  }
  updateConfig(guild.id, { verifyChannelId: channel.id });
  log(`created verify channel #${channel.name} in ${guild.id}`);
  return channel;
}

/** Refresh the posted message (called on dashboard edits + startup). No-op when never posted. */
async function refreshVerifyMessage(guild, cfg) {
  if (!cfg.verifyChannelId || !cfg.verifyMessageId) return;
  try {
    await ensureVerifyEmojis(guild);
    const fresh = getConfig(guild.id);
    const channel = await guild.channels.fetch(fresh.verifyChannelId).catch(() => null);
    if (!channel?.isTextBased()) return;
    const message = await channel.messages.fetch(fresh.verifyMessageId).catch(() => null);
    if (!message) return;
    const { attachment, embed, row } = buildVerifyMessage(fresh);
    await message.edit({ embeds: [embed], components: [row], files: [attachment] });
  } catch (err) {
    log.warn(`verify message refresh failed: ${err.message}`);
  }
}

module.exports = {
  setupVerify,
  createVerifyChannel,
  refreshVerifyMessage,
  buildVerifyMessage,
  VERIFY_BUTTON_ID,
};
