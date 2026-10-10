/**
 * Per-guild dashboard config for the ronda stats features
 * (night-owl leaderboard + weekly patrol report). JSON file store,
 * same pattern as the watch/honeypot stores.
 */

const fs = require("fs");
const path = require("path");
const { log } = require("../../log");

const DATA_DIR = path.join(__dirname, "..", "..", "..", "data");
const DATA_FILE = path.join(DATA_DIR, "ronda.json");

// Placeholders for the begadang message:
//   {week}      -> "Oct 6 – Oct 12"
//   {top1}      -> mention of the #1 night owl
//   {top1_time} -> their night time, e.g. "7h 20m"
const DEFAULT_BEGADANG_MESSAGE =
  "🌙 **Night Owls** — week of {week}\nThe patrol salutes this week's latest-night voices:";

// Placeholders for the rapot message:
//   {week}            -> "Oct 6 – Oct 12"
//   {total_hours}     -> total voice time, e.g. "38h 10m"
//   {most_active}     -> mention of the most active member
//   {longest_session} -> e.g. "<@123> (5h 2m)"
//   {favorite_channel}-> e.g. "#general"
//   {night_owl}       -> mention of the #1 night owl
const DEFAULT_RAPOT_MESSAGE =
  "📋 **Weekly Patrol Report** — week of {week}\nHere's what the night patrol observed:";

function featureDefaults() {
  return { enabled: true, channelId: null, message: null };
}

function defaults() {
  return {
    begadang: { ...featureDefaults(), message: DEFAULT_BEGADANG_MESSAGE },
    rapot: { ...featureDefaults(), message: DEFAULT_RAPOT_MESSAGE },
  };
}

let cache = null;

function load() {
  if (cache) return cache;
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    cache = fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) : {};
  } catch (err) {
    log("ronda store load failed:", err.message);
    cache = {};
  }
  return cache;
}

function save() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(cache, null, 2));
  } catch (err) {
    log("ronda store save failed:", err.message);
  }
}

function getGuildConfig(guildId) {
  const all = load();
  if (!all[guildId]) {
    all[guildId] = defaults();
    save();
  }
  const d = defaults();
  const g = all[guildId];
  return {
    begadang: { ...d.begadang, ...(g.begadang || {}) },
    rapot: { ...d.rapot, ...(g.rapot || {}) },
  };
}

function updateFeatureConfig(guildId, feature, patch) {
  const all = load();
  const cur = getGuildConfig(guildId);
  all[guildId] = { ...cur, [feature]: { ...cur[feature], ...patch } };
  save();
  return all[guildId][feature];
}

module.exports = {
  DEFAULT_BEGADANG_MESSAGE,
  DEFAULT_RAPOT_MESSAGE,
  getGuildConfig,
  updateFeatureConfig,
};
