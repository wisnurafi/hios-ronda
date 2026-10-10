/**
 * /control wiring.
 *
 * hios-bot enforces its lockdown inside a central interactionCreate
 * middleware. hios-ronda has no central middleware — every feature owns its
 * own InteractionCreate listener — so the equivalent lives here as a guard:
 * every slash-command handler calls `enforceControlLockdown(interaction)`
 * first and returns early when it blocks.
 *
 * Semantics are identical to hios-bot:
 * - Slash commands only (buttons/modals on public panels are untouched).
 * - Bot owner bypasses; excepted commands bypass entirely.
 * - Empty allowlists = no restriction. Store errors fail OPEN.
 */

const { Events, MessageFlags } = require("discord.js");
const { log } = require("../../log");
const { isBotOwner } = require("../../owner");
const { loadControlLockdown } = require("./store");
const { checkControlLockdown } = require("./check");
const { handleControlCommand, handleControlAutocomplete } = require("./commands");

let KNOWN_COMMANDS = [];

/**
 * Enforce the control lockdown for a slash command interaction.
 * Returns true when the invocation is BLOCKED (denial already replied),
 * false when it is allowed. Call this first in every ChatInputCommand branch.
 */
async function enforceControlLockdown(interaction) {
  try {
    const lockdown = loadControlLockdown(interaction.guildId);
    const block = checkControlLockdown(lockdown, {
      commandName: interaction.commandName,
      userId: interaction.user.id,
      channelId: interaction.channelId,
      parentChannelId: interaction.channel?.parentId ?? null,
      isOwner: isBotOwner(interaction.user.id),
    });
    if (!block) return false;

    log(
      `control lockdown blocked /${interaction.commandName} (${block.reason}) for ${interaction.user.tag} in ${interaction.guildId}`
    );
    if (!interaction.deferred && !interaction.replied) {
      await interaction.reply({
        content: `🔒 ${block.message}`,
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
    }
    return true;
  } catch (err) {
    // Fail open — a broken store must not lock everyone out.
    log.warn("control lockdown check failed (failing open):", err.message);
    return false;
  }
}

function registerControl(client, knownCommands = []) {
  KNOWN_COMMANDS = knownCommands;

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isAutocomplete() && interaction.commandName === "control") {
        await handleControlAutocomplete(interaction, KNOWN_COMMANDS);
        return;
      }
      if (interaction.isChatInputCommand() && interaction.commandName === "control") {
        // /control is subject to the lockdown too, exactly like hios-bot
        // (owner bypasses; except /control if you always want it usable).
        if (await enforceControlLockdown(interaction)) return;
        await handleControlCommand(interaction, KNOWN_COMMANDS);
      }
    } catch (err) {
      log.warn("control interaction error:", err.message);
    }
  });
}

module.exports = { registerControl, enforceControlLockdown };
