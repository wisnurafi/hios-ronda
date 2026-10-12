/**
 * /ping wiring — subject to the control lockdown like every slash command.
 */

const { Events } = require("discord.js");
const { log, runWithTraceContext, createInteractionTraceContext } = require("../../log");
const { enforceControlLockdown } = require("../control");
const { handlePingCommand } = require("./commands");

function registerPing(client) {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!(interaction.isChatInputCommand() && interaction.commandName === "ping")) return;
    await runWithTraceContext(createInteractionTraceContext(interaction), async () => {
      try {
        if (await enforceControlLockdown(interaction)) return;
        await handlePingCommand(interaction);
      } catch (err) {
        log.warn("ping interaction error:", err.message);
      }
    });
  });
}

module.exports = { registerPing };
