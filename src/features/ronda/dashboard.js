/**
 * Interactive dashboards for the ronda stats features (ephemeral, admin-only).
 *
 *  /begadang -> night-owl leaderboard settings
 *  /rapot    -> weekly patrol report settings
 *
 * Each dashboard: enable/disable toggle, announce channel picker,
 * editable message template, and a test preview rendered from the
 * current week's real data. Same interaction pattern as the /watch
 * dashboard (10-minute collector, auto-close).
 */

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ChannelSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
  ComponentType,
  MessageFlags,
  PermissionFlagsBits,
} = require("discord.js");
const { log } = require("../../log");
const { isBotOwner } = require("../../owner");
const { isEnabled: isDbEnabled, topNightOwls, weekRows } = require("./db");
const { getGuildConfig, updateFeatureConfig, DEFAULT_BEGADANG_MESSAGE, DEFAULT_RAPOT_MESSAGE } = require("./store");
const { renderTemplate, buildBegadangEmbed, buildRapotEmbed, commonVars } = require("./announce");
const { weekStartOf } = require("./time");

const SESSION_MS = 600_000; // 10 minutes, like the other dashboards

const FEATURES = {
  begadang: {
    title: "🌙 Night Owls Dashboard",
    description: "Weekly night-owl leaderboard settings",
    color: 0x1a1a2e,
    schedule: "Every Monday 09:00 WIB",
    placeholders:
      "`{week}` week label · `{top1}` #1 mention · `{top1_time}` #1 night time",
    defaultMessage: DEFAULT_BEGADANG_MESSAGE,
  },
  rapot: {
    title: "📋 Patrol Report Dashboard",
    description: "Weekly patrol report announcement settings",
    color: 0x2b6cb0,
    schedule: "Every Monday 09:00 WIB",
    placeholders:
      "`{week}` week label · `{total_hours}` total voice · `{most_active}` most active member · " +
      "`{longest_session}` longest session · `{favorite_channel}` top channel · `{night_owl}` night owl #1",
    defaultMessage: DEFAULT_RAPOT_MESSAGE,
  },
};

const id = (feature, ...parts) => `${feature}:${parts.join(":")}`;

function buildEmbed(guild, feature, cfg) {
  const meta = FEATURES[feature];
  const channel = cfg.channelId ? `<#${cfg.channelId}>` : "`Default notify channel`";
  const msgPreview =
    `\`${cfg.message.slice(0, 100)}\`` + (cfg.message.length > 100 ? "…" : "");
  return new EmbedBuilder()
    .setTitle(meta.title)
    .setDescription(`${meta.description} for **${guild.name}**.\nSelect an option below to modify a setting.`)
    .setColor(meta.color)
    .addFields(
      { name: "Status", value: cfg.enabled ? "**Enabled**" : "**Disabled**", inline: true },
      { name: "Announce Channel", value: channel, inline: true },
      { name: "Schedule", value: meta.schedule, inline: true },
      { name: "Message", value: msgPreview, inline: false },
      { name: "Placeholders", value: meta.placeholders, inline: false }
    )
    .setFooter({ text: "Dashboard closes after 10 minutes of inactivity" })
    .setTimestamp();
}

function mainComponents(feature, guildId, cfg) {
  const toggleRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(id(feature, "toggle", guildId))
      .setLabel(cfg.enabled ? "Disable" : "Enable")
      .setEmoji(cfg.enabled ? "⏸️" : "▶️")
      .setStyle(cfg.enabled ? ButtonStyle.Secondary : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(id(feature, "preview", guildId))
      .setLabel("Test Preview")
      .setEmoji("👁️")
      .setStyle(ButtonStyle.Primary)
  );
  const menu = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(id(feature, "menu", guildId))
      .setPlaceholder("Select a setting to configure...")
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel("Set Announce Channel")
          .setDescription("Channel for the weekly announcement")
          .setValue("channel")
          .setEmoji("📢"),
        new StringSelectMenuOptionBuilder()
          .setLabel("Edit Message")
          .setDescription("Text shown above the announcement embed")
          .setValue("message")
          .setEmoji("💬")
      )
  );
  return [toggleRow, menu];
}

function disabledComponents(feature, guildId, cfg) {
  return mainComponents(feature, guildId, cfg).map((row) => {
    row.components.forEach((c) => c.setDisabled(true));
    return row;
  });
}

function backRow(feature, guildId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(id(feature, "back", guildId))
      .setLabel("← Back")
      .setStyle(ButtonStyle.Secondary)
  );
}

