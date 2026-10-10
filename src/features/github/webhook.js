/**
 * The "HIOS | GitHub" webhook — the feed posts through this so the sender
 * carries the HIOS Agent identity (name + GitHub avatar) instead of the
 * bot user. Same pattern as the honeypot logs webhook.
 */

const fs = require("fs");
const crypto = require("crypto");
const path = require("path");
const { log } = require("../../log");
const { getConfig, updateConfig } = require("./store");

const AVATAR_PNG = path.join(__dirname, "assets", "avatar.png");
const WEBHOOK_NAME = "HIOS | GitHub";

function assetHash() {
  try {
    return crypto.createHash("md5").update(fs.readFileSync(AVATAR_PNG)).digest("hex").slice(0, 12);
  } catch {
    return null;
  }
}

/** Get (or create) the webhook in the guild's configured target channel. */
async function getGithubWebhook(guild, cfg) {
  if (!cfg.channelId) return null;
  const client = guild.client;

  if (cfg.webhookId && cfg.webhookToken) {
    try {
      return await client.fetchWebhook(cfg.webhookId, cfg.webhookToken);
    } catch {
      log.warn("github: stored webhook gone, recreating");
    }
  }

  let channel;
  try {
    channel = await guild.channels.fetch(cfg.channelId);
  } catch {
    return null;
  }
  if (!channel?.isTextBased() || typeof channel.createWebhook !== "function") return null;

  try {
    const hook = await channel.createWebhook({
      name: WEBHOOK_NAME,
      avatar: fs.readFileSync(AVATAR_PNG),
      reason: "hios-ronda github logs identity",
    });
    updateConfig(guild.id, {
      webhookId: hook.id,
      webhookToken: hook.token,
      webhookAvatarHash: assetHash(),
    });
    log(`github: created webhook in #${channel.name}`);
    return hook;
  } catch (err) {
    log.warn(`github: webhook create failed: ${err.message}`);
    return null;
  }
}

/** Drop the stored webhook (e.g. target channel changed). */
function forgetGithubWebhook(guildId) {
  updateConfig(guildId, { webhookId: null, webhookToken: null, webhookAvatarHash: null });
}

module.exports = { getGithubWebhook, forgetGithubWebhook, WEBHOOK_NAME };
