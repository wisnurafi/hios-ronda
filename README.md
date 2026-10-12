# hios-ronda

Patrol bot for Discord: Go Live streamwatch + honeypot spam trap + voice stats + GitHub feed + a collectible-spirit game. When someone starts streaming (Go Live) in any voice channel, the bot automatically joins that channel — presence + auto-management, plus an `@here` notification to the public chat. It also runs a visible honeypot channel that instantly punishes anyone who types in it.

> Honest note: Discord bots can't "watch" a video stream through the official API. What this bot does: join the streamer's voice channel as presence + manage the queue automatically.

## Commands

| Command | What it does |
|---------|--------------|
| `/watch` | Watch dashboard — Go Live notification settings (channel, message template, on/off) |
| `/honeypot` | Honeypot dashboard — spam trap settings |
| `/verify` | Verify dashboard — one-click member verification |
| `/khodam` | Cek Khodam dashboard — spirit game settings (admin) |
| `/begadang` | Night-owl leaderboard dashboard — weekly announcement settings |
| `/rapot` | Weekly patrol report dashboard — announcement settings |
| `/github` | GitHub dashboard — push/PR/release feed settings |
| `/control` | Command lockdown — restrict where/by whom slash commands can be used |
| `/ping` | Check bot latency + API speed |
| `/help` | Show what this bot can do |

## Streamwatch

- Trigger: `voiceStateUpdate` → `self_stream = true`, in any channel.
- FIFO queue per server: whoever goes live first gets the bot (one bot, one voice channel per server).
- Stream stops → 5-second grace period (anti accidental toggles) → bot leaves → moves to the next streamer still live in the queue.
- Private/locked channel the bot can't join → skipped, move to next in queue.
- Streamer moves channel mid-live → bot leaves, does **not** follow. It only joins again on a fresh Go Live event.
- Streamer stops but stays in voice → bot leaves (after grace).
- The bot never holds a temp channel hostage: it leaves as soon as the stream ends, so channel auto-delete keeps working.
- Notifications to the public chat (streamer mention + `@here`): `🔴 @here @philip is live in **#channel** — join to watch!` (+ `⚫ **Name** finished streaming.` when they stop).

### Why not @discordjs/voice?

This bot is presence-only — it never needs audio. So presence is sent manually via gateway opcode 4 (voice state update), with no UDP voice connection. This makes the bot immune to hosts that block UDP (the classic symptom: bot joins then "leaves by itself" because the voice handshake times out). Trade-off: the bot can't send/receive audio — which isn't needed here anyway.

### Watch profile

While someone is live, the bot's profile shows a rich "watching live" card (sent as a raw gateway opcode-3 presence with `application_id`): name `<displayName> live in #<channel>`, state "come watch together", plus an elapsed timer. Text-only — no images. When idle, the profile falls back to the configured custom-status bubble (`STATUS_TEXT`).

Strict either/or: idle sends the bubble alone, watching sends the card alone. Learned the hard way — Discord silently drops the *second* activity on this bot's profile, so sending both means the card never renders. (Earlier attempts at rich presence with art assets were reverted for the same reason; notes kept in `docs/rich-presence.md` so we don't retry blindly.)

### /watch dashboard

`/watch` opens an interactive dashboard (ephemeral, admin-only — or bot owner, auto-closes after 10 minutes):

- **Notify Channel** — per-guild, falls back to the `NOTIFY_CHANNEL_ID` env var, can be reset to the default
- **Message template** — editable, with placeholders: `{mention}` (pings the streamer), `{name}` (display name), `{channel}` (voice channel name)
- **Enable/Disable** — turn Go Live notification messages on or off entirely

## Honeypot 🍯

Visible spam-trap channel (modelled after the classic honeypot bot). Anyone who sends a message there gets punished.

