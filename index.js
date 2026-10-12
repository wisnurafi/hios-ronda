/**
 * hios-ronda — patrol bot for Discord Go Live streams.
 *
 * Entrypoint lives at the repo root (hosting requirement).
 * Feature modules live under src/features/ — add new ones there
 * and wire them in main() below.
 */

const { Events } = require("discord.js");
const config = require("./src/config");
const { log } = require("./src/log");
const { createClient } = require("./src/client");
const { deployCommands, commandNames } = require("./src/commands");
const { registerControl } = require("./src/features/control");
const { registerPing } = require("./src/features/ping");
const { registerVerify } = require("./src/features/verify");
const { registerKhodam } = require("./src/features/khodam");
const { registerStatus } = require("./src/features/status");
const { registerStreamwatch } = require("./src/features/streamwatch");
const { registerHoneypot } = require("./src/features/honeypot");
const { registerVoiceStats } = require("./src/features/voice-stats");
const { registerHelp } = require("./src/features/help");
const { registerGithub } = require("./src/features/github");

async function main() {
  const client = createClient();

  client.once(Events.ClientReady, (c) => {
    // All slash commands (/honeypot, /watch, /begadang, /rapot, /help,
    // /github, /control, /ping, /verify, /khodam) deployed together in one
    // payload — guild PUT replaces the whole command list.
    deployCommands(c).catch((err) => log("deployCommands error:", err.message));
    log.info("ready", { user: c.user.tag, guilds: c.guilds.cache.size });
  });

  // --- features ---
  // Control lockdown registers its own listener; its guard is called by
  // each feature's slash-command branch (see enforceControlLockdown).
  registerControl(client, commandNames);
  registerPing(client);
  registerStatus(client, config);
  registerVerify(client);
  registerKhodam(client);
  registerStreamwatch(client, config);
  registerHoneypot(client);
  registerVoiceStats(client, config);
  registerHelp(client);
  registerGithub(client);
  // registerYourNextFeature(client, config);
  log.info("features registered", {
    features: "control,ping,status,verify,khodam,streamwatch,honeypot,voice-stats,help,github",
  });

  process.on("unhandledRejection", (err) => log("unhandled rejection:", err?.message || err));
  process.on("SIGINT", () => {
    log("shutting down");
    client.destroy();
    process.exit(0);
  });

  log.info("logging in...");
  await client.login(config.token);
}

main().catch((err) => {
  log.error("fatal:", err?.message || err);
  process.exit(1);
});
