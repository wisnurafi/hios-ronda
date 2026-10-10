/**
 * /control — restrict WHERE (channels) and BY WHOM (users) slash commands
 * can be used, with per-command exceptions.
 *
 * Ported 1:1 from hios-bot's src/commands/Core/control.js:
 *   /control channel add|remove|list|clear
 *   /control user    add|remove|list|clear
 *   /control except  add|remove|list|clear   (autocomplete from registered commands)
 *   /control status
 *
 * Empty allowlists = no restriction (default). Bot owners always bypass.
 * Manage Server permission required to configure.
 */

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const { log } = require("../../log");
const { loadControlLockdown, saveControlLockdown } = require("./store");

const EPHEMERAL = { flags: MessageFlags.Ephemeral };

async function ensureManageGuild(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({
      ...EPHEMERAL,
      content: "You need the **Manage Server** permission to configure control lockdown.",
    });
    return false;
  }
  return true;
}

function addCrudSubcommands(group, kind, labels) {
  const addOption = (sub) => {
    if (kind === "channel") {
      return sub.addChannelOption((option) =>
        option
          .setName("channel")
          .setDescription("Channel to allow/deny")
          .setRequired(true)
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      );
    }
    if (kind === "user") {
      return sub.addUserOption((option) =>
        option.setName("user").setDescription("User to allow/deny").setRequired(true)
      );
    }
    return sub.addStringOption((option) =>
      option
        .setName("command")
        .setDescription("Slash command name (e.g. watch)")
        .setRequired(true)
        .setAutocomplete(true)
    );
  };

  return group
    .addSubcommand((sub) => addOption(sub.setName("add").setDescription(labels.add)))
    .addSubcommand((sub) => addOption(sub.setName("remove").setDescription(labels.remove)))
    .addSubcommand((sub) => sub.setName("list").setDescription(labels.list))
    .addSubcommand((sub) => sub.setName("clear").setDescription(labels.clear));
}

const controlCommand = new SlashCommandBuilder()
  .setName("control")
  .setDescription("Restrict where and by whom this bot can be controlled")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setDMPermission(false)
  .addSubcommandGroup((group) =>
    addCrudSubcommands(group.setName("channel").setDescription("Manage allowed control channels"), "channel", {
      add: "Allow bot control in a channel",
      remove: "Remove a channel from the allowlist",
      list: "List allowed control channels",
      clear: "Clear the channel allowlist (no channel restriction)",
    })
  )
  .addSubcommandGroup((group) =>
    addCrudSubcommands(group.setName("user").setDescription("Manage who can control the bot"), "user", {
      add: "Allow a user to control the bot",
      remove: "Remove a user from the allowlist",
      list: "List allowed controllers",
      clear: "Clear the user allowlist (no user restriction)",
    })
  )
  .addSubcommandGroup((group) =>
    addCrudSubcommands(group.setName("except").setDescription("Manage commands that bypass the lockdown"), "except", {
      add: "Except a command from the lockdown",
      remove: "Remove a command exception",
      list: "List excepted commands",
      clear: "Clear all command exceptions",
    })
  )
  .addSubcommand((subcommand) =>
    subcommand.setName("status").setDescription("Show the current control lockdown config")
  );

function embed({ title, description, color = 0x2b6cb0, fields = [], footer = null }) {
  const e = new EmbedBuilder().setTitle(title).setDescription(description).setColor(color);
  if (fields.length) e.addFields(fields);
  if (footer) e.setFooter({ text: footer });
  return e;
}

