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
const { log, runWithTraceContext, createInteractionTraceContext } = require("../../log");
const { getConfig } = require("./store");
const { enforceControlLockdown } = require("../control");
const { ensureKhodamEmojis } = require("./emojis");
const { postOrRefreshPanel } = require("./panel");
const { openDashboard } = require("./dashboard");
const { handleKhodamButton, handleKhodamSelect, cancelScheduledBump } = require("./handler");
const { initDb, startReconnectLoop } = require("./db");

function registerKhodam(client) {
  // DB + auto-migrate first; game handlers no-op until the DB is ready.
  initDb()
    .then(() => startReconnectLoop())
    .catch((err) => log("khodam init error:", err.message));

  client.once(Events.ClientReady, async (c) => {
    // Keep the posted panel in sync on (re)connect: fresh button emoji
    // after art swaps, latest copy.
    let refreshed = 0;
    for (const [guildId, guild] of c.guilds.cache) {
      try {
        const emojis = await ensureKhodamEmojis(guild);
        const cfg = getConfig(guildId);
        if (cfg.messageId) {
          await postOrRefreshPanel(guild, emojis).catch((err) =>
            log("khodam startup panel refresh error:", err.message)
          );
          refreshed++;
        }
      } catch (err) {
        log("khodam startup error:", err.message);
      }
    }
    log(`khodam: startup panel refresh done (${refreshed} panel(s) across ${c.guilds.cache.size} guild(s))`);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    const isDashboardCmd =
      interaction.isChatInputCommand() && interaction.commandName === "khodam";
    const isGameComponent =
      (interaction.isButton() ||
        interaction.isStringSelectMenu() ||
        interaction.isUserSelectMenu()) &&
      interaction.customId.startsWith("hios_kh_");
    if (!isDashboardCmd && !isGameComponent) return;

    await runWithTraceContext(createInteractionTraceContext(interaction), async () => {
      try {
        if (isDashboardCmd) {
          if (await enforceControlLockdown(interaction)) return;
          log.info("khodam dashboard opened");
          await openDashboard(interaction);
        } else if (interaction.isButton()) {
          await handleKhodamButton(interaction);
        } else {
          await handleKhodamSelect(interaction);
        }
      } catch (err) {
        log.warn("khodam interaction error:", err.message);
      }
    });
  });

  // Cancel a queued panel bump when the bot leaves/is removed from a guild.
  client.on(Events.GuildDelete, (guild) => {
    try {
      cancelScheduledBump(guild.id);
    } catch (err) {
      log.warn("khodam guild cleanup error:", err.message);
    }
  });
}

module.exports = { registerKhodam };
