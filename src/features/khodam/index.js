/**
 * Khodam feature wiring.
 *
 * - /khodam (slash) → admin dashboard (subject to control lockdown).
 * - Panel buttons + selects (components) → the game itself.
 *   Component interactions are intentionally NOT behind the control
 *   lockdown — like verify/honeypot, public panels must keep working
 *   for everyone.
 */

const { Events } = require("discord.js");
const { log } = require("../../log");
const { getConfig } = require("./store");
const { enforceControlLockdown } = require("../control");
const { ensureKhodamEmojis } = require("./emojis");
const { postOrRefreshPanel } = require("./panel");
const { openDashboard } = require("./dashboard");
const { handleKhodamButton, handleKhodamSelect } = require("./handler");
const { initDb, startReconnectLoop } = require("./db");

function registerKhodam(client) {
  // DB + auto-migrate first; game handlers no-op until the DB is ready.
  initDb()
    .then(() => startReconnectLoop())
    .catch((err) => log("khodam init error:", err.message));

  client.once(Events.ClientReady, async (c) => {
    // Keep the posted panel in sync on (re)connect: fresh button emoji
    // after art swaps, latest copy.
    for (const [guildId, guild] of c.guilds.cache) {
      try {
        const emojis = await ensureKhodamEmojis(guild);
        const cfg = getConfig(guildId);
        if (cfg.messageId) {
          await postOrRefreshPanel(guild, emojis).catch((err) =>
            log("khodam startup panel refresh error:", err.message)
          );
        }
      } catch (err) {
        log("khodam startup error:", err.message);
      }
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isChatInputCommand() && interaction.commandName === "khodam") {
        if (await enforceControlLockdown(interaction)) return;
        await openDashboard(interaction);
      } else if (interaction.isButton() && interaction.customId.startsWith("hios_kh_")) {
        await handleKhodamButton(interaction);
      } else if (
        (interaction.isStringSelectMenu() || interaction.isUserSelectMenu()) &&
        interaction.customId.startsWith("hios_kh_")
      ) {
        await handleKhodamSelect(interaction);
      }
    } catch (err) {
      log.warn("khodam interaction error:", err.message);
    }
  });
}

module.exports = { registerKhodam };
