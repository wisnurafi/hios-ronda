/**
 * Minimal GitHub REST client (native fetch, no new dependencies).
 *
 * Uses the real-time endpoints (repo info, compare, pulls, releases)
 * instead of the laggy Events API.
 */

const { log } = require("../../log");

function headers(token) {
  return {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "hios-ronda",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/** Generic GET. Throws err.status on non-2xx. */
async function gh(path, token) {
  const res = await fetch(`https://api.github.com${path}`, { headers: headers(token) });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(`GitHub API ${res.status} for ${path}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

/** Repo info — mainly for the default branch. */
function getRepo(repo, token) {
  return gh(`/repos/${repo}`, token);
}

/** HEAD sha of a branch. NOTE: with a branch name GitHub returns a single object, not an array. */
async function getBranchHead(repo, branch, token) {
  const data = await gh(`/repos/${repo}/commits/${encodeURIComponent(branch)}`, token);
  const sha = Array.isArray(data) ? data[0]?.sha : data?.sha;
  if (!sha) throw new Error(`no commits on ${repo}:${branch}`);
  return sha;
}

/**
 * Compare base...head. Returns { status, ahead_by, commits[] (oldest first),
 * html_url }. 404 when base no longer exists (history rewritten).
 */
function compareCommits(repo, base, head, token) {
  return gh(
    `/repos/${repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`,
    token
  );
}

/** Recently updated PRs, newest first. */
function listPulls(repo, token) {
  return gh(`/repos/${repo}/pulls?state=all&sort=updated&direction=desc&per_page=30`, token);
}

/** Recent releases, newest first. */
function listReleases(repo, token) {
  return gh(`/repos/${repo}/releases?per_page=10`, token);
}

module.exports = { getRepo, getBranchHead, compareCommits, listPulls, listReleases };
