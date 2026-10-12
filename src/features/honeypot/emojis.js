/**
 * Honeypot custom icons (warn/info/honey/forward) as guild emojis.
 * Sync logic lives in src/emoji-sync.js — this file only declares the
 * icon table and keeps the feature's export names stable.
 */

const path = require("path");
const { ensureEmojis, emojiMention: mention } = require("../../emoji-sync");
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

/**
 * Ensure the honeypot icons exist as custom emojis (same pattern as
 * hios-bot's interface emojis). Reuses by name; auto-refreshes when the
 * bundled art changes. Returns { warn: {id,name}|null, info, honey,
 * forward } and persists to config.
 */
async function ensureHoneypotEmojis(guild) {
  return ensureEmojis(guild, {
    assetsDir: ASSETS,
    icons: ICONS,
    getConfig,
    updateConfig,
    feature: "honeypot",
    legacyHashes: LEGACY_HASHES,
  });
}

/** `<:name:id>` mention, or the unicode fallback. */
function emojiMention(emojis, key) {
  return mention(ICONS, emojis, key);
}

module.exports = { ensureHoneypotEmojis, emojiMention, ICONS };
