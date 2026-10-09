const { ActivityType } = require("discord.js");
const { log } = require("../../log");
const { forEachState } = require("./state");
const { bubbleActivity } = require("../status");

/**
 * Single owner for the bot's presence. Called after every queue
 * reconciliation (and on ready).
 *
 * Plain-text design (2026-10-10): the bubble custom status is ALWAYS
 * shown, plus a Watching activity while someone is live. Rich presence
 * was tried and reverted — the rich card never rendered on the bot's
 * profile in live QA (see docs/rich-presence.md for the full story).
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

  const activities = [bubbleActivity(config.status)];
  if (target) {
    // Renders as e.g. "Watching philip live in #philip's Room".
    activities.push({
      name: `${target.displayName} live in #${channelName}`,
      type: ActivityType.Watching,
    });
    log(`status: watching ${target.displayName} in #${channelName}`);
  } else {
    log(`status: idle, bubble "${config.status.text}"`);
  }

  client.user.setPresence({ status: config.status.mode, activities });
}

module.exports = { refreshWatchStatus };