- `/honeypot` — opens the interactive dashboard (ephemeral, admin only):
  - 🛠️ Set Up Channel — bot creates `#❗do-not-type-here❗` + posts the warning embed; the channel where you ran the command becomes the logs channel
  - 📢 Set Logs Channel, 🔨 Punishment Action (ban/kick/timeout), ⏱️ Timeout Duration
  - 🛡️/👤 Exempt roles & users (add/remove) — their messages still get deleted and logged, but punishment is skipped and the counter doesn't increment
  - 💬 Edit Warning Message (title + description, with an `{action}` placeholder that follows the punishment action in bold)
  - ⏯️ Enable/Disable
- The warning message has a public **Info** button explaining the trap (no punishment for reading it)
- On catch: the offending message is **quoted in plain text** (with a forward icon + "jump to channel" link button) to the logs channel, then deleted → punishment applied → counter updated → alert logged. Native message-forwarding was tried first — Discord refuses to forward via webhooks, so plain-text quote is the real implementation.
- Log identity: the bot auto-creates a **"HIOS | Honeypot" webhook** (with pot avatar) in the logs channel, so log messages carry the classic honeypot identity instead of this bot's. The webhook avatar and the warning thumbnail auto-sync to the honeypot artwork (transparent-background art) on startup.
- Logs are plain-text with custom guild icons (warn/info/honey) instead of unicode emoji — no embeds. The icons are hash-tracked: if the art files change, they're re-uploaded automatically (graceful without the Manage Emojis permission).
- Server owner / higher-role targets can't be punished — the bot logs a warning instead

Required bot permissions: **Administrator** (or at least Ban Members + Kick Members + Moderate Members + Manage Channels + **Manage Webhooks** + Send Messages).
Privileged intent: **Message Content** must be enabled in the Developer Portal (Bot → Privileged Gateway Intents) so the bot can quote offending messages. The bot also needs the `GuildMessages` intent (non-privileged).

## Verify ✅

One-click member verification.

- `/verify` — opens the dashboard (ephemeral, admin-only or bot owner, auto-closes after 10 minutes): set the verify channel, the verified role, embed title + description, button label, enable/disable, and post/refresh the public verify message.
- Members click the **Verify** button → the bot assigns the verified role (with an audit-log reason). Config stored in `data/verify.json`.

## Voice stats 📊

Event-driven voice session tracking with weekly announcements. No audio processing, no polling — just `VoiceStateUpdate` timestamps. Needs a Neon Postgres `DATABASE_URL` (tables auto-migrate on startup; if unset/unreachable the feature disables itself with a warning and the bot keeps running).

- `/begadang` — **Night Owls** leaderboard: top 5 members by voice minutes between 00:00–05:00 WIB, announced weekly (default **Monday 09:00 WIB**)
- `/rapot` — **Weekly Patrol Report**: total voice time, most active member, longest session, favorite channel, night owl #1
- Dashboards are ephemeral, admin-or-bot-owner only, auto-close after 10 minutes, and include a **Test Preview** rendered from the current week's real data
- Each dashboard has a **Set Schedule**: day of week + hour + minute, all WIB. A 5-minute cron tick fires announcements whose schedule is due (30-min dedup guard against double-firing after restarts)
- Announcements are English embeds with an editable per-guild template above them (`{placeholders}`)
- Time model: all buckets in Asia/Jakarta; week = Monday 00:00 – Sunday 23:59 WIB; sessions attributed to the week they ended in; rows older than 8 weeks pruned after each weekly announcement

## GitHub feed

Polling-based push/PR/release feed posted to Discord through a **"HIOS | GitHub" webhook** (so the sender reads as HIOS Agent with the GitHub avatar, not the raw bot).

- Polls the real-time GitHub APIs every 2 minutes: `/compare` for new commits (SHA-chained), `/pulls` for PR opened/reopened/merged/closed, `/releases` for published releases — the Events API was too laggy, so it was replaced
- One embed per push (commits listed inside, capped at 10 + "+N more"), posted oldest-first so the timeline reads correctly
- Per-repo poll state in `data/github.json`: restarts never double-post; force-pushes detected (compare 404) and re-baselined automatically; first poll only records a baseline (no history flood)
- Custom guild emojis for push/PR/release icons in embed titles (unicode fallback)
- `/github` dashboard (ephemeral, admin-only, 10-min auto-close): enable/disable + set target channel
- Needs `GITHUB_TOKEN` (public repos need no scopes — the token is just for the 5000 req/hour rate limit) + `GITHUB_REPOS` (comma-separated). Unset → feature stays quiet
- The poller logs an hourly `github: alive` heartbeat at info level — a healthy-but-quiet feed is otherwise indistinguishable from a dead one in the logs

