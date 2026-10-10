/**
 * /ping — check the bot's latency and API speed.
 *
 * Ported from hios-bot's src/commands/Core/ping.js (slash path):
 * replies "Pinging...", then edits with a Pong! embed showing
 * Bot Latency (interaction round-trip) and API Latency (gateway heartbeat).
 * Public reply, like hios-bot — not ephemeral.
 */

const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { log } = require("../../log");

const pingCommand = new SlashCommandBuilder()
  .setName("ping")
  .setDescription("Check the bot's latency and API speed")
  .setDMPermission(false);

async function handlePingCommand(interaction) {
  try {
    const sent = await interaction.reply({ content: "Pinging...", fetchReply: true });

    const latency = Math.max(0, Date.now() - interaction.createdTimestamp);
    const apiLatency = Math.max(0, Math.round(interaction.client.ws.ping));

    const embed = new EmbedBuilder()
      .setTitle("Pong!")
      .setColor(0x2b6cb0)
      .addFields(
        { name: "Bot Latency", value: `${latency}ms`, inline: true },
        { name: "API Latency", value: `${apiLatency}ms`, inline: true }
      );

    await sent.edit({ content: null, embeds: [embed] });
  } catch (err) {
    log.warn("ping command error:", err.message);
    try {
      if (!interaction.replied) {
        await interaction.reply({
          content: "Could not determine latency at this time.",
        });
      }
    } catch {
      // best effort
    }
  }
}

module.exports = { pingCommand, handlePingCommand };
