const fs = require("fs");
const crypto = require("crypto");
const path = require("path");
const { PermissionFlagsBits } = require("discord.js");
const { log } = require("../../log");
const { getConfig, updateConfig } = require("./store");

const ASSETS = path.join(__dirname, "assets");

// key -> { file, name, fallback }
const ICONS = {
  warn: { file: "warn.png", name: "hios_hp_warn", fallback: "⚠️" },
  info: { file: "info.png", name: "hios_hp_info", fallback: "ℹ️" },
  honey: { file: "honey.png", name: "hios_hp_honey", fallback: "🍯" },
  forward: { file: "forward.png", name: "hios_hp_forward", fallback: "↩️" },
};

// md5 of the bundled art BEFORE hash tracking existed (2026-10-11).
// Lets the first run with tracking tell "old art, unchanged" apart from
// "art swapped" without re-uploading everything.
const LEGACY_HASHES = {
  warn: "81be1c4eb233d033da28c225d29214d9",
  info: "0c9d66408316277ab801c86001c384fb",
  honey: "73b0a91361b12baedb4d87e19089ce23",
  forward: "fbef7c205bfd6101bf9597eb703f3b03",
};

function assetHash(file) {
  try {
    return crypto.createHash("md5").update(fs.readFileSync(path.join(ASSETS, file))).digest("hex");
  } catch {
    return null;
  }
}

/**
 * Ensure the clean flat-white icons exist as custom emojis
 * (same pattern as hios-bot's interface emojis). Reuses by name.
 *
 * Art-change aware (mirrors syncLogsWebhookAvatar): each icon's asset hash
 * is recorded in config (`emojiHashes`). When the bundled PNG changes
 * (e.g. the user swaps in new artwork), the old guild emoji is deleted
 * and re-uploaded automatically on next startup. First run with tracking
 * falls back to LEGACY_HASHES so unchanged icons are NOT churned.
 *
 * Returns { warn: {id,name}|null, info, honey, forward } and persists to config.
 */
async function ensureHoneypotEmojis(guild) {
  const cfg = getConfig(guild.id);
  const stored = cfg.emojis || {};
  const recordedHashes = cfg.emojiHashes || {};
  const out = {};
  const newHashes = { ...recordedHashes };

  const canManage = guild.members.me?.permissions.has(PermissionFlagsBits.ManageEmojisAndStickers);

  for (const [key, icon] of Object.entries(ICONS)) {
    const currentHash = assetHash(icon.file);

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
    } else if (LEGACY_HASHES[key]) {
      artChanged = LEGACY_HASHES[key] !== currentHash;
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
      if (artChanged) log.warn(`emoji art changed but no Manage Emojis permission (:${icon.name}:)`);
      continue;
    }

    try {
      if (emoji && artChanged) {
        await emoji.delete("hios-ronda honeypot icon art updated").catch(() => {});
        log(`deleted stale emoji :${icon.name}:`);
        emoji = null;
      }
      if (!emoji) {
        const created = await guild.emojis.create({
          attachment: fs.readFileSync(path.join(ASSETS, icon.file)),
          name: icon.name,
          reason: "hios-ronda honeypot icons",
        });
        emoji = created;
        log(`uploaded emoji :${icon.name}:`);
      }
      out[key] = { id: emoji.id, name: emoji.name };
      newHashes[key] = currentHash;
    } catch (err) {
      log.warn(`emoji upload failed (:${icon.name}:): ${err.message}`);
      out[key] = emoji ? { id: emoji.id, name: emoji.name } : null;
    }
  }

  updateConfig(guild.id, { emojis: out, emojiHashes: newHashes });
  return out;
}

/** `<:name:id>` mention, or the unicode fallback. */
function emojiMention(emojis, key) {
  const e = emojis?.[key];
  if (e?.id) return `<:${e.name}:${e.id}>`;
  return ICONS[key].fallback;
}

module.exports = { ensureHoneypotEmojis, emojiMention, ICONS };
