const fs = require("fs");
const path = require("path");
const { log } = require("../../log");

const DATA_DIR = path.join(__dirname, "..", "..", "..", "data");
const DATA_FILE = path.join(DATA_DIR, "honeypot.json");

function defaults() {
  return {
    enabled: true,
    honeypotChannelId: null,
    honeypotMessageId: null, // warning message (counter button edited in place)
    logsChannelId: null,
    action: "ban", // ban | kick | timeout
    timeoutMinutes: 60,
    exemptRoles: [],
    exemptUsers: [],
    warningTitle: "DO NOT SEND MESSAGES IN THIS CHANNEL",
    warningDescription:
      "This channel is used to catch spam bots. Any messages sent here will result in an immediate ban.",
    catches: 0,
  };
}

let cache = null;

function load() {
  if (cache) return cache;
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(DATA_FILE)) {
      cache = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    } else {
      cache = {};
    }
  } catch (err) {
    log("honeypot store load failed:", err.message);
    cache = {};
  }
  return cache;
}

function save() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(cache, null, 2));
  } catch (err) {
    log("honeypot store save failed:", err.message);
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

/** Merge a patch into the guild config and persist. */
function updateConfig(guildId, patch) {
  const cfg = getConfig(guildId);
  Object.assign(cfg, patch);
  save();
  return cfg;
}

module.exports = { getConfig, updateConfig, defaults };
