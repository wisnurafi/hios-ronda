/**
 * Khodam custom emojis: the 4 panel button icons + the mascot.
 * Falls back to Unicode when the bot lacks Manage Emojis permission.
 * Sync logic lives in src/emoji-sync.js.
 */

const path = require("path");
const { ensureEmojis, emojiMention: mention } = require("../../emoji-sync");
const { getConfig, updateConfig } = require("./store");

const ASSETS = path.join(__dirname, "assets");

// key -> { file, name, fallback }
const ICONS = {
  roll: { file: "roll.png", name: "hios_kh_roll", fallback: "🎲" },
  collection: { file: "collection.png", name: "hios_kh_collection", fallback: "🎒" },
  duel: { file: "duel.png", name: "hios_kh_duel", fallback: "⚔️" },
  leaderboard: { file: "leaderboard.png", name: "hios_kh_board", fallback: "🏆" },
  mascot: { file: "mascot.png", name: "hios_kh_mascot", fallback: "👹" },
};

/**
 * Ensure the khodam icons exist as custom emojis. Reuses by name;
 * auto-refreshes when the bundled art changes.
 * Returns { roll: {id,name}|null, collection, duel, leaderboard, mascot }.
 */
async function ensureKhodamEmojis(guild) {
  return ensureEmojis(guild, {
    assetsDir: ASSETS,
    icons: ICONS,
    getConfig,
    updateConfig,
    feature: "khodam",
  });
}

/** "<:name:id>" mention or the Unicode fallback. */
function emojiMention(emojis, key) {
  return mention(ICONS, emojis, key);
}

module.exports = { ensureKhodamEmojis, emojiMention, ICONS };