async function openDashboard(interaction, feature) {
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
    await interaction.reply({
      content: "You need the **Administrator** permission (or be a bot owner) to manage these settings.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const cfg = getGuildConfig(guild.id)[feature];
  await interaction.reply({
    embeds: [buildEmbed(guild, feature, cfg)],
    components: mainComponents(feature, guild.id, cfg),
    flags: MessageFlags.Ephemeral,
  });

  const reply = await interaction.fetchReply().catch(() => null);
  if (!reply) return;

  const collector = reply.createMessageComponentCollector({
    filter: (i) => i.customId.startsWith(`${feature}:`) && i.user.id === interaction.user.id,
    time: SESSION_MS,
  });

  collector.on("collect", async (i) => {
    try {
      await handleComponent(i, guild, interaction, feature);
    } catch (err) {
      log(`${feature} dashboard component error:`, err.message);
      try {
        if (!i.replied && !i.deferred) await i.deferUpdate();
      } catch {}
    }
  });

  collector.on("end", async () => {
    try {
      const c = getGuildConfig(guild.id)[feature];
      const embed = buildEmbed(guild, feature, c).setFooter({ text: "Dashboard closed due to inactivity" });
      await interaction.editReply({
        embeds: [embed],
        components: disabledComponents(feature, guild.id, c),
      }).catch(() => {});
    } catch {}
  });
}

/** Ephemeral test preview rendered from the current week's real data. */
async function sendPreview(i, guild, feature) {
  const cfg = getGuildConfig(guild.id)[feature];
  const weekStart = weekStartOf(Date.now());
  let content;
  let embed;
  if (!isDbEnabled()) {
    content = "⚠️ Voice stats database is not connected — showing layout with sample data.";
    embed =
      feature === "begadang"
        ? buildBegadangEmbed(guild, weekStart, [
            { user_id: "123", night_minutes: 450 },
            { user_id: "456", night_minutes: 300 },
          ])
        : buildRapotEmbed(guild, weekStart, [
            {
              user_id: "123",
              total_minutes: 900,
              night_minutes: 450,
              sessions: 12,
              longest_session_minutes: 180,
              channels: {},
            },
          ]);
  } else {
    const rows =
      feature === "begadang" ? await topNightOwls(guild.id, weekStart, 5) : await weekRows(guild.id, weekStart);
    const vars = commonVars(guild, weekStart, rows);
    content = renderTemplate(cfg.message, vars);
    embed =
      feature === "begadang"
        ? buildBegadangEmbed(guild, weekStart, rows)
        : buildRapotEmbed(guild, weekStart, rows);
  }
  await i.reply({ content, embeds: [embed], flags: MessageFlags.Ephemeral });
}

async function showMessageModal(i, feature, guildId, cfg) {
  const modalId = id(feature, "modal", "message", guildId);
  const modal = new ModalBuilder().setCustomId(modalId).setTitle("Announcement Message");
  const input = new TextInputBuilder()
    .setCustomId("message")
    .setLabel("Message template")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setValue(cfg.message)
    .setMaxLength(1500)
    .setPlaceholder("Use {placeholders} — see the dashboard for the list");
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await i.showModal(modal);
  const submitted = await i
    .awaitModalSubmit({
      filter: (m) => m.customId === modalId && m.user.id === i.user.id,
      time: 120_000,
    })
    .catch(() => null);
  return submitted;
}

async function handleComponent(i, guild, rootInteraction, feature) {
  const parts = i.customId.split(":");
  const kind = parts[1];
  const cfg = getGuildConfig(guild.id)[feature];
  const rerender = async () => {
    const c = getGuildConfig(guild.id)[feature];
    await rootInteraction.editReply({
      embeds: [buildEmbed(guild, feature, c)],
      components: mainComponents(feature, guild.id, c),
    });
  };

  // ---- buttons ----
  if (i.componentType === ComponentType.Button) {
    if (kind === "toggle") {
      updateFeatureConfig(guild.id, feature, { enabled: !cfg.enabled });
      await i.deferUpdate();
      await rerender();
      return;
    }
    if (kind === "back") {
      await i.deferUpdate();
      await rerender();
      return;
    }
    if (kind === "preview") {
      await sendPreview(i, guild, feature);
      return;
    }
    if (kind === "reset_channel") {
      updateFeatureConfig(guild.id, feature, { channelId: null });
      await i.deferUpdate();
      await rerender();
      return;
    }
  }

  // ---- main menu ----
  if (i.componentType === ComponentType.StringSelect && kind === "menu") {
    const value = i.values[0];
    if (value === "channel") {
      const picker = new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId(id(feature, "pick", "channel", guild.id))
          .setPlaceholder("Select the announce channel")
          .addChannelTypes(ChannelType.GuildText)
      );
      const resetRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(id(feature, "reset_channel", guild.id))
          .setLabel("Reset to Default")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(id(feature, "back", guild.id))
          .setLabel("← Back")
          .setStyle(ButtonStyle.Secondary)
      );
      await i.update({ components: [picker, resetRow] });
      return;
    }
    if (value === "message") {
      const submitted = await showMessageModal(i, feature, guild.id, cfg);
      if (submitted) {
        const message =
          submitted.fields.getTextInputValue("message").trim() || FEATURES[feature].defaultMessage;
        updateFeatureConfig(guild.id, feature, { message });
        await submitted.deferUpdate();
        await rerender();
      }
      return;
    }
  }

  // ---- channel picker result ----
  if (kind === "pick" && parts[2] === "channel") {
    updateFeatureConfig(guild.id, feature, { channelId: i.values[0] });
    await i.deferUpdate();
    await rerender();
    return;
  }

  await i.deferUpdate().catch(() => {});
}

async function openBegadangDashboard(interaction) {
  await openDashboard(interaction, "begadang");
}

async function openRapotDashboard(interaction) {
  await openDashboard(interaction, "rapot");
}

module.exports = { openBegadangDashboard, openRapotDashboard };
