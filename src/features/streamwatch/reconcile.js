const { log } = require("../../log");
const { getState, clearLeaveTimer } = require("./state");
const { setPresence, canJoin } = require("./presence");

/**
 * Make reality match the queue head: our presence should be in the voice
 * channel of queue[0], and nowhere else. Skips entries we can't join.
 */
async function reconcile(guild) {
  const s = getState(guild.id);

  while (s.queue.length > 0) {
    const head = s.queue[0];
    const channel = canJoin(guild, head.channelId);
    if (!channel) {
      s.queue.shift(); // can't join -> drop, try next
      clearLeaveTimer(guild.id, head.userId);
      continue;
    }
    if (s.presenceChannelId === channel.id) return; // already there
    const ok = await setPresence(guild, channel.id);
    if (ok) {
      const member = guild.members.cache.get(head.userId);
      log(`now watching ${member ? member.displayName : head.userId} in #${channel.name}`);
    }
    return;
  }

  // queue empty -> make sure we're out
  if (s.presenceChannelId) {
    await setPresence(guild, null);
    log("queue empty -> left voice");
  }
}

module.exports = { reconcile };
