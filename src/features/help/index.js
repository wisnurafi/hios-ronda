/**
 * /help — ephemeral overview of every hios-ronda command. Open to everyone,
 * no admin needed (it only describes things, it changes nothing).
 */

const { Events } = require("discord.js");
const { log, runWithTraceContext, createInteractionTraceContext } = require("../../log");
const { enforceControlLockdown } = require("../control");
const { handleHelpCommand } = require("./commands");

function registerHelp(client) {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!(interaction.isChatInputCommand() && interaction.commandName === "help")) return;
    await runWithTraceContext(createInteractionTraceContext(interaction), async () => {
      try {
        if (await enforceControlLockdown(interaction)) return;
        await handleHelpCommand(interaction);
      } catch (err) {
        log.warn("help interaction error:", err.message);
      }
    });
  });
}

module.exports = { registerHelp };