## Command lockdown 🔒

`/control` restricts WHERE (channels) and BY WHOM (users) slash commands can be used, with per-command exceptions:

- `/control channel add|remove|list|clear`, `/control user add|remove|list|clear`, `/control except add|remove|list|clear` (autocomplete from registered commands), `/control status`
- Empty allowlists = no restriction (default). Bot owners always bypass. Needs the **Manage Server** permission to configure
- Structurally scoped to slash commands only: public component buttons (the Verify button, the Khodam panel) are exempt by design — they don't go through the lockdown path at all
- Config in JSON, fail-open

## Cek Khodam 👹

A collectible-spirit game: roll for khodams, build a collection, auto-duel other members.

- **51 khodams** with fixed stats (Indonesian meme flavor), 5 tiers: Common 50% · Rare 28% · Epic 14% · Legendary 6% · Mythic 2%
- **Roll**: 4 rolls per day (1 free cek + 3 rerolls), quota resets daily in WIB, 3-second cooldown between rolls
- **Koleksi**: keep up to 10 khodams; when full, pick one to replace (ephemeral replace/discard prompt)
- **Duel**: automatic battle between each side's strongest khodam (power = ATK×2 + DEF + SPD + HP×0.5). Higher SPD strikes first, max 20 rounds → draw ("both exhausted"). Wins/losses/draws tracked per user
- **Leaderboard**: public, ordered by wins → fewer losses → more draws
- The public panel is icon-only with per-feature colors: **Roll** (blue), **Koleksi** (green), **Duel** (red), **Rank** (gray) — with custom colored button icons. After a public roll/duel result, the panel auto-bumps to the bottom so it's always easy to find
- `/khodam` opens the admin dashboard (ephemeral, auto-close 10 minutes)
- Storage: 3 Neon tables auto-migrated on startup (piggybacks on the voice-stats DB infra) — collection, duel stats, daily rolls

## Misc

- `/ping` — "Pong!" embed with **Bot Latency** (interaction round-trip) and **API Latency** (gateway heartbeat). Public reply
- `/help` — what this bot can do
- **Bot owners**: `OWNER_IDS` env (comma-separated user IDs) — owners bypass the Administrator requirement on the `/honeypot` and `/watch` dashboards
- **Logger**: zero-dependency leveled logger (`src/log.js`), verbosity via `LOG_LEVEL` (`error < warn < info < debug`, default `info`), timestamps in WIB, warnings/errors to stderr

## Setup

