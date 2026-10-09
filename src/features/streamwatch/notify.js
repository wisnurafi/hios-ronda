const { ChannelType } = require("discord.js");
const { log } = require("../../log");
const { isNotifyEnabled } = require("./store");

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

async function notifyLive(guild, member, voiceChannel, notifyChannelId) {
  if (!isNotifyEnabled(guild.id)) return; // silenced via /watch disable
  const ch = await getNotifyChannel(guild, notifyChannelId);
  if (!ch) return;
  try {
    await ch.send({
      content: `🔴 @here <@${member.id}> is live in **#${voiceChannel.name}** — join to watch!`,
      allowedMentions: { parse: ["everyone", "users"] },
    });
  } catch (err) {
    log(`notify failed in ${guild.id}:`, err.message);
  }
}

async function notifyEnded(guild, member, notifyChannelId) {
  if (!isNotifyEnabled(guild.id)) return; // silenced via /watch disable
  const ch = await getNotifyChannel(guild, notifyChannelId);
  if (!ch) return;
  try {
    await ch.send({ content: `⚫ **${member.displayName}** finished streaming.` });
  } catch (err) {
    log(`notify failed in ${guild.id}:`, err.message);
  }
}

module.exports = { notifyLive, notifyEnded };
