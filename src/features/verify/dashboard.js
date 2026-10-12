/**
 * /verify dashboard — interactive, ephemeral, admin-only (or bot owner),
 * auto-closes after 10 minutes of inactivity. Same pattern as the
 * honeypot/watch dashboards.
 *
 * Configurable: verify channel, verified role, embed title+description,
 * button label, enable/disable, and post/refresh the public message.
 */

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  TextInputStyle,
  ChannelType,
  ComponentType,
  MessageFlags,
} = require("discord.js");
const { log } = require("../../log");
const { openDashboard: openDashboardShell, showModal, backRow } = require("../../dashboard");
const { getConfig, updateConfig } = require("./store");
const { setupVerify, createVerifyChannel } = require("./setup");

const id = (...parts) => `vf:${parts.join(":")}`;

function buildEmbed(guild, cfg) {
  const channel = cfg.verifyChannelId ? `<#${cfg.verifyChannelId}>` : "`Not set`";
  const role = cfg.verifiedRoleId ? `<@&${cfg.verifiedRoleId}>` : "`Not set`";
  const posted = cfg.verifyMessageId ? "Yes" : "No";
  const descPreview =
    `\`${cfg.embedDescription.slice(0, 100)}\`` + (cfg.embedDescription.length > 100 ? "…" : "");

  return new EmbedBuilder()
    .setTitle("✅ Verify Dashboard")
    .setDescription(
      `Manage one-click verification for **${guild.name}**.\nMembers click the Verify button to get the verified role.`
    )
    .setColor(0x2f9e44)
    .addFields(
      { name: "Status", value: cfg.enabled ? "**Enabled**" : "**Disabled**", inline: true },
      { name: "Channel", value: channel, inline: true },
      { name: "Message Posted", value: posted, inline: true },
      { name: "Verified Role", value: role, inline: true },
      { name: "Button Label", value: `\`${cfg.buttonLabel}\``, inline: true },
      { name: "Embed Title", value: `\`${cfg.embedTitle.slice(0, 80)}\``, inline: false },
      { name: "Embed Description", value: descPreview, inline: false }
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
      .setLabel(cfg.verifyMessageId ? "Refresh Message" : "Post Message")
      .setEmoji("🔄")
      .setStyle(ButtonStyle.Primary)
  );

  const menu = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(id("menu", guildId))
      .setPlaceholder("Select a setting to configure...")
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel("Set Channel")
          .setDescription("Pick an existing channel for the verify message")
          .setValue("verify_channel")
          .setEmoji("📢"),
        new StringSelectMenuOptionBuilder()
          .setLabel("Create #verify Channel")
          .setDescription("Make a fresh channel for verification")
          .setValue("create_channel")
          .setEmoji("🛠️"),
        new StringSelectMenuOptionBuilder()
          .setLabel("Set Verified Role")
          .setDescription("Role given when someone clicks Verify")
          .setValue("verified_role")
          .setEmoji("🎭"),
        new StringSelectMenuOptionBuilder()
          .setLabel("Edit Button Label")
          .setDescription("Text on the Verify button")
          .setValue("button_label")
          .setEmoji("🔘"),
        new StringSelectMenuOptionBuilder()
          .setLabel("Edit Embed Message")
          .setDescription("Title + description of the verify embed")
          .setValue("embed_message")
          .setEmoji("💬")
      )
  );
  return [buttons, menu];
}

/** Open the interactive verify dashboard (ephemeral). */
async function openDashboard(interaction) {
  return openDashboardShell(interaction, {
    prefix: "vf",
    feature: "verify",
    gateMessage:
      "You need the **Administrator** permission (or be a bot owner) to manage verification.",
    buildEmbed,
    buildComponents: mainComponents,
    getConfig,
    onComponent: (i, guild, ctx) => handleComponent(i, guild, ctx),
  });
}

