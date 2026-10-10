/**
 * Custom Discord embeds for GitHub events, all user-facing text in English.
 * Each event type gets its own white icon (from Wisnu) as the thumbnail.
 */

const path = require("path");
const { EmbedBuilder, AttachmentBuilder } = require("discord.js");

const ASSETS = path.join(__dirname, "assets");

const ICON_FILES = { push: "push.png", pr: "pr.png", release: "release.png" };
const COLORS = { push: 0x2da44e, pr: 0x8250df, pr_closed: 0x57606a, release: 0x0969da };
const MAX_COMMITS_SHOWN = 10;

function iconAttachment(kind) {
  const file = ICON_FILES[kind];
  return new AttachmentBuilder(path.join(ASSETS, file), { name: file });
}

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
function buildPushEmbed(repo, event) {
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
  const embed = new EmbedBuilder()
    .setAuthor(actorAuthor(event))
    .setTitle(`📦 ${n} commit${n === 1 ? "" : "s"} → ${repo}:${branch}`)
    .setURL(`https://github.com/${repo}/commits/${branch}`)
    .setDescription(lines.length > 0 ? lines.join("\n") : "_No commit details._")
    .setColor(COLORS.push)
    .setThumbnail(`attachment://${ICON_FILES.push}`)
    .setTimestamp(new Date(event.created_at))
    .setFooter({ text: `${repo} • push` });
  return { embed, attachment: iconAttachment("push") };
}

/** PullRequestEvent -> opened / reopened / merged / closed. */
function buildPREmbed(repo, event) {
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

  const embed = new EmbedBuilder()
    .setAuthor(actorAuthor(event))
    .setTitle(`🔀 PR #${num} ${word}: ${firstLine(pr.title, 100)}`)
    .setURL(pr.html_url || `https://github.com/${repo}/pull/${num}`)
    .setDescription(desc)
    .setColor(merged || action === "opened" ? COLORS.pr : COLORS.pr_closed)
    .setThumbnail(`attachment://${ICON_FILES.pr}`)
    .setTimestamp(new Date(event.created_at))
    .setFooter({ text: `${repo} • pull request` });
  return { embed, attachment: iconAttachment("pr") };
}

/** ReleaseEvent -> published only. */
function buildReleaseEmbed(repo, event) {
  const p = event.payload || {};
  if (p.action !== "published") return null;
  const r = p.release || {};
  const tag = r.tag_name || "untagged";

  const embed = new EmbedBuilder()
    .setAuthor(actorAuthor(event))
    .setTitle(`🚀 ${repo} — ${tag} released`)
    .setURL(r.html_url || `https://github.com/${repo}/releases`)
    .setDescription(
      (r.name ? `**${firstLine(r.name, 100)}**\n\n` : "") + (r.body ? firstLine(r.body, 300) : "_No release notes._")
    )
    .setColor(COLORS.release)
    .setThumbnail(`attachment://${ICON_FILES.release}`)
    .setTimestamp(new Date(event.created_at))
    .setFooter({ text: `${repo} • release` });
  return { embed, attachment: iconAttachment("release") };
}

/** Route one GitHub event to its embed builder. Returns null when uninteresting. */
function buildEventPost(repo, event) {
  switch (event.type) {
    case "PushEvent":
      return buildPushEmbed(repo, event);
    case "PullRequestEvent":
      return buildPREmbed(repo, event);
    case "ReleaseEvent":
      return buildReleaseEmbed(repo, event);
    default:
      return null;
  }
}

/** Sample posts for the dashboard Test Preview (no network needed). */
function buildSamples() {
  const now = new Date().toISOString();
  const actor = { login: "wisnurafi", avatar_url: "https://github.com/wisnurafi.png" };
  const push = buildPushEmbed("wisnurafi/my-kait", {
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
  });
  const pr = buildPREmbed("wisnurafi/my-kait", {
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
  });
  const release = buildReleaseEmbed("wisnurafi/my-kait", {
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
  });
  return [push, pr, release].filter(Boolean);
}

module.exports = { buildPushEmbed, buildPREmbed, buildReleaseEmbed, buildEventPost, buildSamples };
