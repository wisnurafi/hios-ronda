const fs = require("fs");
const path = require("path");
const { log } = require("../../log");

const DATA_DIR = path.join(__dirname, "..", "..", "..", "data");
const DATA_FILE = path.join(DATA_DIR, "watch.json");

// Placeholders supported in notifyMessage:
//   {mention} -> pings the streamer (<@userId>)
//   {name}    -> streamer's display name
//   {channel} -> voice channel name
const DEFAULT_MESSAGE = "🔴 @here {mention} is live in **#{channel}** — join to watch!";

function defaults() {
  return {
    notifyEnabled: true,
    notifyChannelId: null, // null -> fall back to NOTIFY_CHANNEL_ID env
    notifyMessage: DEFAULT_MESSAGE,
  };
}

let cache = null;

function load() {
  if (cache) return cache;
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    cache = fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) : {};
  } catch (err) {
    log.warn("watch store load failed:", err.message);
    cache = {};
  }
  return cache;
}

function save() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(cache, null, 2));
  } catch (err) {
    log.warn("watch store save failed:", err.message);
  }
}

/** Get (and create if missing) the watch config for a guild. */
function getWatchConfig(guildId) {
  const all = load();
  if (!all[guildId]) {
    all[guildId] = defaults();
    save();
  }
  return { ...defaults(), ...all[guildId] };
}

function updateWatchConfig(guildId, patch) {
  const all = load();
  all[guildId] = { ...defaults(), ...(all[guildId] || {}), ...patch };
  save();
  return all[guildId];
}

/** Go Live notification messages enabled for this guild? Default true. */
function isNotifyEnabled(guildId) {
  return getWatchConfig(guildId).notifyEnabled !== false;
}

function setNotifyEnabled(guildId, enabled) {
  updateWatchConfig(guildId, { notifyEnabled: enabled });
}

module.exports = {
  DEFAULT_MESSAGE,
  getWatchConfig,
  updateWatchConfig,
  isNotifyEnabled,
  setNotifyEnabled,
};