async function handleChannel(interaction, sub, guildId) {
  const lockdown = loadControlLockdown(guildId);

  if (sub === "list") {
    return interaction.reply({
      ...EPHEMERAL,
      embeds: [
        embed({
          title: "🔒 Allowed Control Channels",
          description:
            lockdown.channels.length > 0
              ? lockdown.channels.map((id) => `• <#${id}>`).join("\n")
              : "_No restriction — commands work in every channel._",
        }),
      ],
    });
  }

  if (sub === "clear") {
    lockdown.channels = [];
    saveControlLockdown(guildId, lockdown);
    return interaction.reply({
      ...EPHEMERAL,
      embeds: [
        embed({
          title: "✅ Channel Allowlist Cleared",
          description: "No channel restriction — commands work everywhere.",
          color: 0x2f9e44,
        }),
      ],
    });
  }

  const channel = interaction.options.getChannel("channel", true);
  if (sub === "add") {
    if (!lockdown.channels.includes(channel.id)) {
      lockdown.channels.push(channel.id);
      saveControlLockdown(guildId, lockdown);
    }
    return interaction.reply({
      ...EPHEMERAL,
      embeds: [
        embed({
          title: "✅ Channel Allowed",
          description: `<#${channel.id}> added — the bot can now be controlled there.`,
          color: 0x2f9e44,
        }),
      ],
    });
  }

  // remove
  lockdown.channels = lockdown.channels.filter((id) => id !== channel.id);
  saveControlLockdown(guildId, lockdown);
  return interaction.reply({
    ...EPHEMERAL,
    embeds: [
      embed({
        title: "✅ Channel Removed",
        description: `<#${channel.id}> removed from the allowlist.`,
        color: 0x2f9e44,
      }),
    ],
  });
}

async function handleUser(interaction, sub, guildId) {
  const lockdown = loadControlLockdown(guildId);

  if (sub === "list") {
    return interaction.reply({
      ...EPHEMERAL,
      embeds: [
        embed({
          title: "🔒 Allowed Controllers",
          description:
            lockdown.users.length > 0
              ? lockdown.users.map((id) => `• <@${id}>`).join("\n")
              : "_No restriction — anyone can control the bot (subject to command permissions)._",
        }),
      ],
    });
  }

  if (sub === "clear") {
    lockdown.users = [];
    saveControlLockdown(guildId, lockdown);
    return interaction.reply({
      ...EPHEMERAL,
      embeds: [
        embed({
          title: "✅ User Allowlist Cleared",
          description: "No user restriction — anyone can control the bot.",
          color: 0x2f9e44,
        }),
      ],
    });
  }

  const user = interaction.options.getUser("user", true);
  if (sub === "add") {
    if (!lockdown.users.includes(user.id)) {
      lockdown.users.push(user.id);
      saveControlLockdown(guildId, lockdown);
    }
    return interaction.reply({
      ...EPHEMERAL,
      embeds: [
        embed({
          title: "✅ Controller Added",
          description: `<@${user.id}> can now control the bot.`,
          color: 0x2f9e44,
        }),
      ],
    });
  }

  // remove
  lockdown.users = lockdown.users.filter((id) => id !== user.id);
  saveControlLockdown(guildId, lockdown);
  return interaction.reply({
    ...EPHEMERAL,
    embeds: [
      embed({
        title: "✅ Controller Removed",
        description: `<@${user.id}> removed from the allowlist.`,
        color: 0x2f9e44,
      }),
    ],
  });
}

