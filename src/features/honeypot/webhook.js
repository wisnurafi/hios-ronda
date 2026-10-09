const fs = require("fs");
const path = require("path");
const { log } = require("../../log");
const { getConfig, updateConfig } = require("./store");

const HONEYPOT_PNG = path.join(__dirname, "assets", "honeypot.png");
const WEBHOOK_NAME = "HIOS | Honeypot";

/**
 * Get (or create) the "HIOS | Honeypot" webhook in the logs channel.
 * Log messages sent through it carry the reference bot's identity
 * (name + pot avatar) instead of this bot's.
 */
async function getLogsWebhook(guild, cfg) {
  if (!cfg.logsChannelId) return null;

  const client = guild.client;

  // Reuse stored webhook if it still exists.
  if (cfg.logsWebhookId && cfg.logsWebhookToken) {
    try {
      const hook = await client.fetchWebhook(cfg.logsWebhookId, cfg.logsWebhookToken);
      return hook;
    } catch {
      log("stored logs webhook gone, recreating");
    }
  }

  let channel;
  try {
    channel = await guild.channels.fetch(cfg.logsChannelId);
  } catch {
    return null;
  }
  if (!channel?.isTextBased() || typeof channel.createWebhook !== "function") return null;

  try {
    const avatar = fs.readFileSync(HONEYPOT_PNG);
    const hook = await channel.createWebhook({
      name: WEBHOOK_NAME,
      avatar,
      reason: "hios-ronda honeypot log identity",
    });
    updateConfig(guild.id, { logsWebhookId: hook.id, logsWebhookToken: hook.token });
    log(`created logs webhook in #${channel.name}`);
    return hook;
  } catch (err) {
    log(`webhook create failed: ${err.message}`);
    return null;
  }
}

/** Drop the stored webhook (e.g. logs channel changed). */
function forgetLogsWebhook(guildId) {
  updateConfig(guildId, { logsWebhookId: null, logsWebhookToken: null });
}

module.exports = { getLogsWebhook, forgetLogsWebhook, WEBHOOK_NAME };
