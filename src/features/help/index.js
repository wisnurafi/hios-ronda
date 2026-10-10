/**
 * /help — ephemeral overview of every hios-ronda command. Open to everyone,
 * no admin needed (it only describes things, it changes nothing).
 */

const { Events } = require("discord.js");
const { log } = require("../../log");
const { handleHelpCommand } = require("./commands");

function registerHelp(client) {
  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (!interaction.isChatInputCommand()) return;
      if (interaction.commandName === "help") {
        await handleHelpCommand(interaction);
      }
    } catch (err) {
      log.warn("help interaction error:", err.message);
    }
  });
}

module.exports = { registerHelp };
