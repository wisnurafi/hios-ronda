# Security Policy — hios-ronda

We take security seriously. If you discover a vulnerability, please follow the policy below so we can triage and address it safely.

## Summary / Self-hosting clarity

hios-ronda is distributed as open-source software (MIT) for self-hosting. The maintainers do not operate self-hosted instances and do not have access to user data or configurations on third-party deployments. Self-hosters are responsible for securing and operating their instances. This policy describes how to report vulnerabilities affecting the project code, plus guidance for self-hosters who discover security issues in their own deployment.

## Reporting a vulnerability

- **Preferred:** open a private GitHub Security Advisory for this repository.
- Do NOT open a public issue with exploit details.

If you found a problem in your self-hosted instance that looks like misconfiguration, check your own setup first. If you believe the issue is caused by a vulnerability in hios-ronda's code, report it as above and mention whether it was observed on a self-hosted deployment.

## Response timelines (what to expect)

- Acknowledgement: within 72 hours.
- Triage & severity estimate: within 7 days.
- Fix plan:
  - Critical: aim to ship a fix or mitigation within 7–14 days.
  - High: aim to ship within 30 days.
  - Medium/Low: addressed in a future release; communicated within 90 days.
- Public disclosure: coordinated with the reporter, normally published after a patch is released (or within 90 days if unresolved, unless the reporter requests otherwise).

## Safe testing rules

- Only test bots/servers you own or have explicit permission to test.
- Do not exfiltrate, destroy, or modify other people's data.
- Do not attempt to access Discord user tokens, DMs, or other private user content.
- Provide a minimal, safe proof-of-concept that reproduces the issue. Redact tokens and PII.
- If the vulnerability needs intrusive testing, contact us first to agree on a plan.

## What to include in your report

- Component affected (e.g., honeypot handler, verify dashboard, GitHub poller, DB layer).
- Clear, minimal steps to reproduce.
- Environment: commit SHA or release tag.
- Whether it was observed on a self-hosted deployment (and how it's configured).
- Proof-of-concept (script, logs, screenshots) — sanitize secrets first.
- Impact (data exposure, privilege escalation, RCE, etc.).
- Suggested mitigation (if any).
- Contact info for follow-up.

## If your self-hosted instance is compromised

- Immediately rotate exposed secrets (`BOT_TOKEN`, `DATABASE_URL`, `GITHUB_TOKEN`).
- Snapshot logs/configuration for investigation (never share secrets).
- If you need upstream help, file a private security advisory with sanitized reproduction steps and the commit SHA you're running.
- Maintainers can only fix vulnerabilities in upstream code — we can't rotate your tokens or remediate your deployment.

## Scope

- In-scope: this repository's code, its webhook identities ("HIOS | Honeypot", "HIOS | GitHub"), and the intended deployment artifacts.
- Out-of-scope: third-party services (Discord itself, Neon, hosting providers), and instances you don't own without the owner's consent.

## Hardening advice for self-hosters

- Keep secrets out of the repository — use `.env` (see `.env.example`), a secret manager, or your host's env UI. Never commit `.env`.
- Use the **pooled** Neon connection string for `DATABASE_URL`, and don't expose your database to the public internet.
- Restrict the bot's Discord intents and permissions to the minimum it needs (see README setup).
- Enable Dependabot / security alerts and secret scanning on your fork.
- Rotate `BOT_TOKEN` and `GITHUB_TOKEN` if you suspect compromise.
- Watch the logs — the GitHub poller and background features log an info-level heartbeat so a silent feature reads as alive, not dead.

## Privacy & telemetry

hios-ronda does not phone home or collect usage data. Maintainers receive nothing from self-hosted instances.

## Disclosure & credits

Researchers are credited in release notes/advisories unless anonymity is requested.

Thank you for helping keep hios-ronda safe.
