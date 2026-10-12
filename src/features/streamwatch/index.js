const { Events } = require("discord.js");
const {
  log,
  runWithTraceContext,
  createInteractionTraceContext,
  createEventTraceContext,
} = require("../../log");
const { enforceControlLockdown } = require("../control");
const { forEachState, deleteState } = require("./state");
const { reconcile } = require("./reconcile");
const { handleVoiceStateUpdate } = require("./handler");
const { refreshWatchStatus } = require("./watchstatus");
const { handleWatchCommand } = require("./commands");

/**
 * Wire the streamwatch feature into the client.
 */
function registerStreamwatch(client, config) {
  client.once(Events.ClientReady, async (c) => {
    // Fresh identify clears voice states server-side, so re-assert
    // presence for every guild that still has a live queue.
    const jobs = [];
    forEachState((s, guildId) => {
      s.presenceChannelId = null;
      const guild = c.guilds.cache.get(guildId);
      if (guild && s.queue.length > 0) jobs.push(reconcile(guild));
    });
    await Promise.all(jobs);
    refreshWatchStatus(client, config);
  });

  client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    const guild = newState.guild ?? oldState.guild;
    const member = newState.member ?? oldState.member;
    const ctx = createEventTraceContext({
      guildId: guild?.id || null,
      userId: member?.id || null,
      channelId: newState.channelId ?? oldState.channelId ?? null,
      command: "voiceStateUpdate",
    });
    await runWithTraceContext(ctx, async () => {
      try {
        await handleVoiceStateUpdate(oldState, newState, client, config);
      } catch (err) {
        log.warn("voiceStateUpdate handler error:", err.message);
      }
    });
  });

  // Drop per-guild queue state when the bot leaves/is removed from a guild,
  // so the state map can't grow without bound over a long uptime.
  client.on(Events.GuildDelete, (guild) => {
    try {
      deleteState(guild.id);
    } catch (err) {
      log.warn("streamwatch guild cleanup error:", err.message);
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!(interaction.isChatInputCommand() && interaction.commandName === "watch")) return;
    await runWithTraceContext(createInteractionTraceContext(interaction), async () => {
      try {
        if (await enforceControlLockdown(interaction)) return;
        log.info("watch dashboard opened");
        await handleWatchCommand(interaction);
      } catch (err) {
        log.warn("watch interaction error:", err.message);
      }
    });
  });
}

module.exports = { registerStreamwatch };
