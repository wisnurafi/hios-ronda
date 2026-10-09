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
const { registerStreamwatch } = require("./src/features/streamwatch");
const { registerHoneypot } = require("./src/features/honeypot");

async function main() {
  const client = createClient();

  client.once(Events.ClientReady, (c) => {
    // Presence is owned by refreshWatchStatus (streamwatch): bubble always,
    // plus a Watching activity while someone is live. It runs on every
    // ready (incl. reconnects) via registerStreamwatch below.
    log(`online as ${c.user.tag}`);
  });

  // --- features ---
  registerStreamwatch(client, config);
  registerHoneypot(client);
  // registerYourNextFeature(client, config);

  process.on("unhandledRejection", (err) => log("unhandled rejection:", err?.message || err));
  process.on("SIGINT", () => {
    log("shutting down");
    client.destroy();
    process.exit(0);
  });

  await client.login(config.token);
}

main().catch((err) => {
  log("fatal:", err?.message || err);
  process.exit(1);
});
