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
  PermissionFlagsBits,
} = require("discord.js");
const { log } = require("../../log");
const { getConfig, updateConfig } = require("./store");
const { isBotOwner } = require("../../owner");
const { ensureKhodamEmojis } = require("./emojis");
const { postOrRefreshPanel, createKhodamChannel } = require("./panel");
const { isEnabled: dbEnabled } = require("./db");

const SESSION_MS = 600_000; // 10 minutes, like the other dashboards
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

function disabledComponents(guildId, cfg) {
  return mainComponents(guildId, cfg).map((row) => {
    row.components.forEach((c) => c.setDisabled(true));
    return row;
  });
}

async function render(interaction, guild) {
  const cfg = getConfig(guild.id);
  await interaction.editReply({
    embeds: [buildEmbed(guild, cfg)],
    components: mainComponents(guild.id, cfg),
  });
}

function backRow(guildId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(id("back", guildId)).setLabel("← Back").setStyle(ButtonStyle.Secondary)
  );
}

async function openDashboard(interaction) {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ content: "This command only works in a server.", flags: MessageFlags.Ephemeral });
    return;
  }
  const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
  if (!isAdmin && !isBotOwner(interaction.user.id)) {
    await interaction.reply({
      content: "You need the **Administrator** permission (or be a bot owner) to manage the khodam game.",
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
    filter: (i) => i.customId.startsWith("kh:") && i.user.id === interaction.user.id,
    time: SESSION_MS,
  });

  collector.on("collect", async (i) => {
    try {
      await handleComponent(i, guild, interaction);
    } catch (err) {
      log.warn("khodam dashboard component error:", err.message);
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
        .editReply({ embeds: [embed], components: disabledComponents(guild.id, c) })
        .catch(() => {});
    } catch {}
  });
}

async function handleComponent(i, guild, rootInteraction) {
  const [, kind, guildId] = i.customId.split(":");
  const rerender = () => render(rootInteraction, guild);

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
      await i.update({ components: [picker, backRow(guildId)] });
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
