/**
 * Custom emojis for the GitHub logs embeds (push / PR / release icons).
 * Uploaded to the guild once and reused by name — same pattern as the
 * honeypot icons and hios-bot's tempvoice interface icons.
 * Falls back to unicode when the bot can't manage emojis.
 */

const fs = require("fs");
const path = require("path");
const { PermissionFlagsBits } = require("discord.js");
const { log } = require("../../log");
const { getConfig, updateConfig } = require("./store");

const ASSETS = path.join(__dirname, "assets");

// key -> { file, name, fallback }
const ICONS = {
  push: { file: "push.png", name: "hios_gh_push", fallback: "📦" },
  pr: { file: "pr.png", name: "hios_gh_pr", fallback: "🔀" },
  release: { file: "release.png", name: "hios_gh_release", fallback: "🚀" },
};

/**
 * Ensure the white icons exist as custom emojis. Reuses by name.
 * Returns { push: {id,name}|null, pr, release } and persists to config.
 */
async function ensureGithubEmojis(guild) {
  const cfg = getConfig(guild.id);
  const stored = cfg.emojis || {};
  const out = {};

  const canManage = guild.members.me?.permissions.has(PermissionFlagsBits.ManageEmojisAndStickers);
  for (const [key, icon] of Object.entries(ICONS)) {
    // reuse stored emoji if it still exists
    if (stored[key]?.id) {
      const existing = guild.emojis.cache.get(stored[key].id);
      if (existing) {
        out[key] = { id: existing.id, name: existing.name };
        continue;
      }
    }
    // reuse by name
    const byName = guild.emojis.cache.find((e) => e.name === icon.name);
    if (byName) {
      out[key] = { id: byName.id, name: byName.name };
      continue;
    }
    if (!canManage) {
      out[key] = null;
      continue;
    }
    try {
      const created = await guild.emojis.create({
        attachment: fs.readFileSync(path.join(ASSETS, icon.file)),
        name: icon.name,
        reason: "hios-ronda github logs icons",
      });
      out[key] = { id: created.id, name: created.name };
      log(`uploaded emoji :${icon.name}:`);
    } catch (err) {
      log(`emoji upload failed (:${icon.name}:): ${err.message}`);
      out[key] = null;
    }
  }

  updateConfig(guild.id, { emojis: out });
  return out;
}

/** `<:name:id>` mention, or the unicode fallback. */
function emojiMention(emojis, key) {
  const e = emojis?.[key];
  if (e?.id) return `<:${e.name}:${e.id}>`;
  return ICONS[key].fallback;
}

module.exports = { ensureGithubEmojis, emojiMention, ICONS };
