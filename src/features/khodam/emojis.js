/**
 * Khodam custom emojis: the 4 panel button icons + the mascot.
 *
 * Same art-aware pattern as verify/honeypot: each asset's md5 is recorded
 * in config (`emojiHashes`); when bundled art changes, the old guild emoji
 * is deleted and re-uploaded automatically on next startup. Falls back to
 * Unicode when the bot lacks Manage Emojis permission.
 *
 * NOTE: collection/duel/leaderboard upload the *_white.png variants —
 * the originals are black line-art, nearly invisible on Discord's dark
 * theme (same reason hios-bot's tempvoice panel uses white Lucide icons).
 */

const fs = require("fs");
const crypto = require("crypto");
const path = require("path");
const { PermissionFlagsBits } = require("discord.js");
const { log } = require("../../log");
const { getConfig, updateConfig } = require("./store");

const ASSETS = path.join(__dirname, "assets");

// key -> { file, name, fallback }
const ICONS = {
  roll: { file: "roll.png", name: "hios_kh_roll", fallback: "🎲" },
  collection: { file: "collection_white.png", name: "hios_kh_collection", fallback: "🎒" },
  duel: { file: "duel_white.png", name: "hios_kh_duel", fallback: "⚔️" },
  leaderboard: { file: "leaderboard_white.png", name: "hios_kh_board", fallback: "🏆" },
  mascot: { file: "mascot.png", name: "hios_kh_mascot", fallback: "👹" },
};

function assetHash(file) {
  try {
    return crypto.createHash("md5").update(fs.readFileSync(path.join(ASSETS, file))).digest("hex");
  } catch {
    return null;
  }
}

/**
 * Ensure the khodam icons exist as custom emojis. Reuses by name.
 * Returns { roll: {id,name}|null, collection, duel, leaderboard, mascot }.
 */
async function ensureKhodamEmojis(guild) {
  const cfg = getConfig(guild.id);
  const stored = cfg.emojis || {};
  const recordedHashes = cfg.emojiHashes || {};
  const out = {};
  const newHashes = { ...recordedHashes };

  const canManage = guild.members.me?.permissions.has(PermissionFlagsBits.ManageEmojisAndStickers);

  for (const [key, icon] of Object.entries(ICONS)) {
    const currentHash = assetHash(icon.file);

    let emoji = null;
    if (stored[key]?.id) {
      emoji = guild.emojis.cache.get(stored[key].id) || null;
    }
    if (!emoji) {
      emoji = guild.emojis.cache.find((e) => e.name === icon.name) || null;
    }

    const recorded = recordedHashes[key] || null;
    const artChanged = currentHash ? recorded !== currentHash : false;

    if (emoji && !artChanged) {
      out[key] = { id: emoji.id, name: emoji.name };
      newHashes[key] = currentHash;
      continue;
    }

    if (!canManage) {
      if (emoji) out[key] = { id: emoji.id, name: emoji.name };
      else out[key] = null;
      if (artChanged) log.warn(`khodam emoji art changed but no Manage Emojis permission (:${icon.name}:)`);
      continue;
    }

    try {
      if (emoji && artChanged) {
        await emoji.delete("hios-ronda khodam icon art updated").catch(() => {});
        log(`deleted stale emoji :${icon.name}:`);
        emoji = null;
      }
      if (!emoji) {
        const created = await guild.emojis.create({
          attachment: fs.readFileSync(path.join(ASSETS, icon.file)),
          name: icon.name,
          reason: "hios-ronda khodam icons",
        });
        emoji = created;
        log(`uploaded emoji :${icon.name}:`);
      }
      out[key] = { id: emoji.id, name: emoji.name };
      newHashes[key] = currentHash;
    } catch (err) {
      log.warn(`khodam emoji upload failed (:${icon.name}:): ${err.message}`);
      out[key] = emoji ? { id: emoji.id, name: emoji.name } : null;
    }
  }

  updateConfig(guild.id, { emojis: out, emojiHashes: newHashes });
  return out;
}

/** "<:name:id>" mention or the Unicode fallback. */
function emojiMention(emojis, key) {
  const e = emojis?.[key];
  if (e?.id) return `<:${e.name}:${e.id}>`;
  return ICONS[key]?.fallback || "❓";
}

module.exports = { ensureKhodamEmojis, emojiMention, ICONS };
