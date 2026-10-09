/**
 * Per-guild stream queue state.
 *
 * A bot can only be in one voice channel per guild, so each guild gets
 * its own FIFO queue + presence tracking:
 * {
 *   queue: [{ userId, channelId, startedAt }],  // FIFO, head = served first
 *   presenceChannelId: string | null,           // where our op-4 says we are
 *   leaveTimers: Map<userId, Timeout>,
 * }
 */
const guilds = new Map();

function getState(guildId) {
  let s = guilds.get(guildId);
  if (!s) {
    s = { queue: [], presenceChannelId: null, leaveTimers: new Map() };
    guilds.set(guildId, s);
  }
  return s;
}

function forEachState(fn) {
  for (const [guildId, s] of guilds) fn(s, guildId);
}

function clearLeaveTimer(guildId, userId) {
  const s = guilds.get(guildId);
  if (!s) return;
  const t = s.leaveTimers.get(userId);
  if (t) {
    clearTimeout(t);
    s.leaveTimers.delete(userId);
  }
}

function removeFromQueue(guildId, userId) {
  const s = guilds.get(guildId);
  if (!s) return false;
  const idx = s.queue.findIndex((e) => e.userId === userId);
  if (idx === -1) return false;
  s.queue.splice(idx, 1);
  clearLeaveTimer(guildId, userId);
  return true;
}

function isQueued(guildId, userId) {
  const s = guilds.get(guildId);
  return !!s && s.queue.some((e) => e.userId === userId);
}

module.exports = {
  getState,
  forEachState,
  clearLeaveTimer,
  removeFromQueue,
  isQueued,
};
