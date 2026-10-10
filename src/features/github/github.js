/**
 * Minimal GitHub REST client (native fetch, no new dependencies).
 * Only what the logs poller needs: repo events.
 */

const { log } = require("../../log");

/**
 * GET /repos/{owner}/{repo}/events — newest first.
 * Throws on non-2xx so the poller can log + skip.
 */
async function fetchEvents(repo, token) {
  const res = await fetch(`https://api.github.com/repos/${repo}/events?per_page=30`, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "hios-ronda",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (res.status === 404) {
    throw new Error(`repo not found or no access: ${repo}`);
  }
  if (res.status === 401) {
    throw new Error("GitHub token invalid (401)");
  }
  if (res.status === 403) {
    throw new Error("GitHub rate limit or forbidden (403)");
  }
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status} for ${repo}`);
  }
  const data = await res.json();
  if (!Array.isArray(data)) {
    log(`github: unexpected events payload for ${repo}`);
    return [];
  }
  return data;
}

module.exports = { fetchEvents };
