const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  UserSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
  ComponentType,
  MessageFlags,
  PermissionFlagsBits,
} = require("discord.js");
const { log } = require("../../log");
const { getConfig, updateConfig } = require("./store");
const { setupHoneypot } = require("./setup");
const { getLogsWebhook, forgetLogsWebhook } = require("./webhook");

const SESSION_MS = 600_000; // 10 minutes, like hios-bot dashboards
const id = (...parts) => `hp:${parts.join(":")}`;

function actionLabel(cfg) {
  const base = { ban: "🔨 Ban", kick: "👢 Kick", timeout: "⏱️ Timeout" }[cfg.action] || "🔨 Ban";
  return cfg.action === "timeout" ? `${base} (${cfg.timeoutMinutes}m)` : base;
}

function listOrNone(ids, fmt) {
  return ids.length > 0 ? ids.map(fmt).join(", ") : "`None`";
}

function buildEmbed(guild, cfg) {
  const honeypot = cfg.honeypotChannelId ? `<#${cfg.honeypotChannelId}>` : "`Not set up`";
  const logs = cfg.logsChannelId ? `<#${cfg.logsChannelId}>` : "`Not set`";
  const warnPreview =
    `\`${(cfg.warningTitle + " — " + cfg.warningDescription).slice(0, 80)}\`` +
    (cfg.warningTitle.length + cfg.warningDescription.length > 77 ? "…" : "");

  return new EmbedBuilder()
    .setTitle("🍯 Honeypot Dashboard")
    .setDescription(
      `Manage honeypot settings for **${guild.name}**.\nSelect an option below to modify a setting.`
    )
    .setColor(0xf5a623)
    .addFields(
      { name: "Status", value: cfg.enabled ? "**Enabled**" : "**Disabled**", inline: true },
      { name: "Honeypot Channel", value: honeypot, inline: true },
      { name: "Logs Channel", value: logs, inline: true },
      { name: "Action on Catch", value: actionLabel(cfg), inline: true },
      { name: "Exempt Roles", value: listOrNone(cfg.exemptRoles, (r) => `<@&${r}>`), inline: true },
      { name: "Exempt Users", value: listOrNone(cfg.exemptUsers, (u) => `<@${u}>`), inline: true },
      { name: "Total Catches", value: `🍯 \`${cfg.catches}\``, inline: true },
      { name: "Warning Message", value: warnPreview, inline: false }
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
      .setCustomId(id("setup", guildId))
      .setLabel(cfg.honeypotChannelId ? "Recreate Channel" : "Set Up Channel")
      .setEmoji("🛠️")
      .setStyle(ButtonStyle.Primary)
  );

  const menu = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(id("menu", guildId))
      .setPlaceholder("Select a setting to configure...")
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel("Set Logs Channel")
          .setDescription("Channel where catch alerts are sent")
          .setValue("logs_channel")
          .setEmoji("📢"),
        new StringSelectMenuOptionBuilder()
          .setLabel("Set Punishment Action")
          .setDescription("Ban, kick or timeout when someone is caught")
          .setValue("action")
          .setEmoji("🔨"),
        new StringSelectMenuOptionBuilder()
          .setLabel("Set Timeout Duration")
          .setDescription("How long a timeout lasts (minutes)")
          .setValue("timeout_duration")
          .setEmoji("⏱️"),
        new StringSelectMenuOptionBuilder()
          .setLabel("Add Exempt Role")
          .setDescription("Roles immune to the honeypot")
          .setValue("exempt_role_add")
          .setEmoji("🛡️"),
        new StringSelectMenuOptionBuilder()
          .setLabel("Remove Exempt Role")
          .setDescription("Remove a role from exemptions")
          .setValue("exempt_role_remove")
          .setEmoji("➖"),
        new StringSelectMenuOptionBuilder()
          .setLabel("Add Exempt User")
          .setDescription("Users immune to the honeypot")
          .setValue("exempt_user_add")
          .setEmoji("👤"),
        new StringSelectMenuOptionBuilder()
          .setLabel("Remove Exempt User")
          .setDescription("Remove a user from exemptions")
          .setValue("exempt_user_remove")
          .setEmoji("➖"),
        new StringSelectMenuOptionBuilder()
          .setLabel("Edit Warning Message")
          .setDescription("Title + description of the honeypot warning")
          .setValue("warning_message")
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
  const cfg = getConfig(guild.id);
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
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(inp.id)
          .setLabel(inp.label)
          .setStyle(inp.style || TextInputStyle.Short)
          .setRequired(inp.required ?? true)
          .setValue(inp.value || "")
          .setMaxLength(inp.maxLength || 500)
      )
    );
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
 * Open the interactive honeypot dashboard (ephemeral).
 */
