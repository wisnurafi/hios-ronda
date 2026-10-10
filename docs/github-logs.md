# GitHub logs — push/PR/release feed via HIOS Agent

Polling-based feed: every 3 minutes the bot asks the GitHub Events API for
new activity on the configured repos and posts it to the guild's target
channel through the **"HIOS | GitHub"** webhook (name + GitHub avatar, so the
sender reads as HIOS Agent instead of the raw GitHub App).

## Setup

1. Create a fine-grained or classic PAT (public repos need no scopes — the
   token is only used for the 5000 req/hour rate limit).
2. In Wispbyte `.env` (never in chat):
   `GITHUB_TOKEN=<token>`
   `GITHUB_REPOS=wisnurafi/my-kait,wisnurafi/hios-ronda`
3. Pull, restart, then run `/github` → **Set Target Channel**.
4. Delete the old GitHub App webhooks from each repo's settings.

## Behavior

- Events tracked: **PushEvent** (one embed per push, commits listed inside,
  capped at 10 + "+N more"), **PullRequestEvent** (opened/reopened/merged/
  closed), **ReleaseEvent** (published only).
- New events post oldest-first so the timeline reads correctly.
- Newest seen event id per repo is stored in `data/github.json` —
  restarts never double-post.
- The very first poll per repo only records the baseline (no flood of history).
- If `GITHUB_TOKEN`/`GITHUB_REPOS` are unset, the feature stays quiet and
  the bot keeps running.
- API/token errors are logged as warnings; the next tick retries.

## Files

- `src/features/github/store.js` — per-guild config + env parsing
- `src/features/github/github.js` — minimal Events API client (native fetch)
- `src/features/github/embeds.js` — push/PR/release embed builders (+ preview samples)
- `src/features/github/webhook.js` — "HIOS | GitHub" webhook (avatar: `assets/avatar.png`)
- `src/features/github/poller.js` — 3-minute tick, baseline + diff + post
- `src/features/github/dashboard.js` — `/github` dashboard (ephemeral, admin-only, 10-min auto-close)
- `src/features/github/assets/` — webhook avatar + white push/pr/release icons (from Wisnu)
