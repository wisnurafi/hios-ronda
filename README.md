# hios-ronda

Patrol bot for Discord Go Live streams. When someone starts streaming (Go Live) in any voice channel, the bot automatically joins that channel — presence + auto-management, plus an `@here` notification to the public chat.

> Honest note: Discord bots can't "watch" a video stream through the official API. What this bot does: join the streamer's voice channel as presence + manage the queue automatically.

## How it works

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

## Setup

1. Create an application + bot in the [Discord Developer Portal](https://discord.com/developers/applications), copy the token.
2. Invite the bot with the `bot` scope + permissions: **View Channels**, **Connect** (voice), **Send Messages**. Intents used: `Guilds`, `GuildVoiceStates` (both non-privileged, no special toggle needed).
3. On the hosting server:

```bash
npm install
cp .env.example .env
# fill in BOT_TOKEN in .env
npm start
```

Node.js 20+ required.

## Env vars

| Var | Required | Default | Description |
|-----|----------|---------|-------------|
| `BOT_TOKEN` | yes | – | Discord bot token |
| `NOTIFY_CHANNEL_ID` | no | `1400349914155847744` | Text channel for live notifications |
| `LEAVE_GRACE_MS` | no | `5000` | Grace period before leaving after a stream stops (ms) |

## Resource

Lightweight: only gateway events + presence via opcode 4 (no audio/UDP connection). Safe for free tiers, including hosts that block UDP.
