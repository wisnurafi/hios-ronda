/**
 * GitHub logs feature: polls GitHub repo events every 3 minutes and posts
 * new pushes / PRs / releases to the guild's target channel through the
 * "HIOS | GitHub" webhook.
 *
 *  - /github opens the per-guild dashboard (target channel, on/off, preview).
 *  - Repos + token come from env: GITHUB_REPOS, GITHUB_TOKEN.
 *  - Missing token/repos: the feature stays quiet, the bot keeps running.
 */

const { Events } = require("discord.js");
const cron = require("node-cron");
const { log } = require("../../log");
const { enforceControlLockdown } = require("../control");
const { pollTick, isConfigured } = require("./poller");
const { handleGithubCommand } = require("./commands");
const { ensureGithubEmojis } = require("./emojis");

function registerGithub(client) {
  client.once(Events.ClientReady, async () => {
    // Upload the push/pr/release icons as custom emojis (reused by name).
    for (const [, guild] of client.guilds.cache) {
      await ensureGithubEmojis(guild).catch((err) => log("github emoji ensure error:", err.message));
    }
    if (!isConfigured()) {
      log.warn("github: GITHUB_TOKEN or GITHUB_REPOS not set — feed disabled (bot still runs)");
      return;
    }
    try {
      cron.schedule(
        "*/2 * * * *",
        () => {
          pollTick(client).catch((err) => log("github poll error:", err.message));
        },
        { timezone: "Asia/Jakarta" }
      );
      log("github: poller running every 2 minutes");
      // Quick first tick so baselines are recorded without waiting 3 min.
      setTimeout(() => {
        pollTick(client).catch((err) => log("github poll error:", err.message));
      }, 20_000).unref?.();
    } catch (err) {
      log.warn("github: failed to schedule poller:", err.message);
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (!interaction.isChatInputCommand()) return;
      if (await enforceControlLockdown(interaction)) return;
      if (interaction.commandName === "github") {
        await handleGithubCommand(interaction);
      }
    } catch (err) {
      log.warn("github interaction error:", err.message);
    }
  });
}

module.exports = { registerGithub };
