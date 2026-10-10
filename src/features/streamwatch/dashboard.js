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
const { getWatchConfig, updateWatchConfig, DEFAULT_MESSAGE } = require("./store");
const { isBotOwner } = require("../../owner");

const SESSION_MS = 600_000; // 10 minutes, like the honeypot dashboard
const id = (...parts) => `watch:${parts.join(":")}`;

function buildEmbed(guild, cfg) {
  const channel = cfg.notifyChannelId
    ? `<#${cfg.notifyChannelId}>`
    : "`Default (from env)`";
  const msgPreview =
    `\`${cfg.notifyMessage.slice(0, 100)}\`` +
    (cfg.notifyMessage.length > 100 ? "…" : "");

  return new EmbedBuilder()
    .setTitle("🔴 Watch Dashboard")
    .setDescription(
      `Go Live notification settings for **${guild.name}**.\nSelect an option below to modify a setting.`
    )
    .setColor(0xff3b30)
    .addFields(
      { name: "Status", value: cfg.notifyEnabled ? "**Enabled**" : "**Disabled**", inline: true },
      { name: "Notify Channel", value: channel, inline: true },
      { name: "Message", value: msgPreview, inline: false },
      {
        name: "Placeholders",
        value: "`{mention}` pings the streamer · `{name}` display name · `{channel}` voice channel name",
        inline: false,
      }
    )
    .setFooter({ text: "Dashboard closes after 10 minutes of inactivity" })
    .setTimestamp();
}

function mainComponents(guildId, cfg) {
  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(id("toggle", guildId))
      .setLabel(cfg.notifyEnabled ? "Disable" : "Enable")
      .setEmoji(cfg.notifyEnabled ? "⏸️" : "▶️")
      .setStyle(cfg.notifyEnabled ? ButtonStyle.Secondary : ButtonStyle.Success)
  );

  const menu = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(id("menu", guildId))
      .setPlaceholder("Select a setting to configure...")
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel("Set Notify Channel")
          .setDescription("Channel where Go Live alerts are sent")
          .setValue("notify_channel")
          .setEmoji("📢"),
        new StringSelectMenuOptionBuilder()
          .setLabel("Edit Message")
          .setDescription("Text of the Go Live notification")
          .setValue("message")
          .setEmoji("💬")
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
  const cfg = getWatchConfig(guild.id);
  await interaction.editReply({
    embeds: [buildEmbed(guild, cfg)],
    components: mainComponents(guild.id, cfg),
  });
}

function backRow(guildId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(id("back", guildId))
      .setLabel("← Back")
      .setStyle(ButtonStyle.Secondary)
  );
}

async function showModal(interaction, modalId, title, inputs) {
  const modal = new ModalBuilder().setCustomId(modalId).setTitle(title);
  for (const inp of inputs) {
    const textInput = new TextInputBuilder()
      .setCustomId(inp.id)
      .setLabel(inp.label)
      .setStyle(inp.style || TextInputStyle.Short)
      .setRequired(inp.required ?? true)
      .setValue(inp.value || "")
      .setMaxLength(inp.maxLength || 500);
    if (inp.placeholder) textInput.setPlaceholder(inp.placeholder);
    modal.addComponents(new ActionRowBuilder().addComponents(textInput));
  }
  await interaction.showModal(modal);
  const submitted = await interaction
    .awaitModalSubmit({
      filter: (m) => m.customId === modalId && m.user.id === interaction.user.id,
      time: 120_000,
    })
    .catch(() => null);
  return submitted;
}

/**
 * Open the interactive watch dashboard (ephemeral).
 */
async function openWatchDashboard(interaction) {
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
      content: "You need the **Administrator** permission (or be a bot owner) to manage watch settings.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const cfg = getWatchConfig(guild.id);
  await interaction.reply({
    embeds: [buildEmbed(guild, cfg)],
    components: mainComponents(guild.id, cfg),
    flags: MessageFlags.Ephemeral,
  });

  const reply = await interaction.fetchReply().catch(() => null);
  if (!reply) return;

  const collector = reply.createMessageComponentCollector({
    filter: (i) => i.customId.startsWith("watch:") && i.user.id === interaction.user.id,
    time: SESSION_MS,
  });

  collector.on("collect", async (i) => {
    try {
      await handleComponent(i, guild, interaction);
    } catch (err) {
      log("watch dashboard component error:", err.message);
      try {
        if (!i.replied && !i.deferred) await i.deferUpdate();
      } catch {}
    }
  });

  collector.on("end", async () => {
    try {
      const c = getWatchConfig(guild.id);
      const embed = buildEmbed(guild, c).setFooter({ text: "Dashboard closed due to inactivity" });
      await interaction.editReply({
        embeds: [embed],
        components: disabledComponents(guild.id, c),
      }).catch(() => {});
    } catch {}
  });
}

async function handleComponent(i, guild, rootInteraction) {
  const [, kind, guildId] = i.customId.split(":");
  const cfg = getWatchConfig(guild.id);
  const rerender = () => render(rootInteraction, guild);

  // ---- buttons ----
  if (i.componentType === ComponentType.Button) {
    if (kind === "toggle") {
      updateWatchConfig(guild.id, { notifyEnabled: !cfg.notifyEnabled });
      await i.deferUpdate();
      await rerender();
      return;
    }
    if (kind === "back") {
      await i.deferUpdate();
      await rerender();
      return;
    }
    if (kind === "reset_channel") {
      updateWatchConfig(guild.id, { notifyChannelId: null });
      await i.deferUpdate();
      await rerender();
      return;
    }
  }

  // ---- main menu ----
  if (i.componentType === ComponentType.StringSelect && kind === "menu") {
    const value = i.values[0];
    if (value === "notify_channel") {
      const picker = new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId(id("pick", "notify_channel", guildId))
          .setPlaceholder("Select the notify channel")
          .addChannelTypes(ChannelType.GuildText)
      );
      const resetRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(id("reset_channel", guildId))
          .setLabel("Reset to Default")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(id("back", guildId))
          .setLabel("← Back")
          .setStyle(ButtonStyle.Secondary)
      );
      await i.update({ components: [picker, resetRow] });
      return;
    }
    if (value === "message") {
      const submitted = await showModal(i, id("modal", "message", guildId), "Go Live Message", [
        {
          id: "message",
          label: "Notification message",
          style: TextInputStyle.Paragraph,
          value: cfg.notifyMessage,
          maxLength: 1500,
          placeholder: "{mention} = ping streamer, {name} = name, {channel} = voice channel",
        },
      ]);
      if (submitted) {
        const message = submitted.fields.getTextInputValue("message").trim() || DEFAULT_MESSAGE;
        updateWatchConfig(guild.id, { notifyMessage: message });
        await submitted.deferUpdate();
        await rerender();
      }
      return;
    }
  }

  // ---- pickers (customId: watch:pick:<kind>:<guildId>) ----
  if (kind === "pick") {
    const pickKind = guildId; // watch:pick:<kind>:<guildId>
    if (pickKind === "notify_channel") {
      updateWatchConfig(guild.id, { notifyChannelId: i.values[0] });
      await i.deferUpdate();
      await rerender();
      return;
    }
    await i.deferUpdate();
  }
}

module.exports = { openWatchDashboard };
