# Voice stats — night owls & weekly patrol report

Event-driven voice session tracking with weekly announcements. No audio
processing, no polling — just `VoiceStateUpdate` timestamps.

## Features

- **🌙 Night Owls leaderboard** (`/begadang` dashboard) — top 5 members by
  voice minutes between 00:00–05:00 WIB, announced on the guild's schedule
  (default **Monday 09:00 WIB**).
- **📋 Weekly Patrol Report** (`/rapot` dashboard) — total voice time, most
  active member, longest session, favorite channel, night owl #1. Own schedule.
- Both announcements are English embeds; the text above each embed is an
  editable per-guild template with `{placeholders}` (see dashboard).
- Dashboards are ephemeral, admin-or-bot-owner only, auto-close after 10 min,
  and include a **Test Preview** rendered from the current week's real data.
- Each dashboard has a **Set Schedule** option: day of week + hour + minute,
  all in WIB. A 5-minute cron tick fires announcements whose schedule is due
  (with a 30-min dedup guard against double-firing after restarts).

## Time model

- All buckets use **Asia/Jakarta (WIB, UTC+7)** regardless of host timezone.
- Week = Monday 00:00 – Sunday 23:59 WIB, keyed as `week_start` (YYYY-MM-DD).
- A session is attributed to the week it **ended** in.
- Night minutes = overlap with 00:00–05:00 WIB, computed per day for
  multi-day sessions.

## Storage (Neon Postgres)

- Connection: `DATABASE_URL` env (use the **pooled** Neon string).
- `src/features/voice-stats/db.js` auto-migrates on startup
  (`CREATE TABLE IF NOT EXISTS ronda_voice_stats`) — no manual migration.
- Writes happen **only when a voice session ends** (1 UPSERT per session).
- If the DB is unset/unreachable, the feature disables itself with a warning;
  the bot keeps running and stats for that period are skipped.
- Rows older than 8 weeks are pruned after each weekly announcement.

## Files

- `src/features/voice-stats/time.js` — WIB helpers (tested: week buckets, night overlap)
- `src/features/voice-stats/db.js` — schema + queries (pool is shared via `src/db.js`)
- `src/features/voice-stats/tracker.js` — session start/end on VoiceStateUpdate,
  restart seeding from live voice states (bots excluded)
- `src/features/voice-stats/announce.js` — embed builders + weekly sender
- `src/features/voice-stats/store.js` — per-guild dashboard config (`data/ronda.json`)
- `src/features/voice-stats/dashboard.js` — `/begadang` + `/rapot` dashboards
- `src/features/voice-stats/commands.js` — slash command definitions
- `src/features/voice-stats/index.js` — wiring (cron: `0 9 * * 1`, Asia/Jakarta)
