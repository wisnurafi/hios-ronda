const fs = require("fs");
const path = require("path");
const { log } = require("../../log");

const DATA_DIR = path.join(__dirname, "..", "..", "..", "data");
const DATA_FILE = path.join(DATA_DIR, "watch.json");

let cache = null;

function load() {
  if (cache) return cache;
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    cache = fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) : {};
  } catch (err) {
    log("watch store load failed:", err.message);
    cache = {};
  }
  return cache;
}

function save() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(cache, null, 2));
  } catch (err) {
    log("watch store save failed:", err.message);
  }
}

/** Go Live notification messages enabled for this guild? Default true. */
function isNotifyEnabled(guildId) {
  const cfg = load()[guildId];
  return cfg ? cfg.notifyEnabled !== false : true;
}

function setNotifyEnabled(guildId, enabled) {
  const all = load();
  all[guildId] = { ...(all[guildId] || {}), notifyEnabled: enabled };
  save();
}

module.exports = { isNotifyEnabled, setNotifyEnabled };