async function openDashboard(interaction) {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ content: "This command only works in a server.", flags: MessageFlags.Ephemeral });
    return;
  }
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({
      content: "You need the **Administrator** permission to manage the honeypot.",
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
    filter: (i) => i.customId.startsWith("hp:") && i.user.id === interaction.user.id,
    time: SESSION_MS,
  });

  collector.on("collect", async (i) => {
    try {
      await handleComponent(i, guild, interaction);
    } catch (err) {
      log("dashboard component error:", err.message);
      try {
        if (!i.replied && !i.deferred) await i.deferUpdate();
      } catch {}
    }
  });

  collector.on("end", async () => {
    try {
      const c = getConfig(guild.id);
      const embed = buildEmbed(guild, c).setFooter({ text: "Dashboard closed due to inactivity" });
      await interaction.editReply({
        embeds: [embed],
        components: disabledComponents(guild.id, c),
      }).catch(() => {});
    } catch {}
  });
}

async function handleComponent(i, guild, rootInteraction) {
  const [, kind, guildId, extra] = i.customId.split(":");
  const cfg = getConfig(guild.id);
  const rerender = () => render(rootInteraction, guild);

  // ---- buttons ----
  if (i.componentType === ComponentType.Button) {
    if (kind === "toggle") {
      updateConfig(guild.id, { enabled: !cfg.enabled });
      await i.deferUpdate();
      await rerender();
      return;
    }
    if (kind === "setup") {
      await i.deferUpdate();
      try {
        const channel = await setupHoneypot(guild, getConfig(guild.id));
        // First setup: the channel where the dashboard was opened becomes the logs channel.
        const c2 = getConfig(guild.id);
        if (!c2.logsChannelId && rootInteraction.channelId) {
          updateConfig(guild.id, { logsChannelId: rootInteraction.channelId });
        }
        const c3 = getConfig(guild.id);
        const hook = await getLogsWebhook(guild, c3);
        const setupLine = `Honeypot is set up in <#${channel.id}>! This current channel will log honeypot events.`;
        if (hook) {
          await hook.send(setupLine).catch(() => {});
        } else {
          const logsCh = c3.logsChannelId
            ? await guild.channels.fetch(c3.logsChannelId).catch(() => null)
            : null;
          if (logsCh?.isTextBased()) await logsCh.send(setupLine).catch(() => {});
        }
      } catch (err) {
        await rootInteraction.followUp({
          content: `Setup failed: ${err.message}`,
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

  // ---- main menu ----
  if (i.componentType === ComponentType.StringSelect && kind === "menu") {
    const value = i.values[0];
    if (value === "logs_channel") {
      const picker = new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId(id("pick", "logs_channel", guildId))
          .setPlaceholder("Select the logs channel")
          .addChannelTypes(ChannelType.GuildText)
      );
      await i.update({ components: [picker, backRow(guildId)] });
      return;
    }
    if (value === "action") {
      const picker = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(id("pick", "action", guildId))
          .setPlaceholder("Select punishment action")
          .addOptions(
            new StringSelectMenuOptionBuilder().setLabel("Ban").setValue("ban").setEmoji("🔨"),
            new StringSelectMenuOptionBuilder().setLabel("Kick").setValue("kick").setEmoji("👢"),
            new StringSelectMenuOptionBuilder().setLabel("Timeout").setValue("timeout").setEmoji("⏱️")
          )
      );
      await i.update({ components: [picker, backRow(guildId)] });
      return;
    }
    if (value === "timeout_duration") {
      const submitted = await showModal(i, id("modal", "timeout_duration", guildId), "Timeout Duration", [
        { id: "minutes", label: "Timeout duration (minutes, 1–40320)", value: String(cfg.timeoutMinutes) },
      ]);
      if (submitted) {
        const minutes = Math.min(Math.max(parseInt(submitted.fields.getTextInputValue("minutes"), 10) || 0, 1), 40320);
        updateConfig(guild.id, { timeoutMinutes: minutes, action: "timeout" });
        await submitted.deferUpdate();
        await rerender();
      }
      return;
    }
    if (value === "exempt_role_add") {
      const picker = new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId(id("pick", "exempt_role_add", guildId))
          .setPlaceholder("Select roles to exempt")
          .setMinValues(1)
          .setMaxValues(10)
      );
      await i.update({ components: [picker, backRow(guildId)] });
      return;
    }
    if (value === "exempt_role_remove") {
      if (cfg.exemptRoles.length === 0) {
        await i.reply({ content: "No exempt roles to remove.", flags: MessageFlags.Ephemeral });
        return;
      }
      const picker = new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId(id("pick", "exempt_role_remove", guildId))
          .setPlaceholder("Select roles to un-exempt")
          .setMinValues(1)
          .setMaxValues(10)
      );
      await i.update({ components: [picker, backRow(guildId)] });
      return;
    }
    if (value === "exempt_user_add") {
      const picker = new ActionRowBuilder().addComponents(
        new UserSelectMenuBuilder()
          .setCustomId(id("pick", "exempt_user_add", guildId))
          .setPlaceholder("Select users to exempt")
          .setMinValues(1)
          .setMaxValues(10)
      );
      await i.update({ components: [picker, backRow(guildId)] });
      return;
    }
    if (value === "exempt_user_remove") {
      if (cfg.exemptUsers.length === 0) {
        await i.reply({ content: "No exempt users to remove.", flags: MessageFlags.Ephemeral });
        return;
      }
      const picker = new ActionRowBuilder().addComponents(
        new UserSelectMenuBuilder()
          .setCustomId(id("pick", "exempt_user_remove", guildId))
          .setPlaceholder("Select users to un-exempt")
          .setMinValues(1)
          .setMaxValues(10)
      );
      await i.update({ components: [picker, backRow(guildId)] });
      return;
    }
    if (value === "warning_message") {
      const submitted = await showModal(i, id("modal", "warning_message", guildId), "Warning Message", [
        { id: "title", label: "Warning title", value: cfg.warningTitle, maxLength: 256 },
        {
          id: "description",
          label: "Warning description",
          style: TextInputStyle.Paragraph,
          value: cfg.warningDescription,
          maxLength: 2000,
        },
      ]);
      if (submitted) {
        const title = submitted.fields.getTextInputValue("title").trim() || cfg.warningTitle;
        const description = submitted.fields.getTextInputValue("description").trim() || cfg.warningDescription;
        updateConfig(guild.id, { warningTitle: title, warningDescription: description });
        // refresh the posted warning embed too
        try {
          const { setupHoneypot } = require("./setup");
          await setupHoneypot(guild, getConfig(guild.id));
        } catch (err) {
          log("warning refresh failed:", err.message);
        }
        await submitted.deferUpdate();
        await rerender();
      }
      return;
    }
  }

  // ---- pickers (customId: hp:pick:<kind>:<guildId>) ----
  // NOTE: destructured as [, kind="pick", guildId=<kind>, extra=<guildId>]
  if (kind === "pick") {
    const pickKind = guildId;
    const c = getConfig(guild.id);
    const rerender = () => render(rootInteraction, guild);

    if (pickKind === "logs_channel") {
      updateConfig(guild.id, { logsChannelId: i.values[0] });
      forgetLogsWebhook(guild.id); // new channel -> new webhook
    } else if (pickKind === "action") {
      updateConfig(guild.id, { action: i.values[0] });
    } else if (pickKind === "exempt_role_add") {
      updateConfig(guild.id, { exemptRoles: [...new Set([...c.exemptRoles, ...i.values])] });
    } else if (pickKind === "exempt_role_remove") {
      updateConfig(guild.id, { exemptRoles: c.exemptRoles.filter((r) => !i.values.includes(r)) });
    } else if (pickKind === "exempt_user_add") {
      updateConfig(guild.id, { exemptUsers: [...new Set([...c.exemptUsers, ...i.values])] });
    } else if (pickKind === "exempt_user_remove") {
      updateConfig(guild.id, { exemptUsers: c.exemptUsers.filter((u) => !i.values.includes(u)) });
    } else {
      await i.deferUpdate();
      return;
    }
    await i.deferUpdate();
    await rerender();
    return;
  }
}

module.exports = { openDashboard };
