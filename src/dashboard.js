/**
 * Shared dashboard shell — one implementation of the "fixed form" every
 * feature dashboard follows: ephemeral, admin-only (or bot owner),
 * auto-closes after 10 minutes of inactivity.
 *
 * Before this, each dashboard had its own ~45-line copy of this shell
 * (guild check, admin gate, ephemeral reply, collector wiring, inactivity
 * close). The per-dashboard guts (embed, components, interaction handling)
 * were already separate functions — they just become parameters here.
 *
 * Usage:
 *   const { openDashboard } = require("../../dashboard");
 *
 *   async function openHoneypotDashboard(interaction) {
 *     return openDashboard(interaction, {
 *       prefix: "hp",                       // component customId prefix
 *       feature: "honeypot",                // log label
 *       gateMessage: "You need the **Administrator** permission (or be a bot owner) to manage the honeypot.",
 *       buildEmbed,                         // (guild, cfg) => EmbedBuilder
 *       buildComponents: mainComponents,    // (guildId, cfg) => ActionRow[]
 *       buildDisabledComponents: disabledComponents,
 *       getConfig,                          // (guildId) => cfg
 *       onComponent: (i, guild, ctx) => handleComponent(i, guild, ctx),
 *       // ctx = { render, rootInteraction }
 *       //   render()        -> re-reads config and re-renders the dashboard
 *       //   rootInteraction -> the original slash command interaction
 *     });
 *   }
 */

const { MessageFlags, PermissionFlagsBits } = require("discord.js");
const { log } = require("./log");
const { isBotOwner } = require("./owner");

const SESSION_MS = 600_000; // 10 minutes

async function openDashboard(interaction, opts) {
  const {
    prefix,
    feature,
    gateMessage,
    buildEmbed,
    buildComponents,
    buildDisabledComponents,
    getConfig,
    onComponent,
    sessionMs = SESSION_MS,
  } = opts;

  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({
      content: "This command only works in a server.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
  if (!isAdmin && !isBotOwner(interaction.user.id)) {
    await interaction.reply({ content: gateMessage, flags: MessageFlags.Ephemeral });
    return;
  }

  // Re-reads config and re-renders the dashboard in place. Handed to
  // onComponent so handlers can refresh after each change.
  const render = async () => {
    const cfg = getConfig(guild.id);
    await interaction.editReply({
      embeds: [buildEmbed(guild, cfg)],
      components: buildComponents(guild.id, cfg),
    });
  };

  {
    const cfg = getConfig(guild.id);
    await interaction.reply({
      embeds: [buildEmbed(guild, cfg)],
      components: buildComponents(guild.id, cfg),
      flags: MessageFlags.Ephemeral,
    });
  }

  const reply = await interaction.fetchReply().catch(() => null);
  if (!reply) return;

  const collector = reply.createMessageComponentCollector({
    filter: (i) => i.customId.startsWith(`${prefix}:`) && i.user.id === interaction.user.id,
    time: sessionMs,
  });

  collector.on("collect", async (i) => {
    try {
      await onComponent(i, guild, { render, rootInteraction: interaction });
    } catch (err) {
      log.warn(`${feature} dashboard component error:`, err.message);
      try {
        if (!i.replied && !i.deferred) await i.deferUpdate();
      } catch {}
    }
  });

  collector.on("end", async () => {
    try {
      const c = getConfig(guild.id);
      const embed = buildEmbed(guild, c).setFooter({ text: "Dashboard closed due to inactivity" });
      await interaction
        .editReply({ embeds: [embed], components: buildDisabledComponents(guild.id, c) })
        .catch(() => {});
    } catch {}
  });
}

module.exports = { openDashboard, SESSION_MS };
