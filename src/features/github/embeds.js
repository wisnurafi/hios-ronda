/**
 * Custom Discord embeds for GitHub events, all user-facing text in English.
 * Each event type uses its custom emoji (hios_gh_push / hios_gh_pr /
 * hios_gh_release, uploaded to the guild) in the title, with a unicode
 * fallback when the emoji isn't available.
 */

const { EmbedBuilder } = require("discord.js");
const { emojiMention } = require("./emojis");

const COLORS = { push: 0x2da44e, pr: 0x8250df, pr_closed: 0x57606a, release: 0x0969da };
const MAX_COMMITS_SHOWN = 10;

function actorAuthor(event) {
  const a = event.actor || {};
  return {
    name: `@${a.login || "unknown"}`,
    iconURL: a.avatar_url || undefined,
    url: a.login ? `https://github.com/${a.login}` : undefined,
  };
}

function firstLine(s, max = 80) {
  const line = (s || "").split("\n")[0].trim();
  return line.length > max ? line.slice(0, max) + "…" : line;
}

/** PushEvent -> one embed, commits listed inside (never one message per commit). */
function buildPushEmbed(repo, event, emojis) {
  const p = event.payload || {};
  const branch = (p.ref || "").replace(/^refs\/heads\//, "") || "unknown";
  const commits = Array.isArray(p.commits) ? p.commits : [];
  const total = p.size || commits.length;
  const shown = commits.slice(0, MAX_COMMITS_SHOWN);
  const lines = shown.map((c) => {
    const sha = (c.sha || "").slice(0, 7);
    return `[\`${sha}\`](https://github.com/${repo}/commit/${c.sha}) ${firstLine(c.message)}`;
  });
  if (total > shown.length) lines.push(`*+${total - shown.length} more…*`);

  const n = total;
  return new EmbedBuilder()
    .setAuthor(actorAuthor(event))
    .setTitle(`${emojiMention(emojis, "push")} ${n} commit${n === 1 ? "" : "s"} → ${repo}:${branch}`)
    .setURL(`https://github.com/${repo}/commits/${branch}`)
    .setDescription(lines.length > 0 ? lines.join("\n") : "_No commit details._")
    .setColor(COLORS.push)
    .setTimestamp(new Date(event.created_at))
    .setFooter({ text: `${repo} • push` });
}

/** PullRequestEvent -> opened / reopened / merged / closed. */
function buildPREmbed(repo, event, emojis) {
  const p = event.payload || {};
  const action = p.action;
  if (!["opened", "reopened", "closed"].includes(action)) return null;
  const pr = p.pull_request || {};
  const merged = action === "closed" && pr.merged === true;
  const word = action === "closed" ? (merged ? "merged" : "closed") : action;
  const num = pr.number ?? "?";
  const head = pr.head?.ref || "?";
  const base = pr.base?.ref || "?";

  const desc =
    `by @${pr.user?.login || event.actor?.login || "unknown"} • \`${head}\` → \`${base}\`` +
    (pr.body ? `\n\n${firstLine(pr.body, 200)}` : "");

  return new EmbedBuilder()
    .setAuthor(actorAuthor(event))
    .setTitle(`${emojiMention(emojis, "pr")} PR #${num} ${word}: ${firstLine(pr.title, 100)}`)
    .setURL(pr.html_url || `https://github.com/${repo}/pull/${num}`)
    .setDescription(desc)
    .setColor(merged || action === "opened" ? COLORS.pr : COLORS.pr_closed)
    .setTimestamp(new Date(event.created_at))
    .setFooter({ text: `${repo} • pull request` });
}

/** ReleaseEvent -> published only. */
function buildReleaseEmbed(repo, event, emojis) {
  const p = event.payload || {};
  if (p.action !== "published") return null;
  const r = p.release || {};
  const tag = r.tag_name || "untagged";

  return new EmbedBuilder()
    .setAuthor(actorAuthor(event))
    .setTitle(`${emojiMention(emojis, "release")} ${repo} — ${tag} released`)
    .setURL(r.html_url || `https://github.com/${repo}/releases`)
    .setDescription(
      (r.name ? `**${firstLine(r.name, 100)}**\n\n` : "") + (r.body ? firstLine(r.body, 300) : "_No release notes._")
    )
    .setColor(COLORS.release)
    .setTimestamp(new Date(event.created_at))
    .setFooter({ text: `${repo} • release` });
}

/** Route one GitHub event to its embed builder. Returns null when uninteresting. */
function buildEventPost(repo, event, emojis) {
  switch (event.type) {
    case "PushEvent":
      return buildPushEmbed(repo, event, emojis);
    case "PullRequestEvent":
      return buildPREmbed(repo, event, emojis);
    case "ReleaseEvent":
      return buildReleaseEmbed(repo, event, emojis);
    default:
      return null;
  }
}

/** Sample embeds for the dashboard Test Preview (no network needed). */
function buildSamples(emojis) {
  const now = new Date().toISOString();
  const actor = { login: "wisnurafi", avatar_url: "https://github.com/wisnurafi.png" };
  const push = buildPushEmbed(
    "wisnurafi/my-kait",
    {
      actor,
      created_at: now,
      payload: {
        ref: "refs/heads/main",
        size: 2,
        commits: [
          { sha: "83e8c71abcdef", message: "fix: CTA di empty state tab Scheduled" },
          { sha: "6489307abcdef", message: "fix: satu logika retry 429 untuk send/edit" },
        ],
      },
    },
    emojis
  );
  const pr = buildPREmbed(
    "wisnurafi/my-kait",
    {
      actor,
      created_at: now,
      type: "PullRequestEvent",
      payload: {
        action: "opened",
        pull_request: {
          number: 42,
          title: "feat: dark mode for the editor",
          html_url: "https://github.com/wisnurafi/my-kait/pull/42",
          user: { login: "wisnurafi" },
          head: { ref: "feat/dark-mode" },
          base: { ref: "main" },
          body: "Adds a dark theme toggle to the editor toolbar.",
        },
      },
    },
    emojis
  );
  const release = buildReleaseEmbed(
    "wisnurafi/my-kait",
    {
      actor,
      created_at: now,
      type: "ReleaseEvent",
      payload: {
        action: "published",
        release: {
          tag_name: "v2.1.0",
          name: "Dark mode release",
          html_url: "https://github.com/wisnurafi/my-kait/releases/tag/v2.1.0",
          body: "Editor dark mode, bulk delete fix, and API docs accuracy.",
        },
      },
    },
    emojis
  );
  return [push, pr, release].filter(Boolean);
}

module.exports = { buildPushEmbed, buildPREmbed, buildReleaseEmbed, buildEventPost, buildSamples };
