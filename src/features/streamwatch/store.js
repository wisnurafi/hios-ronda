/**
 * Watch store — JSON file, keyed by guild id.
 * load/save come from src/json-store.js; the accessors stay custom
 * because they merge defaults over stored config (so new default keys
 * appear for old configs) instead of returning the live ref.
 */

const { createStore } = require("../../json-store");

const store = createStore({ file: "watch.json", name: "watch" });

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

/** Get the watch config for a guild (defaults merged over stored values). */
function getWatchConfig(guildId) {
  const all = store.load();
  if (!all[guildId]) {
    all[guildId] = defaults();
    store.save();
  }
  return { ...defaults(), ...all[guildId] };
}

function updateWatchConfig(guildId, patch) {
  const all = store.load();
  all[guildId] = { ...defaults(), ...(all[guildId] || {}), ...patch };
  store.save();
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
