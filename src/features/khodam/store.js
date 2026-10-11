/**
 * Khodam store — JSON file, keyed by guild id. Fail-open like the other
 * feature stores: a broken file never blocks the bot.
 *
 * Config shape:
 *   {
 *     enabled: bool,
 *     channelId: string|null,   // where the public panel + results live
 *     messageId: string|null,   // the posted panel message to edit in place
 *     emojis: { roll: {id,name}|null, collection, duel, leaderboard, mascot },
 *     emojiHashes: { roll: md5, ... },
 *   }
 */

const fs = require("fs");
const path = require("path");
const { log } = require("../../log");

const DATA_DIR = path.join(__dirname, "..", "..", "..", "data");
const DATA_FILE = path.join(DATA_DIR, "khodam.json");

function defaults() {
  return {
    enabled: true,
    channelId: null,
    messageId: null,
    emojis: {},
    emojiHashes: {},
  };
}

let cache = null;

function load() {
  if (cache) return cache;
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    cache = fs.existsSync(DATA_FILE)
      ? JSON.parse(fs.readFileSync(DATA_FILE, "utf8"))
      : {};
  } catch (err) {
    log.warn("khodam store load failed:", err.message);
    cache = {};
  }
  return cache;
}

function save() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(cache, null, 2));
  } catch (err) {
    log.warn("khodam store save failed:", err.message);
  }
}

function getConfig(guildId) {
  const all = load();
  if (!all[guildId]) {
    all[guildId] = defaults();
    save();
  }
  return all[guildId];
}

function updateConfig(guildId, patch) {
  const cfg = getConfig(guildId);
  Object.assign(cfg, patch);
  save();
  return cfg;
}

module.exports = { getConfig, updateConfig, defaults };
