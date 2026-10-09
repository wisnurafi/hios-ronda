const { Events } = require("discord.js");
const { log } = require("../../log");
const { forEachState } = require("./state");
const { reconcile } = require("./reconcile");
const { handleVoiceStateUpdate } = require("./handler");

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
  });

  client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    try {
      await handleVoiceStateUpdate(oldState, newState, config);
    } catch (err) {
      log("voiceStateUpdate handler error:", err.message);
    }
  });
}

module.exports = { registerStreamwatch };
