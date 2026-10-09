const { ChannelType, PermissionFlagsBits } = require("discord.js");
const { log } = require("../../log");
const { getState } = require("./state");

/**
 * Voice presence via manual gateway opcode 4 (voice state update).
 *
 * This bot is presence-only — it never touches audio — so there is no
 * @discordjs/voice, no UDP, no libsodium. This is exactly what a voice
 * library does for the "join" half, minus the media connection we will
 * never use. Immune to hosts that block UDP voice traffic.
 */
async function setPresence(guild, channelId) {
  const shard = guild.shard;
  if (!shard) {
    log(`no shard for guild ${guild.id}, presence not sent`);
    return false;
  }
  try {
    await shard.send({
      op: 4,
      d: {
        guild_id: guild.id,
        channel_id: channelId, // null = leave
        self_mute: true,
        self_deaf: true,
      },
    });
    getState(guild.id).presenceChannelId = channelId;
    return true;
  } catch (err) {
    log(`presence update failed: ${err.message}`);
    return false;
  }
}

/** Returns the channel if the bot is allowed to join, else null. */
function canJoin(guild, channelId) {
  const channel = guild.channels.cache.get(channelId);
  if (!channel || channel.type !== ChannelType.GuildVoice) return null;
  const me = guild.members.me;
  if (!me) return null;
  if (!channel.joinable) {
    log(`skip #${channel.name}: not joinable (private/full/no perms)`);
    return null;
  }
  if (!channel.permissionsFor(me).has(PermissionFlagsBits.Connect)) {
    log(`skip #${channel.name}: missing Connect permission`);
    return null;
  }
  return channel;
}

module.exports = { setPresence, canJoin };
