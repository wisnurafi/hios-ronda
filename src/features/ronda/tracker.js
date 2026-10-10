/**
 * Voice session tracker.
 *
 * Hooks into VoiceStateUpdate and records finished sessions to Postgres:
 * total minutes, night minutes (00:00-05:00 WIB), per-channel minutes.
 * Bots are excluded. Attribute a session to the week (WIB) it ENDED in.
 */

const { log } = require("../../log");
const { isEnabled, recordSession } = require("./db");
const { weekStartOf, nightMinutesBetween, minutesBetween } = require("./time");

// key: `${guildId}:${userId}` -> { channelId, joinedAt }
const sessions = new Map();

const key = (guildId, userId) => `${guildId}:${userId}`;

function isBot(member) {
  try {
    return member?.user?.bot === true;
  } catch {
    return false;
  }
}

async function endSession(guildId, userId) {
  const k = key(guildId, userId);
  const s = sessions.get(k);
  sessions.delete(k);
  if (!s) return;
  const endedAt = Date.now();
  const minutes = minutesBetween(s.joinedAt, endedAt);
  if (minutes <= 0) return; // ignore sub-minute blips
  const nightMinutes = nightMinutesBetween(s.joinedAt, endedAt);
  await recordSession({
    guildId,
    userId,
    weekStart: weekStartOf(endedAt),
    minutes,
    nightMinutes,
    channelId: s.channelId,
  });
  log.debug(`ronda: session recorded ${userId}: ${minutes}m (${nightMinutes}m night)`);
}

function startSession(guildId, userId, channelId) {
  sessions.set(key(guildId, userId), { channelId, joinedAt: Date.now() });
}

/**
 * Call on every VoiceStateUpdate. Safe to run alongside other features'
 * listeners — this one never replies or mutates Discord state.
 */
async function handleVoiceStateUpdate(oldState, newState) {
  if (!isEnabled()) return;
  const member = newState.member || oldState.member;
  if (!member || isBot(member)) return;
  const guildId = (newState.guild || oldState.guild)?.id;
  const userId = member.id;
  if (!guildId || !userId) return;

  const oldChannelId = oldState.channelId;
  const newChannelId = newState.channelId;

  try {
    if (oldChannelId && !newChannelId) {
      await endSession(guildId, userId); // left voice
    } else if (!oldChannelId && newChannelId) {
      startSession(guildId, userId, newChannelId); // joined voice
    } else if (oldChannelId && newChannelId && oldChannelId !== newChannelId) {
      await endSession(guildId, userId); // moved: close old, open new
      startSession(guildId, userId, newChannelId);
    }
    // mute/deafen/stream toggles: session continues untouched
  } catch (err) {
    log.warn("ronda tracker error:", err.message);
  }
}

/**
 * Seed in-progress sessions at startup so a restart doesn't silently drop
 * the pre-restart portion of active sessions.
 */
async function seedFromGuilds(client) {
  if (!isEnabled()) return;
  for (const [, guild] of client.guilds.cache) {
    try {
      const states = guild.voiceStates?.cache;
      if (!states) continue;
      for (const [, vs] of states) {
        const userId = vs.id;
        if (!userId) continue;
        let member = vs.member;
        if (!member) {
          // REST fetch works without the privileged members intent.
          member = await guild.members.fetch(userId).catch(() => null);
        }
        if (!member || isBot(member) || !vs.channelId) continue;
        const k = key(guild.id, userId);
        if (!sessions.has(k)) {
          sessions.set(k, { channelId: vs.channelId, joinedAt: Date.now() });
        }
      }
    } catch (err) {
      log.warn(`ronda tracker seed failed for ${guild.id}:`, err.message);
    }
  }
  if (sessions.size > 0) log(`ronda tracker: seeded ${sessions.size} active session(s)`);
}

module.exports = { handleVoiceStateUpdate, seedFromGuilds };