async function handleComponent(i, guild, ctx) {
  const { render: rerender, rootInteraction } = ctx;
  const [, kind, guildId] = i.customId.split(":");
  const cfg = getConfig(guild.id);

  // ---- buttons ----
  if (i.componentType === ComponentType.Button) {
    if (kind === "toggle") {
      updateConfig(guild.id, { enabled: !cfg.enabled });
      await i.deferUpdate();
      // reflect the new state on the public message (button disabled when off)
      try {
        const { refreshVerifyMessage } = require("./setup");
        await refreshVerifyMessage(guild, getConfig(guild.id));
      } catch (err) {
        log.warn("verify toggle refresh failed:", err.message);
      }
      await rerender();
      return;
    }
    if (kind === "post") {
      await i.deferUpdate();
      try {
        const channel = await setupVerify(guild, getConfig(guild.id));
        await rootInteraction.followUp({
          content: `Verify message is live in <#${channel.id}>!`,
          flags: MessageFlags.Ephemeral,
        });
      } catch (err) {
        await rootInteraction.followUp({
          content: `Couldn't post the verify message: ${err.message}`,
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
    if (value === "verify_channel") {
      const picker = new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId(id("pick", "verify_channel", guildId))
          .setPlaceholder("Select the verify channel")
          .addChannelTypes(ChannelType.GuildText)
      );
      await i.update({ components: [picker, backRow(id("back", guildId))] });
      return;
    }
    if (value === "create_channel") {
      await i.deferUpdate();
      try {
        const channel = await createVerifyChannel(guild);
        await setupVerify(guild, getConfig(guild.id));
        await rootInteraction.followUp({
          content: `Created <#${channel.id}> and posted the verify message there!`,
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
    if (value === "verified_role") {
      const picker = new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId(id("pick", "verified_role", guildId))
          .setPlaceholder("Select the verified role")
          .setMinValues(1)
          .setMaxValues(1)
      );
      await i.update({ components: [picker, backRow(id("back", guildId))] });
      return;
    }
    if (value === "button_label") {
      const submitted = await showModal(i, id("modal", "button_label", guildId), "Button Label", [
        { id: "label", label: "Button label (max 80 chars)", value: cfg.buttonLabel, maxLength: 80 },
      ]);
      if (submitted) {
        const label = submitted.fields.getTextInputValue("label").trim() || cfg.buttonLabel;
        updateConfig(guild.id, { buttonLabel: label });
        try {
          const { refreshVerifyMessage } = require("./setup");
          await refreshVerifyMessage(guild, getConfig(guild.id));
        } catch (err) {
          log.warn("verify label refresh failed:", err.message);
        }
        await submitted.deferUpdate();
        await rerender();
      }
      return;
    }
    if (value === "embed_message") {
      const submitted = await showModal(i, id("modal", "embed_message", guildId), "Verify Embed Message", [
        { id: "title", label: "Embed title", value: cfg.embedTitle, maxLength: 256 },
        {
          id: "description",
          label: "Embed description",
          style: TextInputStyle.Paragraph,
          value: cfg.embedDescription,
          maxLength: 2000,
        },
      ]);
      if (submitted) {
        const title = submitted.fields.getTextInputValue("title").trim() || cfg.embedTitle;
        const description = submitted.fields.getTextInputValue("description").trim() || cfg.embedDescription;
        updateConfig(guild.id, { embedTitle: title, embedDescription: description });
        try {
          const { refreshVerifyMessage } = require("./setup");
          await refreshVerifyMessage(guild, getConfig(guild.id));
        } catch (err) {
          log.warn("verify embed refresh failed:", err.message);
        }
        await submitted.deferUpdate();
        await rerender();
      }
      return;
    }
  }

  // ---- pickers (customId: vf:pick:<kind>:<guildId>) ----
  // NOTE: destructured as [, kind="pick", guildId=<kind>, extra=<guildId>]
  if (kind === "pick") {
    const pickKind = guildId;

    if (pickKind === "verify_channel") {
      const c = getConfig(guild.id);
      const newChannelId = i.values[0];
      // Tidy up: delete our old message if the channel changed.
      if (c.verifyMessageId && c.verifyChannelId && c.verifyChannelId !== newChannelId) {
        try {
          const oldChannel = await guild.channels.fetch(c.verifyChannelId).catch(() => null);
          const oldMsg = oldChannel?.isTextBased()
            ? await oldChannel.messages.fetch(c.verifyMessageId).catch(() => null)
            : null;
          if (oldMsg?.author.id === guild.members.me.id) await oldMsg.delete().catch(() => {});
        } catch {}
        updateConfig(guild.id, { verifyMessageId: null });
      }
      updateConfig(guild.id, { verifyChannelId: newChannelId });
      try {
        await setupVerify(guild, getConfig(guild.id));
      } catch (err) {
        await i.deferUpdate();
        await rootInteraction.followUp({
          content: `Channel set, but couldn't post: ${err.message}`,
          flags: MessageFlags.Ephemeral,
        });
        await rerender();
        return;
      }
    } else if (pickKind === "verified_role") {
      updateConfig(guild.id, { verifiedRoleId: i.values[0] });
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
