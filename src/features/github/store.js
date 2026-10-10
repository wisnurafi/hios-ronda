/**
 * Per-guild config for the GitHub logs feature (polling-based).
 * JSON file store, same pattern as the other features.
 */

const fs = require("fs");
const path = require("path");
const { log } = require("../../log");

const DATA_DIR = path.join(__dirname, "..", "..", "..", "data");
const DATA_FILE = path.join(DATA_DIR, "github.json");

function defaults() {
  return {
    enabled: true,
    channelId: null, // target channel for the feed (set via /github dashboard)
    webhookId: null,
    webhookToken: null,
    webhookAvatarHash: null,
    emojis: {}, // custom push/pr/release emojis { key: {id,name} | null }
    lastEventIds: {}, // "owner/repo" -> newest seen GitHub event id
  };
}

let cache = null;

function load() {
  if (cache) return cache;
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    cache = fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) : {};
  } catch (err) {
    log("github store load failed:", err.message);
    cache = {};
  }
  return cache;
}

function save() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(cache, null, 2));
  } catch (err) {
    log("github store save failed:", err.message);
  }
}

function getConfig(guildId) {
  const all = load();
  if (!all[guildId]) {
    all[guildId] = defaults();
    save();
  }
  const g = all[guildId];
  return { ...defaults(), ...g, lastEventIds: { ...(g.lastEventIds || {}) } };
}

function updateConfig(guildId, patch) {
  const all = load();
  const cur = getConfig(guildId);
  all[guildId] = { ...cur, ...patch };
  save();
  return all[guildId];
}

/** Repos from env: GITHUB_REPOS="owner/a,owner/b". */
function configuredRepos() {
  return (process.env.GITHUB_REPOS || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(s));
}

function githubToken() {
  return (process.env.GITHUB_TOKEN || "").trim();
}

module.exports = { getConfig, updateConfig, configuredRepos, githubToken };
