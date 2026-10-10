/**
 * Verify custom emojis: the checkmark (verify button) and the shield
 * (embed thumbnail art, also used as thumbnail source).
 *
 * Same art-aware pattern as the honeypot icons: each asset's md5 is
 * recorded in config (`emojiHashes`); when bundled art changes, the old
 * guild emoji is deleted and re-uploaded automatically on next startup.
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
  check: { file: "checkmark.png", name: "hios_vf_check", fallback: "✅" },
  shield: { file: "shield.png", name: "hios_vf_shield", fallback: "🛡️" },
};

function assetHash(file) {
  try {
    return crypto.createHash("md5").update(fs.readFileSync(path.join(ASSETS, file))).digest("hex");
  } catch {
    return null;
  }
}

/**
 * Ensure the verify icons exist as custom emojis. Reuses by name.
 * Returns { check: {id,name}|null, shield: {id,name}|null }.
 */
async function ensureVerifyEmojis(guild) {
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
      if (artChanged) log.warn(`verify emoji art changed but no Manage Emojis permission (:${icon.name}:)`);
      continue;
    }

    try {
      if (emoji && artChanged) {
        await emoji.delete("hios-ronda verify icon art updated").catch(() => {});
        log(`deleted stale emoji :${icon.name}:`);
        emoji = null;
      }
      if (!emoji) {
        const created = await guild.emojis.create({
          attachment: fs.readFileSync(path.join(ASSETS, icon.file)),
          name: icon.name,
          reason: "hios-ronda verify icons",
        });
        emoji = created;
        log(`uploaded emoji :${icon.name}:`);
      }
      out[key] = { id: emoji.id, name: emoji.name };
      newHashes[key] = currentHash;
    } catch (err) {
      log.warn(`verify emoji upload failed (:${icon.name}:): ${err.message}`);
      out[key] = emoji ? { id: emoji.id, name: emoji.name } : null;
    }
  }

  updateConfig(guild.id, { emojis: out, emojiHashes: newHashes });
  return out;
}

module.exports = { ensureVerifyEmojis, ICONS };
