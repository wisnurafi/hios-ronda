/**
 * /ping wiring — subject to the control lockdown like every slash command.
 */

const { Events } = require("discord.js");
const { log } = require("../../log");
const { enforceControlLockdown } = require("../control");
const { handlePingCommand } = require("./commands");

function registerPing(client) {
  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (!interaction.isChatInputCommand()) return;
      if (interaction.commandName === "ping") {
        if (await enforceControlLockdown(interaction)) return;
        await handlePingCommand(interaction);
      }
    } catch (err) {
      log.warn("ping interaction error:", err.message);
    }
  });
}

module.exports = { registerPing };
