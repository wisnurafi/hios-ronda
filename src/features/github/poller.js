/**
 * The poller: for every configured repo, check the real-time GitHub APIs
 * (compare for commits, pulls, releases) and post anything new through
 * the "HIOS | GitHub" webhook, oldest first.
 *
 * Why not the Events API: it can lag 20+ minutes behind reality.
 * These endpoints reflect pushes/PRs/releases immediately.
 *
 * State per repo: { branch, sha, seen: [], checkedAt }.
 * - Commits are SHA-chained via the compare API (exact, no dupes).
 * - PRs/releases use a 5-minute overlap window + a seen-set so ticks
 *   never miss events at the boundary and never double-post.
 * - First run per repo only records the baseline — no flood of history.
 */

const { log } = require("../../log");
const { getConfig, getPollState, setPollState, configuredRepos, githubToken } = require("./store");
const { getRepo, getBranchHead, compareCommits, listPulls, listReleases } = require("./github");
const { buildEventPost } = require("./embeds");
const { getGithubWebhook } = require("./webhook");

const OVERLAP_MS = 5 * 60_000;
const MAX_SEEN = 200;

function isConfigured() {
  return githubToken() !== "" && configuredRepos().length > 0;
}

function byDateAsc(a, b) {
  return new Date(a) - new Date(b);
}

/** PR actions that happened since `since`, in order. */
function prActionsSince(pr, since) {
  const out = [];
  if (new Date(pr.created_at) > since) out.push("opened");
  if (pr.merged_at && new Date(pr.merged_at) > since) out.push("merged");
  else if (pr.closed_at && new Date(pr.closed_at) > since) out.push("closed");
  return out;
}

async function sendSafe(hook, embed, what) {
  try {
    await hook.send({ embeds: [embed] });
    return true;
  } catch (err) {
    log.warn(`github: send failed (${what}): ${err.message}`);
    return false;
  }
}

