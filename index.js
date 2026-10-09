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
 * - Auto-reconnect if the voice connection drops unexpectedly.
 * - Sends a @here notification to the configured public chat on live start.
 */

const {
  Client,
  GatewayIntentBits,
  Events,
  PermissionFlagsBits,
  ChannelType,
} = require("discord.js");
const {
  joinVoiceChannel,
  getVoiceConnection,
  VoiceConnectionStatus,
  entersState,
} = require("@discordjs/voice");
const config = require("./src/config");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

/**
 * Per-guild state. A bot can only be in one voice channel per guild,
 * so each guild gets its own queue + connection tracking.
 * {
 *   queue: [{ userId, channelId, startedAt }],  // FIFO, head = served first
 *   currentKey: string | null,                  // queue key currently served
 *   leaveTimers: Map<userId, Timeout>,
 * }
 */
const guilds = new Map();

function getState(guildId) {
  let s = guilds.get(guildId);
  if (!s) {
    s = { queue: [], currentKey: null, leaveTimers: new Map() };
    guilds.set(guildId, s);
  }
  return s;
}

const keyOf = (entry) => `${entry.guildId}:${entry.userId}`;
const log = (...args) => console.log("[ronda]", ...args);

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
      content: `🔴 @here **${member.displayName}** lagi live di **#${voiceChannel.name}** — join buat nonton!`,
      allowedMentions: { parse: ["everyone"] },
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
/* voice connection                                                    */
/* ------------------------------------------------------------------ */

function leaveVoice(guildId) {
  const conn = getVoiceConnection(guildId);
  if (conn) {
    try {
      conn.destroy();
    } catch {
      // already gone
    }
  }
  const s = guilds.get(guildId);
  if (s) s.currentKey = null;
}

/**
 * Try to join a voice channel. Returns true on success.
 * Returns false (without throwing) when the bot simply can't join —
 * caller then skips to the next streamer in the queue.
 */
async function tryJoin(guild, channelId) {
  const channel = guild.channels.cache.get(channelId);
  if (!channel || channel.type !== ChannelType.GuildVoice) return false;

  const me = guild.members.me;
  if (!me) return false;
  if (!channel.joinable) {
    log(`skip ${channel.name}: not joinable (private/full/no perms)`);
    return false;
  }
  if (!channel.permissionsFor(me).has(PermissionFlagsBits.Connect)) {
    log(`skip ${channel.name}: missing Connect permission`);
    return false;
  }

  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: true,
    selfMute: true,
  });

  // Guard against unexpected drops: if the connection dies while this
  // streamer is still the head of the queue, try to get back in.
  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
      ]);
      // reconnected on its own — nothing to do
    } catch {
      const s = guilds.get(guild.id);
      const head = s && s.queue[0];
      const connNow = getVoiceConnection(guild.id);
      if (connNow && connNow.state.status === VoiceConnectionStatus.Destroyed) return;
      try {
        connection.destroy();
      } catch {
        // ignore
      }
      if (s) s.currentKey = null;
      if (head) {
        log(`connection lost while serving ${head.userId}, re-queueing head`);
        await reconcile(guild); // rejoin if the streamer is still live
      }
    }
  });

  connection.on("error", (err) => log(`voice connection error: ${err.message}`));

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
    return true;
  } catch {
    log(`join ${channel.name} timed out`);
    try {
      connection.destroy();
    } catch {
      // ignore
    }
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* queue + reconciliation                                              */
/* ------------------------------------------------------------------ */

/**
 * Make reality match the queue head: the bot should be in the voice
 * channel of queue[0], and nowhere else. Skips entries it can't join.
 */
async function reconcile(guild) {
  const s = getState(guild.id);
  const head = s.queue[0] || null;
  const headKey = head ? `${guild.id}:${head.userId}` : null;

  if (headKey && headKey === s.currentKey) return; // already serving

  // leave wherever we are
  if (s.currentKey) leaveVoice(guild.id);

  // walk the queue until someone is joinable
  while (s.queue.length > 0) {
    const next = s.queue[0];
    const ok = await tryJoin(guild, next.channelId);
    if (ok) {
      s.currentKey = `${guild.id}:${next.userId}`;
      const channel = guild.channels.cache.get(next.channelId);
      const member = guild.members.cache.get(next.userId);
      log(`now watching ${member ? member.displayName : next.userId} in #${channel ? channel.name : next.channelId}`);
      if (member && channel) await notifyLive(guild, member, channel);
      return;
    }
    // can't join -> drop and try the next one
    s.queue.shift();
    clearLeaveTimer(guild.id, next.userId);
  }

  s.currentKey = null;
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

client.once(Events.ClientReady, (c) => {
  log(`online as ${c.user.tag}`);
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
        const st = newState.guild?.members.cache.get(userId)?.voice;
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
