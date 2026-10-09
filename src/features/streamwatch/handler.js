const { log } = require("../../log");
const { getState, removeFromQueue, isQueued } = require("./state");
const { reconcile } = require("./reconcile");
const { notifyLive, notifyEnded } = require("./notify");
const { refreshWatchStatus } = require("./watchstatus");

/**
 * Core streamwatch logic. Rules (locked design):
 * - Fresh Go Live in any channel -> enqueue (FIFO) + notify + reconcile.
 * - Move channel mid-live -> leave, do NOT follow.
 * - Stop streaming -> grace period, then leave + notify end + serve next.
 * - Leave voice entirely -> drop immediately + notify end.
 */
async function handleVoiceStateUpdate(oldState, newState, client, config) {
  const guild = newState.guild ?? oldState.guild;
  if (!guild) return;

  const member = newState.member ?? oldState.member;
  if (!member || member.user.bot) return; // never track bots (incl. ourselves)

  const userId = member.id;
  const wasStreaming = !!oldState.streaming;
  const isStreaming = !!newState.streaming;
  const oldChannelId = oldState.channelId;
  const newChannelId = newState.channelId;
  const s = getState(guild.id);

  // 1) moved channel mid-live -> leave, do NOT follow.
  if (wasStreaming && isStreaming && oldChannelId !== newChannelId) {
    log(`${member.displayName} moved channel mid-live -> leaving, not following`);
    if (removeFromQueue(guild.id, userId)) await reconcile(guild);
    refreshWatchStatus(client, config);
    return;
  }

  // 2) fresh Go Live
  if (!wasStreaming && isStreaming && newChannelId) {
    const { clearLeaveTimer } = require("./state");
    clearLeaveTimer(guild.id, userId); // cancel a pending grace leave
    if (!isQueued(guild.id, userId)) {
      s.queue.push({ userId, channelId: newChannelId, startedAt: Date.now() });
      s.queue.sort((a, b) => a.startedAt - b.startedAt); // FIFO by live-start
      log(`${member.displayName} went live in #${newState.channel.name} (queue: ${s.queue.length})`);
      await notifyLive(guild, member, newState.channel, config.notifyChannelId);
    } else {
      // re-live during grace: refresh channel in case it changed
      const entry = s.queue.find((e) => e.userId === userId);
      entry.channelId = newChannelId;
      entry.startedAt = Date.now();
    }
    await reconcile(guild);
    refreshWatchStatus(client, config);
    return;
  }

  // 3) stream stopped (or user left voice entirely)
  const stoppedStreaming = wasStreaming && !isStreaming;
  const leftVoice = !newChannelId && oldChannelId;
  if (stoppedStreaming || leftVoice) {
    if (!isQueued(guild.id, userId)) return;
    if (leftVoice) {
      log(`${member.displayName} left voice -> removed from queue`);
      removeFromQueue(guild.id, userId);
      await notifyEnded(guild, member, config.notifyChannelId);
      await reconcile(guild);
    refreshWatchStatus(client, config);
      return;
    }
    // stopped streaming but still in voice: grace period (anti-flap)
    if (s.leaveTimers.has(userId)) return; // timer already running
    log(`${member.displayName} stopped streaming -> grace ${config.leaveGraceMs}ms`);
    const timer = setTimeout(async () => {
      s.leaveTimers.delete(userId);
      try {
        const st = guild.members.cache.get(userId)?.voice;
        if (st && st.streaming) {
          log(`${member.displayName} is live again, grace cancelled`);
          return;
        }
        if (removeFromQueue(guild.id, userId)) {
          log(`${member.displayName} grace expired -> leaving`);
          await notifyEnded(guild, member, config.notifyChannelId);
          await reconcile(guild);
    refreshWatchStatus(client, config);
        }
      } catch (err) {
        log("grace timer error:", err.message);
      }
    }, config.leaveGraceMs);
    s.leaveTimers.set(userId, timer);
  }
}

module.exports = { handleVoiceStateUpdate };
