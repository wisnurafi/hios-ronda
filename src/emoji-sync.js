/**
 * Shared custom-emoji sync — one implementation for every feature.
 *
 * Before this, honeypot/github/khodam/verify each had their own copy of
 * this logic (~419 lines total): upload bundled art as guild emojis, reuse
 * by name, fall back to unicode without Manage Emojis, and auto-refresh
 * when the art changes (md5-tracked in config `emojiHashes`).
 *
 * Usage from a feature (keeps the feature's own export names so call
 * sites don't change):
 *
 *   const path = require("path");
 *   const { ensureEmojis, emojiMention: mention } = require("../../emoji-sync");
 *   const { getConfig, updateConfig } = require("./store");
 *
 *   const ASSETS = path.join(__dirname, "assets");
 *   const ICONS = { warn: { file: "warn.png", name: "hios_hp_warn", fallback: "⚠️" } };
 *   const LEGACY_HASHES = { warn: "<md5 of art before tracking existed>" }; // optional
 *
 *   async function ensureHoneypotEmojis(guild) {
 *     return ensureEmojis(guild, {
 *       assetsDir: ASSETS, icons: ICONS, getConfig, updateConfig,
 *       feature: "honeypot", legacyHashes: LEGACY_HASHES,
 *     });
 *   }
 *   function emojiMention(emojis, key) { return mention(ICONS, emojis, key); }
 */

const fs = require("fs");
const crypto = require("crypto");
const path = require("path");
const { PermissionFlagsBits } = require("discord.js");
const { log } = require("./log");

function assetHash(assetsDir, file) {
  try {
    return crypto.createHash("md5").update(fs.readFileSync(path.join(assetsDir, file))).digest("hex");
  } catch {
    return null;
  }
}

/**
 * Ensure every icon in `icons` exists as a guild custom emoji.
 *
 * - Reuses the stored emoji id first, then falls back to lookup by name.
 * - Art-change aware: each asset's md5 is recorded in config
 *   (`emojiHashes`). When the bundled PNG changes, the old guild emoji is
 *   deleted and re-uploaded automatically on next startup. `legacyHashes`
 *   covers art that predates tracking so unchanged icons aren't churned
 *   on the first run (unknown provenance refreshes once, then is stable).
 * - Graceful without Manage Emojis: keeps the stale emoji or falls back
 *   to unicode rather than breaking the feature.
 *
 * Returns { key: {id,name}|null, ... } and persists it to config.
 */
async function ensureEmojis(guild, opts) {
  const { assetsDir, icons, getConfig, updateConfig, feature, legacyHashes = {} } = opts;
  const cfg = getConfig(guild.id);
  const stored = cfg.emojis || {};
  const recordedHashes = cfg.emojiHashes || {};
  const out = {};
  const newHashes = { ...recordedHashes };

  const canManage = guild.members.me?.permissions.has(PermissionFlagsBits.ManageEmojisAndStickers);

  for (const [key, icon] of Object.entries(icons)) {
    const currentHash = assetHash(assetsDir, icon.file);

    // Find the current guild emoji: stored id first, then by name.
    let emoji = null;
    if (stored[key]?.id) {
      emoji = guild.emojis.cache.get(stored[key].id) || null;
    }
    if (!emoji) {
      emoji = guild.emojis.cache.find((e) => e.name === icon.name) || null;
    }

    // Has the bundled art changed since this emoji was uploaded?
    const recorded = recordedHashes[key] || null;
    let artChanged;
    if (!currentHash) {
      artChanged = false; // asset unreadable — leave the emoji alone
    } else if (recorded) {
      artChanged = recorded !== currentHash;
    } else if (legacyHashes[key]) {
      artChanged = legacyHashes[key] !== currentHash;
    } else {
      artChanged = true; // unknown provenance — refresh once, then stable
    }

    if (emoji && !artChanged) {
      out[key] = { id: emoji.id, name: emoji.name };
      newHashes[key] = currentHash;
      continue;
    }

    if (!canManage) {
      // Can't refresh without the permission — keep the stale emoji (or
      // fall back to unicode) rather than breaking the feature.
      if (emoji) out[key] = { id: emoji.id, name: emoji.name };
      else out[key] = null;
      if (artChanged) log.warn(`${feature} emoji art changed but no Manage Emojis permission (:${icon.name}:)`);
      continue;
    }

    try {
      if (emoji && artChanged) {
        await emoji.delete(`hios-ronda ${feature} icon art updated`).catch(() => {});
        log.debug(`emoji-sync: deleted stale :${icon.name}:`, { feature });
        emoji = null;
      }
      if (!emoji) {
        const created = await guild.emojis.create({
          attachment: fs.readFileSync(path.join(assetsDir, icon.file)),
          name: icon.name,
          reason: `hios-ronda ${feature} icons`,
        });
        emoji = created;
        log.info("emoji-sync uploaded", { feature, emoji: `:${icon.name}:` });
      }
      out[key] = { id: emoji.id, name: emoji.name };
      newHashes[key] = currentHash;
    } catch (err) {
      log.warn(`${feature} emoji upload failed (:${icon.name}:): ${err.message}`);
      out[key] = emoji ? { id: emoji.id, name: emoji.name } : null;
    }
  }

  const synced = Object.values(out).filter(Boolean).length;
  log.info("emoji-sync done", { feature, synced, total: Object.keys(icons).length });
  updateConfig(guild.id, { emojis: out, emojiHashes: newHashes });
  return out;
}

/** `<:name:id>` mention, or the icon's unicode fallback. */
function emojiMention(icons, emojis, key) {
  const e = emojis?.[key];
  if (e?.id) return `<:${e.name}:${e.id}>`;
  return icons[key]?.fallback || "❓";
}

module.exports = { ensureEmojis, emojiMention };
