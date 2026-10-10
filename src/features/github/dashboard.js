/**
 * Interactive dashboard for the GitHub logs feature (ephemeral, admin-only).
 *
 *  /github -> target channel picker, enable/disable, test preview.
 *
 * Repos + token stay in env (GITHUB_REPOS / GITHUB_TOKEN); the dashboard
 * shows them read-only. Same interaction pattern as the other dashboards
 * (10-minute collector, auto-close).
 */

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  ComponentType,
  MessageFlags,
  PermissionFlagsBits,
} = require("discord.js");
const { log } = require("../../log");
const { isBotOwner } = require("../../owner");
const { getConfig, updateConfig, configuredRepos, githubToken } = require("./store");
const { forgetGithubWebhook } = require("./webhook");
const { buildSamples } = require("./embeds");

const SESSION_MS = 600_000; // 10 minutes, like the other dashboards
const POLL_LABEL = "Every 3 minutes";

const id = (...parts) => `github:${parts.join(":")}`;

function buildEmbed(guild, cfg) {
  const repos = configuredRepos();
  const channel = cfg.channelId ? `<#${cfg.channelId}>` : "*Not set*";
  return new EmbedBuilder()
    .setTitle("📡 GitHub Logs Dashboard")
    .setDescription(`GitHub push/PR/release feed settings for **${guild.name}**.\nSelect an option below to modify a setting.`)
    .setColor(0x24292f)
    .addFields(
      { name: "Status", value: cfg.enabled ? "**Enabled**" : "**Disabled**", inline: true },
      { name: "Target Channel", value: channel, inline: true },
      { name: "Poll Interval", value: POLL_LABEL, inline: true },
      {
        name: "Repositories",
        value: repos.length > 0 ? repos.map((r) => `\`${r}\``).join("\n") : "*None — set GITHUB_REPOS in .env*",
        inline: false,
      },
      {
        name: "Token",
        value: githubToken() ? "✅ Set" : "❌ Missing — set GITHUB_TOKEN in .env",
        inline: false,
      }
    )
    .setFooter({ text: "Dashboard closes after 10 minutes of inactivity" })
    .setTimestamp();
}

function mainComponents(guildId, cfg) {
  const toggleRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(id("toggle", guildId))
      .setLabel(cfg.enabled ? "Disable" : "Enable")
      .setEmoji(cfg.enabled ? "⏸️" : "▶️")
      .setStyle(cfg.enabled ? ButtonStyle.Secondary : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(id("preview", guildId))
      .setLabel("Test Preview")
      .setEmoji("👁️")
      .setStyle(ButtonStyle.Primary)
  );
  const menu = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(id("menu", guildId))
      .setPlaceholder("Select a setting to configure...")
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel("Set Target Channel")
          .setDescription("Channel where the GitHub feed is posted")
          .setValue("channel")
          .setEmoji("📢")
      )
  );
  return [toggleRow, menu];
}

function disabledComponents(guildId, cfg) {
  return mainComponents(guildId, cfg).map((row) => {
    row.components.forEach((c) => c.setDisabled(true));
    return row;
  });
}

async function openGithubDashboard(interaction) {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ content: "This command only works in a server.", flags: MessageFlags.Ephemeral });
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

  const cfg = getConfig(guild.id);
  await interaction.reply({
    embeds: [buildEmbed(guild, cfg)],
    components: mainComponents(guild.id, cfg),
    flags: MessageFlags.Ephemeral,
  });

  const reply = await interaction.fetchReply().catch(() => null);
  if (!reply) return;

  const collector = reply.createMessageComponentCollector({
    filter: (i) => i.customId.startsWith("github:") && i.user.id === interaction.user.id,
    time: SESSION_MS,
  });

  collector.on("collect", async (i) => {
    try {
      await handleComponent(i, guild, interaction);
    } catch (err) {
      log.warn(`github dashboard component error:`, err.message);
      try {
        if (!i.replied && !i.deferred) await i.deferUpdate();
      } catch {}
    }
  });

  collector.on("end", async () => {
    try {
      const c = getConfig(guild.id);
      const embed = buildEmbed(guild, c).setFooter({ text: "Dashboard closed due to inactivity" });
      await interaction.editReply({ embeds: [embed], components: disabledComponents(guild.id, c) }).catch(() => {});
    } catch {}
  });
}

/** Ephemeral test preview with sample push/PR/release embeds (no network). */
async function sendPreview(i, guild) {
  const cfg = getConfig(guild.id);
  const samples = buildSamples(cfg.emojis);
  await i.reply({
    content: "👀 **Preview** — this is how new events will look:",
    embeds: samples,
    flags: MessageFlags.Ephemeral,
  });
}

async function handleComponent(i, guild, rootInteraction) {
  const parts = i.customId.split(":");
  const kind = parts[1];
  const cfg = getConfig(guild.id);
  const rerender = async () => {
    const c = getConfig(guild.id);
    await rootInteraction.editReply({
      embeds: [buildEmbed(guild, c)],
      components: mainComponents(guild.id, c),
    });
  };

  if (i.componentType === ComponentType.Button) {
    if (kind === "toggle") {
      updateConfig(guild.id, { enabled: !cfg.enabled });
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
      await sendPreview(i, guild);
      return;
    }
    if (kind === "reset_channel") {
      updateConfig(guild.id, { channelId: null });
      forgetGithubWebhook(guild.id);
      await i.deferUpdate();
      await rerender();
      return;
    }
  }

  if (i.componentType === ComponentType.StringSelect && kind === "menu") {
    if (i.values[0] === "channel") {
      const picker = new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId(id("pick", "channel", guild.id))
          .setPlaceholder("Select the target channel")
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      );
      const resetRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(id("reset_channel", guild.id))
          .setLabel("Reset")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(id("back", guild.id))
          .setLabel("← Back")
          .setStyle(ButtonStyle.Secondary)
      );
      await i.update({ components: [picker, resetRow] });
      return;
    }
  }

  if (kind === "pick" && parts[2] === "channel") {
    updateConfig(guild.id, { channelId: i.values[0] });
    forgetGithubWebhook(guild.id); // recreate in the new channel on next tick
    await i.deferUpdate();
    await rerender();
    return;
  }

  await i.deferUpdate().catch(() => {});
}

module.exports = { openGithubDashboard };
