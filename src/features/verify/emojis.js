/**
 * Verify custom emojis: the checkmark (verify button) and the shield
 * (embed thumbnail art).
 * Sync logic lives in src/emoji-sync.js — this file only declares the
 * icon table and keeps the feature's export names stable.
 */

const path = require("path");
const { ensureEmojis } = require("../../emoji-sync");
const { getConfig, updateConfig } = require("./store");

const ASSETS = path.join(__dirname, "assets");

// key -> { file, name, fallback }
const ICONS = {
  check: { file: "checkmark.png", name: "hios_vf_check", fallback: "✅" },
  shield: { file: "shield.png", name: "hios_vf_shield", fallback: "🛡️" },
};

/**
 * Ensure the verify icons exist as custom emojis. Reuses by name;
 * auto-refreshes when the bundled art changes.
 * Returns { check: {id,name}|null, shield: {id,name}|null }.
 */
async function ensureVerifyEmojis(guild) {
  return ensureEmojis(guild, {
    assetsDir: ASSETS,
    icons: ICONS,
    getConfig,
    updateConfig,
    feature: "verify",
  });
}

module.exports = { ensureVerifyEmojis, ICONS };
