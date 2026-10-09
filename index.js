/**
 * hios-ronda — patrol bot for Go Live streams.
 *
 * Behavior (locked design):
 * - Watches voiceStateUpdate for self_stream=true in ANY voice channel.
 * - FIFO queue per guild: whoever goes live first gets the bot (bot is single).
 * - On stream stop: 5s grace period (anti-flap), then leave and serve the
 *   next streamer in the queue who is still live.
 * - Private/locked channel the bot can't join -> skipped, next in queue.
 * - Streamer moves channel mid-live -> bot leaves, does NOT follow.
 *   Only a fresh Go Live event re-queues them.
 * - Streamer stops but stays in voice -> bot leaves (after grace).
 * - Bot never blocks temp-channel auto-delete: it leaves as soon as the
 *   stream is over, so it is never the last member keeping a channel alive.
 * - Sends a @here notification (mentioning the streamer) to the configured
 *   public chat on live start AND on stream end.
 *
 * Presence method: manual gateway opcode 4 (voice state update).
 * This bot is presence-only — it never touches audio — so there is no
 * @discordjs/voice, no UDP, no libsodium. That makes it immune to hosts
 * that block UDP voice traffic (the classic "bot joins then leaves"
 * timeout loop). Trade-off: the bot cannot send or receive any audio.
 */

const {
  Client,
  GatewayIntentBits,
  Events,
  PermissionFlagsBits,
  ChannelType,
} = require("discord.js");
const config = require("./src/config");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

/**
 * Per-guild state. A bot can only be in one voice channel per guild,
 * so each guild gets its own queue + presence tracking.
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

const log = (...args) => console.log("[ronda]", ...args);

/* ------------------------------------------------------------------ */
/* presence (manual gateway opcode 4 — no audio, no UDP)                */
/* ------------------------------------------------------------------ */

/**
 * Join/leave a voice channel by sending a raw voice-state update.
 * This is exactly what a voice library does for the "join" half,
 * minus the media connection we will never use.
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
        channel_id: channelId,
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

/* ------------------------------------------------------------------ */
/* notifications                                                       */
/* ------------------------------------------------------------------ */

async function getNotifyChannel(guild) {
  if (!config.notifyChannelId) return null;
  try {
    const ch = await guild.channels.fetch(config.notifyChannelId);
    if (ch && ch.type === ChannelType.GuildText && ch.viewable) return ch;
  } catch {
    // channel deleted / no access — stay silent, don't crash
  }
  return null;
}

async function notifyLive(guild, member, voiceChannel) {
  const ch = await getNotifyChannel(guild);
  if (!ch) return;
  try {
    await ch.send({
      content: `🔴 @here <@${member.id}> lagi live di **#${voiceChannel.name}** — join buat nonton!`,
      allowedMentions: { parse: ["everyone", "users"] },
    });
  } catch (err) {
    log(`notify failed in ${guild.id}:`, err.message);
  }
}

async function notifyEnded(guild, member) {
  const ch = await getNotifyChannel(guild);
  if (!ch) return;
  try {
    await ch.send({ content: `⚫ **${member.displayName}** selesai streaming.` });
  } catch (err) {
    log(`notify failed in ${guild.id}:`, err.message);
  }
}

/* ------------------------------------------------------------------ */
/* queue + reconciliation                                              */
/* ------------------------------------------------------------------ */

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

function clearLeaveTimer(guildId, userId) {
  const s = guilds.get(guildId);
  if (!s) return;
  const t = s.leaveTimers.get(userId);
  if (t) {
    clearTimeout(t);
    s.leaveTimers.delete(userId);
  }
}

function removeFromQueue(guild, userId) {
  const s = getState(guild.id);
  const idx = s.queue.findIndex((e) => e.userId === userId);
  if (idx === -1) return false;
  s.queue.splice(idx, 1);
  clearLeaveTimer(guild.id, userId);
  return true;
}

/* ------------------------------------------------------------------ */
/* events                                                              */
/* ------------------------------------------------------------------ */

client.once(Events.ClientReady, async (c) => {
  log(`online as ${c.user.tag}`);
  // Fresh identify clears voice states server-side, so re-assert presence
  // for every guild that still has a live queue.
  for (const [guildId, s] of guilds) {
    s.presenceChannelId = null;
    const guild = c.guilds.cache.get(guildId);
    if (guild && s.queue.length > 0) await reconcile(guild);
  }
});

client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  try {
    await handleVoiceStateUpdate(oldState, newState);
  } catch (err) {
    log("voiceStateUpdate handler error:", err.message);
  }
});

async function handleVoiceStateUpdate(oldState, newState) {
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
  //    (streaming stayed true across the move, so this is not a fresh live)
  if (wasStreaming && isStreaming && oldChannelId !== newChannelId) {
    log(`${member.displayName} moved channel mid-live -> leaving, not following`);
    if (removeFromQueue(guild, userId)) await reconcile(guild);
    return;
  }

  // 2) fresh Go Live
  if (!wasStreaming && isStreaming && newChannelId) {
    clearLeaveTimer(guild.id, userId); // cancel a pending grace leave
    const already = s.queue.some((e) => e.userId === userId);
    if (!already) {
      s.queue.push({ userId, channelId: newChannelId, startedAt: Date.now() });
      // keep FIFO by live-start order
      s.queue.sort((a, b) => a.startedAt - b.startedAt);
      log(`${member.displayName} went live in #${newState.channel.name} (queue: ${s.queue.length})`);
      await notifyLive(guild, member, newState.channel);
    } else {
      // re-live during grace: refresh channel in case it changed
      const entry = s.queue.find((e) => e.userId === userId);
      entry.channelId = newChannelId;
      entry.startedAt = Date.now();
    }
    await reconcile(guild);
    return;
  }

  // 3) stream stopped (or user left voice entirely)
  const stoppedStreaming = wasStreaming && !isStreaming;
  const leftVoice = !newChannelId && oldChannelId;
  if (stoppedStreaming || leftVoice) {
    if (!s.queue.some((e) => e.userId === userId)) return;
    if (leftVoice) {
      // gone from voice: no grace needed, drop immediately
      log(`${member.displayName} left voice -> removed from queue`);
      removeFromQueue(guild, userId);
      await notifyEnded(guild, member);
      await reconcile(guild);
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
          return; // live again — stay
        }
        if (removeFromQueue(guild, userId)) {
          log(`${member.displayName} grace expired -> leaving`);
          await notifyEnded(guild, member);
          await reconcile(guild);
        }
      } catch (err) {
        log("grace timer error:", err.message);
      }
    }, config.leaveGraceMs);
    s.leaveTimers.set(userId, timer);
  }
}

process.on("unhandledRejection", (err) => log("unhandled rejection:", err?.message || err));
process.on("SIGINT", () => {
  log("shutting down");
  client.destroy();
  process.exit(0);
});

client.login(config.token);
