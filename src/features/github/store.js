/**
 * Per-guild config for the GitHub logs feature (polling-based).
 * load/save come from src/json-store.js; getConfig keeps this feature's
 * merge-copy semantics (returns a copy with defaults filled in, so new
 * default keys appear for old configs).
 */

const { createStore } = require("../../json-store");

const store = createStore({ file: "github.json", name: "github" });

function defaults() {
  return {
    enabled: true,
    channelId: null, // target channel for the feed (set via /github dashboard)
    webhookId: null,
    webhookToken: null,
    webhookAvatarHash: null,
    emojis: {}, // custom push/pr/release emojis { key: {id,name} | null }
    // per-repo poll state: "owner/repo" -> { branch, sha, seen: [], checkedAt }
    poll: {},
  };
}

function getConfig(guildId) {
  const all = store.load();
  if (!all[guildId]) {
    all[guildId] = defaults();
    store.save();
  }
  const g = all[guildId];
  return { ...defaults(), ...g, lastEventIds: { ...(g.lastEventIds || {}) } };
}

function updateConfig(guildId, patch) {
  const all = store.load();
  const cur = getConfig(guildId);
  all[guildId] = { ...cur, ...patch };
  store.save();
  return all[guildId];
}

function getPollState(guildId, repo) {
  const cfg = getConfig(guildId);
  return (cfg.poll && cfg.poll[repo]) || null;
}

function setPollState(guildId, repo, state) {
  const cfg = getConfig(guildId);
  updateConfig(guildId, { poll: { ...(cfg.poll || {}), [repo]: state } });
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

module.exports = { getConfig, updateConfig, getPollState, setPollState, configuredRepos, githubToken };
