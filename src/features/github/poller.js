/**
 * The 3-minute poller: for every configured repo, fetch recent GitHub
 * events, post the new push/PR/release ones (oldest first) through the
 * "HIOS | GitHub" webhook, and record the newest seen event id.
 *
 * First run per repo only records the baseline — no flood of old history.
 */

const { log } = require("../../log");
const { getConfig, updateConfig, configuredRepos, githubToken } = require("./store");
const { fetchEvents } = require("./github");
const { buildEventPost } = require("./embeds");
const { getGithubWebhook } = require("./webhook");

const TRACKED_TYPES = ["PushEvent", "PullRequestEvent", "ReleaseEvent"];

function isConfigured() {
  return githubToken() !== "" && configuredRepos().length > 0;
}

async function pollRepo(guild, hook, repo) {
  const cfg = getConfig(guild.id);
  const lastId = cfg.lastEventIds?.[repo] || null;

  const events = await fetchEvents(repo, githubToken());
  if (events.length === 0) return;

  const newestId = events[0].id;
  if (!lastId) {
    // Baseline: remember where we are, post nothing.
    updateConfig(guild.id, { lastEventIds: { ...cfg.lastEventIds, [repo]: newestId } });
    log(`github: baseline for ${repo} at ${newestId}`);
    return;
  }

  const fresh = events
    .filter((e) => TRACKED_TYPES.includes(e.type))
    .filter((e) => {
      try {
        return BigInt(e.id) > BigInt(lastId);
      } catch {
        return false;
      }
    })
    .reverse(); // oldest first

  for (const event of fresh) {
    const post = buildEventPost(repo, event);
    if (!post) continue;
    try {
      await hook.send({ embeds: [post.embed], files: [post.attachment] });
    } catch (err) {
      log(`github: send failed (${repo} ${event.type}): ${err.message}`);
    }
  }
  if (fresh.length > 0) log(`github: posted ${fresh.length} event(s) for ${repo}`);

  updateConfig(guild.id, { lastEventIds: { ...cfg.lastEventIds, [repo]: newestId } });
}

/** One poll tick across all guilds. Never throws. */
async function pollTick(client) {
  if (!isConfigured()) return;
  const repos = configuredRepos();
  for (const [, guild] of client.guilds.cache) {
    const cfg = getConfig(guild.id);
    if (!cfg.enabled || !cfg.channelId) continue;
    let hook;
    try {
      hook = await getGithubWebhook(guild, cfg);
    } catch (err) {
      log(`github: webhook unavailable in ${guild.name}: ${err.message}`);
      continue;
    }
    if (!hook) {
      log(`github: no target channel/webhook in ${guild.name}, skipping`);
      continue;
    }
    for (const repo of repos) {
      try {
        await pollRepo(guild, hook, repo);
      } catch (err) {
        log(`github: poll failed for ${repo}: ${err.message}`);
      }
    }
  }
}

module.exports = { pollTick, isConfigured };