async function handleExcept(interaction, sub, guildId, knownCommands) {
  const lockdown = loadControlLockdown(guildId);

  if (sub === "list") {
    return interaction.reply({
      ...EPHEMERAL,
      embeds: [
        embed({
          title: "🔒 Excepted Commands",
          description:
            lockdown.except.length > 0
              ? lockdown.except.map((name) => `• \`/${name}\``).join("\n")
              : "_None — every command is subject to the lockdown._",
          footer: "Excepted commands bypass the lockdown entirely",
        }),
      ],
    });
  }

  if (sub === "clear") {
    lockdown.except = [];
    saveControlLockdown(guildId, lockdown);
    return interaction.reply({
      ...EPHEMERAL,
      embeds: [
        embed({
          title: "✅ Exceptions Cleared",
          description: "No command is excepted from the lockdown.",
          color: 0x2f9e44,
        }),
      ],
    });
  }

  const name = interaction.options.getString("command", true).toLowerCase().trim();
  if (!knownCommands.includes(name)) {
    return interaction.reply({
      ...EPHEMERAL,
      content: `Unknown command \`/${name}\`. Pick one from the autocomplete suggestions.`,
    });
  }

  if (sub === "add") {
    if (!lockdown.except.includes(name)) {
      lockdown.except.push(name);
      saveControlLockdown(guildId, lockdown);
    }
    return interaction.reply({
      ...EPHEMERAL,
      embeds: [
        embed({
          title: "✅ Command Excepted",
          description: `\`/${name}\` now bypasses the control lockdown.`,
          color: 0x2f9e44,
        }),
      ],
    });
  }

  // remove
  lockdown.except = lockdown.except.filter((n) => n !== name);
  saveControlLockdown(guildId, lockdown);
  return interaction.reply({
    ...EPHEMERAL,
    embeds: [
      embed({
        title: "✅ Exception Removed",
        description: `\`/${name}\` is subject to the lockdown again.`,
        color: 0x2f9e44,
      }),
    ],
  });
}

async function handleStatus(interaction, guildId) {
  const lockdown = loadControlLockdown(guildId);
  const active = lockdown.channels.length > 0 || lockdown.users.length > 0;
  return interaction.reply({
    ...EPHEMERAL,
    embeds: [
      embed({
        title: "🔒 Control Lockdown Status",
        description: active
          ? "**Lockdown is ACTIVE.**"
          : "**Lockdown is OFF** — no channel or user restrictions.",
        color: active ? 0xe3a008 : 0x2f9e44,
        fields: [
          {
            name: "Allowed channels",
            value:
              lockdown.channels.length > 0
                ? lockdown.channels.map((id) => `<#${id}>`).join(" ")
                : "_No restriction_",
            inline: false,
          },
          {
            name: "Allowed users",
            value:
              lockdown.users.length > 0
                ? lockdown.users.map((id) => `<@${id}>`).join(" ")
                : "_No restriction_",
            inline: false,
          },
          {
            name: "Excepted commands",
            value:
              lockdown.except.length > 0
                ? lockdown.except.map((n) => `\`/${n}\``).join(" ")
                : "_None_",
            inline: false,
          },
        ],
        footer: "Bot owners always bypass the lockdown",
      }),
    ],
  });
}

/** /control dispatcher — called by registerControl after the lockdown guard. */
async function handleControlCommand(interaction, knownCommands) {
  if (!(await ensureManageGuild(interaction))) return;

  try {
    const guildId = interaction.guild.id;
    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();

    if (sub === "status" && !group) {
      return await handleStatus(interaction, guildId);
    }

    switch (group) {
      case "channel":
        return await handleChannel(interaction, sub, guildId);
      case "user":
        return await handleUser(interaction, sub, guildId);
      case "except":
        return await handleExcept(interaction, sub, guildId, knownCommands);
      default:
        return await interaction.reply({
          ...EPHEMERAL,
          content: "Unknown subcommand.",
        });
    }
  } catch (error) {
    log.warn("control command error:", error.message);
    try {
      await interaction.reply({
        ...EPHEMERAL,
        content: "Failed to update the control lockdown. Please try again.",
      });
    } catch {
      // interaction may already be replied — nothing more to do
    }
  }
}

/** Autocomplete for `/control except` — suggests registered command names. */
async function handleControlAutocomplete(interaction, knownCommands) {
  try {
    const group = interaction.options.getSubcommandGroup(false);
    if (group !== "except") return;
    const focused = (interaction.options.getFocused() || "").toLowerCase();
    const names = knownCommands
      .filter((name) => name.toLowerCase().includes(focused))
      .sort()
      .slice(0, 25);
    await interaction.respond(names.map((name) => ({ name: `/${name}`, value: name }))).catch(() => {});
  } catch {
    await interaction.respond([]).catch(() => {});
  }
}

module.exports = { controlCommand, handleControlCommand, handleControlAutocomplete };