1. Create an application + bot in the [Discord Developer Portal](https://discord.com/developers/applications), copy the token.
2. Invite the bot with the `bot` scope + permissions: **View Channels**, **Connect** (voice), **Send Messages**. Intents used: `Guilds`, `GuildVoiceStates` (both non-privileged, no special toggle needed). Honeypot additionally needs **Message Content** (privileged) + Manage Webhooks.
3. On the hosting server:

```bash
npm install
cp .env.example .env
# fill in BOT_TOKEN in .env
npm start
```

Node.js 20+ required.

## Project structure

```
hios-ronda/
  index.js                  # entrypoint (repo root — hosting requirement), wires features
  src/
    config.js               # all env config (bot, notify, grace, status, owners)
    owner.js                # OWNER_IDS check
    log.js                  # leveled logger (LOG_LEVEL), WIB timestamps
    client.js               # Discord client factory
    commands.js             # all slash commands registered in one list (per-guild deploy)
    features/
      status/               # custom status + rich watch card (raw opcode 3, single owner)
      streamwatch/          # auto-join whoever is live
        index.js            # event wiring
        state.js            # per-guild FIFO queue
        presence.js         # voice presence via gateway opcode 4
        reconcile.js        # queue -> presence sync
        notify.js           # live/end notifications (editable template)
        handler.js          # voiceStateUpdate logic
        watchstatus.js      # dynamic status: rich card while watching
        dashboard.js        # /watch dashboard
        store.js            # per-guild watch config
        commands.js
      honeypot/             # visible spam trap
        dashboard.js        # /honeypot dashboard
        handler.js          # catch: quote + delete + punish
        setup.js            # channel + warning message setup
        webhook.js          # "HIOS | Honeypot" webhook identity + avatar sync
        emojis.js           # hash-tracked custom icons (warn/info/honey)
        store.js
        commands.js
      ronda/                # voice stats (Neon): night owls + weekly report
        tracker.js          # session start/end on VoiceStateUpdate
        db.js               # Neon pool + auto-migrate
        time.js             # WIB helpers
        announce.js         # embed builders + scheduled sender
        dashboard.js        # /begadang + /rapot dashboards
        store.js            # per-guild config (data/ronda.json)
        commands.js
      github/               # push/PR/release feed via "HIOS | GitHub" webhook
        poller.js           # 2-min tick, baseline + diff + post + hourly heartbeat
        github.js           # real-time API client (compare/pulls/releases)
        embeds.js           # push/PR/release embed builders
        webhook.js          # webhook identity + avatar
        emojis.js           # custom push/pr/release guild emojis
        dashboard.js        # /github dashboard
        store.js            # per-guild config + poll state (data/github.json)
        commands.js
      control/              # /control command lockdown
      verify/               # one-click verification
      khodam/               # Cek Khodam game (Neon: collection/duel/daily)
      ping/                 # /ping
      help/                 # /help
```

New features go under `src/features/<name>/` with an `index.js` exposing
`register(client, config)`, then one line in the root `index.js`. Slash
commands go in the feature's `commands.js` and get added to the single
list in `src/commands.js` (guild command PUT *replaces* the whole list,
so registering per-feature would make them delete each other).

## Env vars

| Var | Required | Default | Description |
|-----|----------|---------|-------------|
| `BOT_TOKEN` | yes | – | Discord bot token |
| `NOTIFY_CHANNEL_ID` | no | `1400349914155847744` | Fallback text channel for live notifications (overridable per-guild in `/watch`) |
| `LEAVE_GRACE_MS` | no | `5000` | Grace period before leaving after a stream stops (ms) |
| `OWNER_IDS` | no | – | Comma-separated bot owner user IDs (bypass Administrator on dashboards) |
| `STATUS_TEXT` | no | `on patrol` | Custom status text |
| `STATUS_TYPE` | no | `4` (Custom) | `0`=Playing `1`=Streaming `2`=Listening `3`=Watching `4`=Custom `5`=Competing (number or name) |
| `STATUS_URL` | no | – | Stream URL — only used when `STATUS_TYPE=streaming` (must be a valid Twitch/YouTube URL) |
| `STATUS_MODE` | no | `online` | `online` \| `idle` \| `dnd` \| `invisible` |
| `DATABASE_URL` | no | – | Neon Postgres **pooled** connection string — enables voice stats (`/begadang`, `/rapot`) + khodam storage. Tables auto-migrate on startup |
| `GITHUB_TOKEN` | no | – | GitHub PAT — enables the push/PR/release feed (public repos need no scopes; token is for rate limit) |
| `GITHUB_REPOS` | no | – | Comma-separated repos to track, e.g. `wisnurafi/my-kait,wisnurafi/hios-ronda` |
| `LOG_LEVEL` | no | `info` | `error` < `warn` < `info` < `debug` |

## Storage

- Discord log channels are the archive for moderation/verification events — no DB needed for those.
- Neon Postgres is only for per-user accumulative state that needs querying: voice stats and khodam data (tables auto-migrate on startup).
- Feature config stays in JSON files (`data/*.json`), fail-open.

## Resource

Lightweight: only gateway events + presence via opcodes 3/4 (no audio/UDP connection). Safe for free tiers, including hosts that block UDP.
