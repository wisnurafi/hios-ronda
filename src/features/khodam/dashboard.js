/**
 * /khodam dashboard — interactive, ephemeral, admin-only (or bot owner),
 * auto-closes after 10 minutes of inactivity. Same pattern as the
 * verify/honeypot dashboards.
 *
 * Manage: enable/disable, post/refresh the public panel, set the game
 * channel or create a locked #khodam channel.
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
const { openDashboard: openDashboardShell, backRow } = require("../../dashboard");
const { getConfig, updateConfig } = require("./store");
const { ensureKhodamEmojis } = require("./emojis");
const { postOrRefreshPanel, createKhodamChannel } = require("./panel");
const { isEnabled: dbEnabled } = require("./db");

const id = (...parts) => `kh:${parts.join(":")}`;

function buildEmbed(guild, cfg) {
  const channel = cfg.channelId ? `<#${cfg.channelId}>` : "`Not set`";
  const posted = cfg.messageId ? "Yes" : "No";
  return new EmbedBuilder()
    .setTitle("👹 Khodam Dashboard")
    .setDescription(`Manage the Cek Khodam game for **${guild.name}**.`)
    .setColor(0x9b59b6)
    .addFields(
      { name: "Status", value: cfg.enabled ? "**Enabled**" : "**Disabled**", inline: true },
      { name: "Database", value: dbEnabled() ? "**Connected**" : "**Offline**", inline: true },
      { name: "Panel Posted", value: posted, inline: true },
      { name: "Game Channel", value: channel, inline: false }
    )
    .setFooter({ text: "Dashboard closes after 10 minutes of inactivity" })
    .setTimestamp();
}

function mainComponents(guildId, cfg) {
  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(id("toggle", guildId))
      .setLabel(cfg.enabled ? "Disable" : "Enable")
      .setEmoji(cfg.enabled ? "⏸️" : "▶️")
      .setStyle(cfg.enabled ? ButtonStyle.Secondary : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(id("post", guildId))
      .setLabel(cfg.messageId ? "Refresh Panel" : "Post Panel")
      .setEmoji("🔄")
      .setStyle(ButtonStyle.Primary)
  );
  const menu = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(id("menu", guildId))
      .setPlaceholder("Select a setting to configure...")
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel("Set Game Channel")
          .setDescription("Pick an existing channel for the khodam panel")
          .setValue("game_channel")
          .setEmoji("📢"),
        new StringSelectMenuOptionBuilder()
          .setLabel("Create #khodam Channel")
          .setDescription("Make a locked channel (only the bot can send)")
          .setValue("create_channel")
          .setEmoji("🛠️")
      )
  );
  return [buttons, menu];
}

async function openDashboard(interaction) {
  return openDashboardShell(interaction, {
    prefix: "kh",
    feature: "khodam",
    gateMessage:
      "You need the **Administrator** permission (or be a bot owner) to manage the khodam game.",
    buildEmbed,
    buildComponents: mainComponents,
    getConfig,
    onComponent: (i, guild, ctx) => handleComponent(i, guild, ctx),
  });
}

async function handleComponent(i, guild, ctx) {
  const { render: rerender, rootInteraction } = ctx;
  const [, kind, guildId] = i.customId.split(":");

  if (i.componentType === ComponentType.Button) {
    if (kind === "toggle") {
      const cfg = getConfig(guild.id);
      updateConfig(guild.id, { enabled: !cfg.enabled });
      await i.deferUpdate();
      await rerender();
      return;
    }
    if (kind === "post") {
      await i.deferUpdate();
      try {
        const emojis = await ensureKhodamEmojis(guild);
        const msg = await postOrRefreshPanel(guild, emojis);
        await rootInteraction.followUp({
          content: `Khodam panel is live in <#${msg.channelId}>!`,
          flags: MessageFlags.Ephemeral,
        });
      } catch (err) {
        await rootInteraction.followUp({
          content: `Couldn't post the panel: ${err.message}`,
          flags: MessageFlags.Ephemeral,
        });
      }
      await rerender();
      return;
    }
    if (kind === "back") {
      await i.deferUpdate();
      await rerender();
      return;
    }
  }

  if (i.componentType === ComponentType.StringSelect && kind === "menu") {
    const value = i.values[0];
    if (value === "game_channel") {
      const picker = new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId(id("pick", "game_channel", guildId))
          .setPlaceholder("Select the khodam game channel")
          .addChannelTypes(ChannelType.GuildText)
      );
      await i.update({ components: [picker, backRow(id("back", guildId))] });
      return;
    }
    if (value === "create_channel") {
      await i.deferUpdate();
      try {
        const channel = await createKhodamChannel(guild);
        updateConfig(guild.id, { channelId: channel.id, messageId: null });
        const emojis = await ensureKhodamEmojis(guild);
        await postOrRefreshPanel(guild, emojis);
        await rootInteraction.followUp({
          content: `Created <#${channel.id}> (locked) and posted the panel there!`,
          flags: MessageFlags.Ephemeral,
        });
      } catch (err) {
        await rootInteraction.followUp({
          content: `Couldn't create the channel: ${err.message}`,
          flags: MessageFlags.Ephemeral,
        });
      }
      await rerender();
      return;
    }
  }

  // pickers: kh:pick:<kind>:<guildId>
  if (kind === "pick") {
    const pickKind = guildId; // NOTE: destructured position holds the kind
    if (pickKind === "game_channel") {
      const newChannelId = i.values[0];
      updateConfig(guild.id, { channelId: newChannelId, messageId: null });
      await i.deferUpdate();
      await rootInteraction.followUp({
        content: `Game channel set to <#${newChannelId}>. Tekan **Post Panel** buat pasang panelnya.`,
        flags: MessageFlags.Ephemeral,
      });
    } else {
      await i.deferUpdate();
    }
    await rerender();
    return;
  }
}

module.exports = { openDashboard };
