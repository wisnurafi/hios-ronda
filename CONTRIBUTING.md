# Contributing to hios-ronda

Thanks for your interest in contributing! This guide covers local setup, project conventions, and what we look for in pull requests.

## Ways to contribute

- Bug fixes and reliability improvements
- New features or enhancements to existing ones
- Documentation updates

Before starting a large feature, open an issue so we can align on scope and avoid duplicate work.

## Getting started

### Prerequisites

- **Node.js 20+**
- **PostgreSQL** (optional — only needed for voice stats and the khodam game; without `DATABASE_URL` those features disable themselves and the bot still runs)
- A **Discord bot application** with the intents listed in [README.md](README.md#setup)

### Local setup

1. Fork and clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy the environment file and configure it:
   ```bash
   cp .env.example .env
   ```
   At minimum, set `BOT_TOKEN`. See [README.md](README.md#env-vars) for the full list.
4. Start the bot:
   ```bash
   npm start
   ```
5. Run the unit tests (pure logic, no Discord or DB needed):
   ```bash
   node --test src/features/khodam/khodam.test.js
   ```

## Project conventions

New features go under `src/features/<name>/` with an `index.js` exposing `register(client, config)`, then one line in the root `index.js`. See `roadmap.txt` for the full structure map.

Things to know before you touch the code:

- **CommonJS** (`require` / `module.exports`) — this repo is not ESM. Match the surrounding style.
- **Slash commands live in one list** (`src/commands.js`) and are deployed per-guild on startup. Guild command PUT *replaces* the whole list, so always add new commands to that single list — never deploy per-feature, or commands will delete each other.
- **Config is JSON, fail-open** (`data/*.json`). The bot must keep running when config is missing or corrupt.
- **Neon is only for per-user accumulative state** (voice stats, khodam data). Tables auto-migrate on startup (`CREATE TABLE IF NOT EXISTS`) — no manual migrations. Everything else (moderation logs, verify audit trail) lives in Discord log channels, not the DB.
- **Dashboards follow a fixed form**: one command per feature, ephemeral, admin-only (or bot owner via `OWNER_IDS`), auto-close after 10 minutes of inactivity, channel picker that includes announcement channels.
- **Announcements and embed copy are English**; keep it that way.
- **Free-tier ceiling**: no new processes, no heavy/native dependencies — everything stays event-driven inside discord.js. The bot runs on a free host with UDP blocked, so presence goes through raw gateway opcodes, never `@discordjs/voice`.
- Background features should log a cheap info-level heartbeat — a healthy-but-quiet feature is indistinguishable from a dead one in the logs otherwise.

## Code guidelines

- Match existing style — look at the neighboring feature first.
- Handle errors gracefully: catch failures, log with context (`src/log.js`), and reply with a user-friendly message where appropriate.
- Keep guild isolation: per-guild config and data must stay scoped per server.
- Keep changes minimal — extend existing utilities instead of duplicating logic.
- Document user-facing behavior: update README.md when setup steps or config change, and mention new env vars in `.env.example`.

## Pull request checklist

In your PR description, include:

- **What** changed
- **Why** it's needed
- **How to test** it manually (commands to run, env vars to set)

Use descriptive branch names, for example:

- `fix/honeypot-counter-race`
- `feat/khodam-season-reset`
- `docs/readme-env-table`

## Reporting issues

When reporting a bug, include:

- Steps to reproduce
- Expected vs. actual behavior
- Relevant logs (`LOG_LEVEL=debug` helps locally)
- Whether `DATABASE_URL` is set (for stats/khodam issues)
- Commit hash if known

## License

By contributing, you agree that your contributions will be licensed under the same [MIT License](LICENSE) that covers this project.