async function pollRepo(guild, hook, repo, token) {
  const cfg = getConfig(guild.id);
  const st = getPollState(guild.id, repo);
  const seen = new Set(st?.seen || []);

  let branch = st?.branch;
  if (!branch) {
    branch = (await getRepo(repo, token)).default_branch || "main";
  }

  // First run: baseline only, post nothing.
  if (!st?.sha) {
    const head = await getBranchHead(repo, branch, token);
    setPollState(guild.id, repo, { branch, sha: head, seen: [], checkedAt: new Date().toISOString() });
    log(`github: baseline for ${repo} at ${head.slice(0, 7)}`);
    return;
  }

  const since = new Date(new Date(st.checkedAt).getTime() - OVERLAP_MS);
  const owner = repo.split("/")[0];
  let headSha = st.sha;

  // ---- commits via compare (SHA-chained, exact) ----
  try {
    const cmp = await compareCommits(repo, st.sha, branch, token);
    const commits = [...(cmp.commits || [])].sort((a, b) =>
      byDateAsc(a.commit?.author?.date, b.commit?.author?.date)
    );
    if (cmp.status !== "identical" && commits.length > 0) {
      const latest = commits[commits.length - 1];
      const ghAuthor = latest.author || commits.find((c) => c.author)?.author;
      const event = {
        type: "PushEvent",
        actor: ghAuthor
          ? { login: ghAuthor.login, avatar_url: ghAuthor.avatar_url }
          : { login: owner },
        created_at: latest.commit?.author?.date || new Date().toISOString(),
        payload: {
          ref: `refs/heads/${branch}`,
          size: commits.length,
          commits: commits.map((c) => ({ sha: c.sha, message: c.commit?.message || "" })),
        },
      };
      const embed = buildEventPost(repo, event, cfg.emojis);
      if (embed && (await sendSafe(hook, embed, `${repo} push`))) {
        headSha = latest.sha;
        log.debug(`github: ${repo}: ${commits.length} new commit(s)`);
      }
    }
  } catch (err) {
    if (err.status === 404) {
      // History rewritten (force push): re-baseline to current HEAD.
      headSha = await getBranchHead(repo, branch, token);
      log.warn(`github: ${repo} history rewritten, re-baselined at ${headSha.slice(0, 7)}`);
    } else {
      throw err;
    }
  }

  // ---- PRs ----
  try {
    const pulls = await listPulls(repo, token);
    const posts = [];
    for (const pr of pulls) {
      for (const action of prActionsSince(pr, since)) {
        const key = `pr:${pr.number}:${action}`;
        if (seen.has(key)) continue;
        posts.push({ pr, action, key });
      }
    }
    posts.reverse(); // oldest first
    for (const { pr, action, key } of posts) {
      const event = {
        type: "PullRequestEvent",
        actor: { login: pr.user?.login, avatar_url: pr.user?.avatar_url },
        created_at: action === "opened" ? pr.created_at : action === "merged" ? pr.merged_at : pr.closed_at,
        payload: {
          action: action === "opened" ? "opened" : "closed",
          pull_request: {
            number: pr.number,
            title: pr.title,
            html_url: pr.html_url,
            user: { login: pr.user?.login },
            head: { ref: pr.head?.ref },
            base: { ref: pr.base?.ref },
            body: pr.body,
            merged: action === "merged",
          },
        },
      };
      const embed = buildEventPost(repo, event, cfg.emojis);
      if (embed && (await sendSafe(hook, embed, `${repo} PR #${pr.number} ${action}`))) {
        seen.add(key);
      }
    }
    if (posts.length > 0) log(`github: posted ${posts.length} PR event(s) for ${repo}`);
  } catch (err) {
    log.warn(`github: pulls check failed for ${repo}: ${err.message}`);
  }

  // ---- releases ----
  try {
    const releases = await listReleases(repo, token);
    const fresh = releases.filter(
      (r) => !r.draft && r.published_at && new Date(r.published_at) > since && !seen.has(`rel:${r.id}`)
    );
    fresh.reverse(); // oldest first
    for (const r of fresh) {
      const event = {
        type: "ReleaseEvent",
        actor: r.author ? { login: r.author.login, avatar_url: r.author.avatar_url } : { login: owner },
        created_at: r.published_at,
        payload: {
          action: "published",
          release: { tag_name: r.tag_name, name: r.name, html_url: r.html_url, body: r.body },
        },
      };
      const embed = buildEventPost(repo, event, cfg.emojis);
      if (embed && (await sendSafe(hook, embed, `${repo} release ${r.tag_name}`))) {
        seen.add(`rel:${r.id}`);
      }
    }
    if (fresh.length > 0) log(`github: posted ${fresh.length} release(s) for ${repo}`);
  } catch (err) {
    log.warn(`github: releases check failed for ${repo}: ${err.message}`);
  }

  setPollState(guild.id, repo, {
    branch,
    sha: headSha,
    seen: [...seen].slice(-MAX_SEEN),
    checkedAt: new Date().toISOString(),
  });
}

/** One poll tick across all guilds. Never throws. */
async function pollTick(client) {
  if (!isConfigured()) return;
  const repos = configuredRepos();
  const token = githubToken();
  log.debug(`github: tick start (${repos.length} repos)`);
  for (const [, guild] of client.guilds.cache) {
    const cfg = getConfig(guild.id);
    if (!cfg.enabled || !cfg.channelId) continue;
    let hook;
    try {
      hook = await getGithubWebhook(guild, cfg);
    } catch (err) {
      log.warn(`github: webhook unavailable in ${guild.name}: ${err.message}`);
      continue;
    }
    if (!hook) {
      log.warn(`github: no target channel/webhook in ${guild.name}, skipping`);
      continue;
    }
    for (const repo of repos) {
      try {
        await pollRepo(guild, hook, repo, token);
      } catch (err) {
        log.warn(`github: poll failed for ${repo}: ${err.message}`);
      }
    }
  }
}

module.exports = { pollTick, isConfigured, prActionsSince, pollRepo };
