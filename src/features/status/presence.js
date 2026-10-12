const { ActivityType } = require("discord.js");
const { log } = require("../../log");
const { forEachState } = require("../streamwatch/state");

/**
 * Rich presence via raw gateway opcode 3.
 *
 * This is the SINGLE owner of the bot's presence. discord.js helpers
 * (setPresence/setActivity) silently drop details/assets/timestamps, so
 * the activities array is sent as one raw payload.
 * Nothing else in the codebase may call setPresence/setActivity, or the
 * two writers will fight and overwrite each other.
 *
 * Either/or: live QA proved only ONE activity renders on this bot's
 * profile (a 2nd in the array is silently dropped), so idle sends the
 * bubble alone and watching sends the rich card alone.
 */

/** Find who the bot is currently watching (head of a live queue), if anyone. */
function resolveWatchTarget(client) {
  let found = null;
  forEachState((s, guildId) => {
    if (found || s.queue.length === 0 || !s.presenceChannelId) return;
    const head = s.queue[0];
    const guild = client.guilds.cache.get(guildId);
    if (!guild || s.presenceChannelId !== head.channelId) return;
    const member = guild.members.cache.get(head.userId);
    if (member) found = { member, head, guild };
  });
  return found;
}

/** The bubble custom status (same style as hios-bot). Always present. */
function bubbleActivity(statusConfig) {
  if (statusConfig.type === ActivityType.Custom) {
    return { name: "Custom Status", state: statusConfig.text, type: ActivityType.Custom };
  }
  const activity = { name: statusConfig.text, type: statusConfig.type };
  // Streaming activities need a valid stream URL to render properly.
  if (statusConfig.type === ActivityType.Streaming && statusConfig.url) {
    activity.url = statusConfig.url;
  }
  return activity;
}

/** Rich "watching X live" card shown while someone is live.
 * Text-only: art assets never loaded on the card in QA, so images were
 * dropped entirely (2026-10-10). Details also dropped — the channel is
 * already in the name. */
function watchActivity(member, head, guild, applicationId) {
  const channelName = guild.channels.cache.get(head.channelId)?.name || "voice";
  return {
    name: `${member.displayName} live in #${channelName}`,
    type: ActivityType.Watching,
    // Required for the client to render this as a rich card. For bots the
    // user id IS the application id.
    application_id: applicationId,
    state: "come watch together",
    timestamps: { start: head.startedAt }, // elapsed timer since they went live
  };
}

async function applyPresence(client, config) {
  if (!client.user) {
    log("cannot apply presence: client not ready");
    return;
  }

  const statusConfig = config.status;

  // Either/or: live QA proved only ONE activity renders on this bot's
  // profile — a second activity in the array is silently dropped. So when
  // watching, the rich card goes ALONE (no bubble); idle shows the bubble.
  const watch = resolveWatchTarget(client);
  const activities = watch
    ? [watchActivity(watch.member, watch.head, watch.guild, client.user.id)]
    : [bubbleActivity(statusConfig)];

  if (watch) {
    log(`presence: watching ${watch.member.displayName} (rich)`);
  } else {
    log(`presence: idle, bubble "${statusConfig.text}"`);
  }

  const shard = client.ws.shards.first();
  if (!shard) {
    log("cannot apply presence: no shard available");
    return;
  }

  try {
    await shard.send({
      op: 3,
      d: {
        status: statusConfig.mode || "online",
        afk: false,
        since: null,
        activities,
      },
    });
  } catch (err) {
    log.warn(`presence update failed: ${err.message}`);
  }
}

module.exports = { applyPresence };
