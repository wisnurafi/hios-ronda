# Voice stats — night owls & weekly patrol report

Event-driven voice session tracking with weekly announcements. No audio
processing, no polling — just `VoiceStateUpdate` timestamps.

## Features

- **🌙 Night Owls leaderboard** (`/begadang` dashboard) — top 5 members by
  voice minutes between 00:00–05:00 WIB, announced every **Monday 09:00 WIB**.
- **📋 Weekly Patrol Report** (`/rapot` dashboard) — total voice time, most
  active member, longest session, favorite channel, night owl #1. Same schedule.
- Both announcements are English embeds; the text above each embed is an
  editable per-guild template with `{placeholders}` (see dashboard).
- Dashboards are ephemeral, admin-or-bot-owner only, auto-close after 10 min,
  and include a **Test Preview** rendered from the current week's real data.

## Time model

- All buckets use **Asia/Jakarta (WIB, UTC+7)** regardless of host timezone.
- Week = Monday 00:00 – Sunday 23:59 WIB, keyed as `week_start` (YYYY-MM-DD).
- A session is attributed to the week it **ended** in.
- Night minutes = overlap with 00:00–05:00 WIB, computed per day for
  multi-day sessions.

## Storage (Neon Postgres)

- Connection: `DATABASE_URL` env (use the **pooled** Neon string).
- `src/features/ronda/db.js` auto-migrates on startup
  (`CREATE TABLE IF NOT EXISTS ronda_voice_stats`) — no manual migration.
- Writes happen **only when a voice session ends** (1 UPSERT per session).
- If the DB is unset/unreachable, the feature disables itself with a warning;
  the bot keeps running and stats for that period are skipped.
- Rows older than 8 weeks are pruned after each weekly announcement.

## Files

- `src/features/ronda/time.js` — WIB helpers (tested: week buckets, night overlap)
- `src/features/ronda/db.js` — pool, auto-migrate, upsert, queries
- `src/features/ronda/tracker.js` — session start/end on VoiceStateUpdate,
  restart seeding from live voice states (bots excluded)
- `src/features/ronda/announce.js` — embed builders + weekly sender
- `src/features/ronda/store.js` — per-guild dashboard config (`data/ronda.json`)
- `src/features/ronda/dashboard.js` — `/begadang` + `/rapot` dashboards
- `src/features/ronda/commands.js` — slash command definitions
- `src/features/ronda/index.js` — wiring (cron: `0 9 * * 1`, Asia/Jakarta)
