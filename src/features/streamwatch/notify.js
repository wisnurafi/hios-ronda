const { ChannelType } = require("discord.js");
const { log } = require("../../log");
const { getWatchConfig, isNotifyEnabled } = require("./store");

async function getNotifyChannel(guild, notifyChannelId) {
  if (!notifyChannelId) return null;
  try {
    const ch = await guild.channels.fetch(notifyChannelId);
    if (ch && ch.type === ChannelType.GuildText && ch.viewable) return ch;
  } catch {
    // channel deleted / no access — stay silent, don't crash
  }
  return null;
}

/** Per-guild dashboard setting wins, env NOTIFY_CHANNEL_ID is the fallback. */
function resolveNotifyChannelId(guild, config) {
  return getWatchConfig(guild.id).notifyChannelId || config.notifyChannelId;
}

/** Fill {mention} / {name} / {channel} placeholders in the message template. */
function renderMessage(template, member, voiceChannel) {
  return template
    .split("{mention}")
    .join(`<@${member.id}>`)
    .split("{name}")
    .join(member.displayName)
    .split("{channel}")
    .join(voiceChannel.name);
}

async function notifyLive(guild, member, voiceChannel, config) {
  if (!isNotifyEnabled(guild.id)) return; // silenced via /watch dashboard
  const ch = await getNotifyChannel(guild, resolveNotifyChannelId(guild, config));
  if (!ch) return;
  try {
    await ch.send({
      content: renderMessage(getWatchConfig(guild.id).notifyMessage, member, voiceChannel),
      allowedMentions: { parse: ["everyone", "users"] },
    });
  } catch (err) {
    log(`notify failed in ${guild.id}:`, err.message);
  }
}

async function notifyEnded(guild, member, config) {
  if (!isNotifyEnabled(guild.id)) return; // silenced via /watch dashboard
  const ch = await getNotifyChannel(guild, resolveNotifyChannelId(guild, config));
  if (!ch) return;
  try {
    await ch.send({ content: `⚫ **${member.displayName}** finished streaming.` });
  } catch (err) {
    log(`notify failed in ${guild.id}:`, err.message);
  }
}

module.exports = { notifyLive, notifyEnded };
