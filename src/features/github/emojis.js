/**
 * Custom emojis for the GitHub logs embeds (push / PR / release icons).
 * Uploaded to the guild once and reused by name. Falls back to unicode
 * when the bot can't manage emojis. Sync logic lives in src/emoji-sync.js.
 */

const path = require("path");
const { ensureEmojis, emojiMention: mention } = require("../../emoji-sync");
const { getConfig, updateConfig } = require("./store");

const ASSETS = path.join(__dirname, "assets");

// key -> { file, name, fallback }
const ICONS = {
  push: { file: "push.png", name: "hios_gh_push", fallback: "📦" },
  pr: { file: "pr.png", name: "hios_gh_pr", fallback: "🔀" },
  release: { file: "release.png", name: "hios_gh_release", fallback: "🚀" },
};

// md5 of the bundled art from before hash tracking existed — existing
// installs keep their emojis without a one-time re-upload churn.
const LEGACY_HASHES = {
  push: "953afb76f32c8b466633b43820d2a8bb",
  pr: "cffb0babb8e6078c7cd13b73d358bdb0",
  release: "801ebb541c58249e86b0e9916899bddd",
};

/**
 * Ensure the white icons exist as custom emojis. Reuses by name;
 * auto-refreshes when the bundled art changes.
 * Returns { push: {id,name}|null, pr, release } and persists to config.
 */
async function ensureGithubEmojis(guild) {
  return ensureEmojis(guild, {
    assetsDir: ASSETS,
    icons: ICONS,
    getConfig,
    updateConfig,
    feature: "github",
    legacyHashes: LEGACY_HASHES,
  });
}

/** `<:name:id>` mention, or the unicode fallback. */
function emojiMention(emojis, key) {
  return mention(ICONS, emojis, key);
}

module.exports = { ensureGithubEmojis, emojiMention, ICONS };
