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
} = require("discord.js");
const { openDashboard: openDashboardShell } = require("../../dashboard");
const { getConfig, updateConfig, configuredRepos, githubToken } = require("./store");
const { forgetGithubWebhook } = require("./webhook");
const { buildSamples } = require("./embeds");

const POLL_LABEL = "Every 2 minutes";

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

async function openGithubDashboard(interaction) {
  return openDashboardShell(interaction, {
    prefix: "github",
    feature: "github",
    gateMessage:
      "You need the **Administrator** permission (or be a bot owner) to manage these settings.",
    buildEmbed,
    buildComponents: mainComponents,
    getConfig,
    onComponent: (i, guild, ctx) => handleComponent(i, guild, ctx),
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

async function handleComponent(i, guild, ctx) {
  const { render: rerender, rootInteraction } = ctx;
  const parts = i.customId.split(":");
  const kind = parts[1];
  const cfg = getConfig(guild.id);

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
