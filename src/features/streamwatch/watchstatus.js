const { ActivityType } = require("discord.js");
const { log } = require("../../log");
const { forEachState } = require("./state");
const { applyCustomStatus } = require("../status");

/**
 * Dynamic status: while the bot is watching someone, show
 * "Watching <name> live"; otherwise fall back to the configured
 * custom status. Called after every queue reconciliation.
 */
function refreshWatchStatus(client, config) {
  if (!client.user) return;

  let target = null;
  forEachState((s, guildId) => {
    if (target || s.queue.length === 0 || !s.presenceChannelId) return;
    const head = s.queue[0];
    const guild = client.guilds.cache.get(guildId);
    if (!guild || s.presenceChannelId !== head.channelId) return;
    const member = guild.members.cache.get(head.userId);
    if (member) target = member;
  });

  if (target) {
    client.user.setActivity(`${target.displayName} live`, {
      type: ActivityType.Watching,
    });
    log(`status: watching ${target.displayName}`);
  } else {
    applyCustomStatus(client, config.status);
  }
}

module.exports = { refreshWatchStatus };
