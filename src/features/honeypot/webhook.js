const fs = require("fs");
const crypto = require("crypto");
const path = require("path");
const { log } = require("../../log");
const { getConfig, updateConfig } = require("./store");

const HONEYPOT_PNG = path.join(__dirname, "assets", "honeypot.png");
const WEBHOOK_NAME = "HIOS | Honeypot";

function assetHash() {
  try {
    return crypto.createHash("md5").update(fs.readFileSync(HONEYPOT_PNG)).digest("hex").slice(0, 12);
  } catch {
    return null;
  }
}

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
      log.warn("stored logs webhook gone, recreating");
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
    updateConfig(guild.id, {
      logsWebhookId: hook.id,
      logsWebhookToken: hook.token,
      webhookAvatarHash: assetHash(),
    });
    log(`created logs webhook in #${channel.name}`);
    return hook;
  } catch (err) {
    log.warn(`webhook create failed: ${err.message}`);
    return null;
  }
}

/** Drop the stored webhook (e.g. logs channel changed). */
function forgetLogsWebhook(guildId) {
  updateConfig(guildId, { logsWebhookId: null, logsWebhookToken: null, webhookAvatarHash: null });
}

/**
 * Update the existing logs webhook's avatar if the bundled pot art changed
 * (e.g. the user swapped in nicer artwork). Cheap: one md5 compare.
 */
async function syncLogsWebhookAvatar(guild, cfg) {
  const hash = assetHash();
  if (!hash || cfg.webhookAvatarHash === hash) return;
  const hook = await getLogsWebhook(guild, cfg);
  if (!hook) return;
  try {
    await hook.edit({ avatar: fs.readFileSync(HONEYPOT_PNG) });
    updateConfig(guild.id, { webhookAvatarHash: hash });
    log("updated logs webhook avatar");
  } catch (err) {
    log.warn(`webhook avatar update failed: ${err.message}`);
  }
}

module.exports = { getLogsWebhook, forgetLogsWebhook, syncLogsWebhookAvatar, WEBHOOK_NAME };
