/**
 * Verify store — JSON file, keyed by guild id.
 *
 * Config shape:
 *   {
 *     enabled: bool,
 *     verifyChannelId: string|null,   // where the public verify message lives
 *     verifyMessageId: string|null,   // the posted message to edit in place
 *     verifiedRoleId: string|null,    // role granted on button click
 *     embedTitle: string,
 *     embedDescription: string,
 *     buttonLabel: string,
 *     emojis: { check: {id,name}|null, shield: {id,name}|null },
 *     emojiHashes: { check: md5, shield: md5 },
 *   }
 */

const fs = require("fs");
const path = require("path");
const { log } = require("../../log");

const DATA_DIR = path.join(__dirname, "..", "..", "..", "data");
const DATA_FILE = path.join(DATA_DIR, "verify.json");

function defaults() {
  return {
    enabled: true,
    verifyChannelId: null,
    verifyMessageId: null,
    verifiedRoleId: null,
    embedTitle: "✅ Verify yourself",
    embedDescription:
      "Welcome to the server! Click the **Verify** button below to prove you're human and unlock the rest of the server.",
    buttonLabel: "Verify",
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
    log.warn("verify store load failed:", err.message);
    cache = {};
  }
  return cache;
}

function save() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(cache, null, 2));
  } catch (err) {
    log.warn("verify store save failed:", err.message);
  }
}

/** Get (and create if missing) the config for a guild. */
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
