const { ActivityType } = require("discord.js");
const { log } = require("../../log");
const { forEachState } = require("./state");
const { bubbleActivity } = require("../status");

/**
 * Single owner for the bot's presence. Called after every queue
 * reconciliation (and on ready).
 *
 * Either/or design (2026-10-10): live QA proved that only ONE activity
 * renders on this bot's profile — a second activity in the array is
 * silently dropped (bubble + rich card failed, bubble + plain watching
 * failed the same way). So: idle -> bubble custom status only; watching
 * -> Watching '<displayName> live in #<channel>' only. This matches the
 * original behavior that was known to work.
 */
function refreshWatchStatus(client, config) {
  if (!client.user) return;

  let target = null;
  let channelName = null;
  forEachState((s, guildId) => {
    if (target || s.queue.length === 0 || !s.presenceChannelId) return;
    const head = s.queue[0];
    const guild = client.guilds.cache.get(guildId);
    if (!guild || s.presenceChannelId !== head.channelId) return;
    const member = guild.members.cache.get(head.userId);
    if (member) {
      target = member;
      channelName = guild.channels.cache.get(head.channelId)?.name || "voice";
    }
  });

  // NOTE: do NOT send bubble + watching together — the client only
  // renders the first activity, the second is dropped (proven in QA).
  const activities = target
    ? [{ name: `${target.displayName} live in #${channelName}`, type: ActivityType.Watching }]
    : [bubbleActivity(config.status)];

  if (target) {
    log(`status: watching ${target.displayName} in #${channelName}`);
  } else {
    log(`status: idle, bubble "${config.status.text}"`);
  }

  client.user.setPresence({ status: config.status.mode, activities });
}

module.exports = { refreshWatchStatus };
