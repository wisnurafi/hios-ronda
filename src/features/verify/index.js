/**
 * Verify feature wiring.
 *
 * - /verify (slash) → admin dashboard (subject to control lockdown).
 * - Verify button (component) → public one-click verify for members.
 *   Component interactions are intentionally NOT behind the control
 *   lockdown — like hios-bot, public panels must keep working for everyone.
 */

const { Events } = require("discord.js");
const { log, runWithTraceContext, createInteractionTraceContext } = require("../../log");
const { getConfig } = require("./store");
const { enforceControlLockdown } = require("../control");
const { openDashboard } = require("./dashboard");
const { handleVerifyButton } = require("./handler");
const { refreshVerifyMessage } = require("./setup");
const { VERIFY_BUTTON_ID } = require("./setup");

function registerVerify(client) {
  client.once(Events.ClientReady, async (c) => {
    // Keep the posted message in sync on (re)connect: fresh button emoji
    // after art swaps, correct disabled state, latest copy.
    for (const [guildId, guild] of c.guilds.cache) {
      try {
        const cfg = getConfig(guildId);
        if (cfg.verifyMessageId) {
          await refreshVerifyMessage(guild, cfg);
        }
      } catch (err) {
        log("verify startup refresh error:", err.message);
      }
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    const isDashboardCmd =
      interaction.isChatInputCommand() && interaction.commandName === "verify";
    const isVerifyButton = interaction.isButton() && interaction.customId === VERIFY_BUTTON_ID;
    if (!isDashboardCmd && !isVerifyButton) return;
    await runWithTraceContext(createInteractionTraceContext(interaction), async () => {
      try {
        if (isDashboardCmd) {
          if (await enforceControlLockdown(interaction)) return;
          log.info("verify dashboard opened");
          await openDashboard(interaction);
        } else {
          await handleVerifyButton(interaction);
        }
      } catch (err) {
        log.warn("verify interaction error:", err.message);
      }
    });
  });
}

module.exports = { registerVerify };
