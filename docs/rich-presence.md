# Rich Presence (RPC) for bots — research notes

> VERDICT 2026-10-10: REVERTED. Two live QA rounds — first without, then
> with `application_id` on the activity — the rich card never rendered on
> the bot's profile, while the plain bubble from the SAME payload rendered
> fine both times. Assets (`watch`/`seen`) were uploaded to the right app
> well before the tests, keys correct, payload shape verified against the
> gateway docs. Root cause unknown. Decision (Wisnu): back to plain text —
> `Watching <displayName> live in #<channel>` via discord.js `setPresence`.
> Rich code deleted (`src/features/status/
> richPresence.js`); this doc kept so we don't retry this blindly.
>
> FOLLOW-UP FINDING (same day): the revert's first version sent
> [bubble, watching] as TWO activities — the watching one didn't render
> either. Pattern across all QA: 1 activity renders, a 2nd in the array is
> silently dropped on this bot's profile. So the final design is strict
> either/or: idle -> bubble only; watching -> Watching text only (no
> bubble). This matches the original pre-rich behavior that was known
> to work.
>
> RETRY (same day, Wisnu's call): the 2-activity rule suggests rich itself
> was never broken — it was just always sent as the 2nd activity. Retrying
> rich as the SOLE activity when watching (either/or: idle -> bubble,
> watching -> rich card alone, no bubble). If the card renders this time,
> the rule is confirmed.

Checked against discord.js v14 source installed in this repo (2026-10-09).

## What discord.js supports out of the box

`client.user.setPresence()` / `setActivity()` only accept
`{ name, state, url, type }`. The runtime (`ClientPresence._parse`)
**drops everything else** — `details`, `assets`, `timestamps`,
`party`, `buttons` never reach the gateway. So:

- Custom status (type 4 + `state` text, like hios-bot's
  "thinking about you") — works, already implemented in
  `src/features/status/`.
- Full rich presence (images, details, elapsed timer) — NOT possible
  through discord.js helpers.

## How to get full rich presence anyway

Send a raw presence update over the gateway (opcode 3), the same way
`src/features/streamwatch/presence.js` already sends opcode 4 for
voice. Example payload:

```js
await guild.shard.send({
  op: 3,
  d: {
    status: "online",
    afk: false,
    since: null,
    activities: [{
      name: "Ronda FM",
      type: 2, // Listening
      details: "Patrolling the server",
      state: "3 streamers live",
      timestamps: { start: Date.now() },
      assets: {
        large_image: "logo",      // key from YOUR app's art assets
        large_text: "hios-ronda",
      },
    }],
  },
});
```

Caveat: anything calling `client.user.setPresence()` afterwards
overwrites it — the status feature and RPC must not fight; pick one
owner for presence.

## What Discord requires

1. **Art assets** must be uploaded in the Developer Portal → your
   application → Rich Presence → Art Assets. Image keys (e.g. `logo`)
   only work from the bot's own app.
2. **Type Streaming (1)** requires a valid Twitch/YouTube `url`.
3. **Buttons are NOT supported for bots.** Discord strips them
   server-side (they were abused). Don't design around buttons.
4. Large/small images, details, state, timestamps, party — all fine
   for bots.
5. **`application_id` is REQUIRED on the rich activity.** Every working
   rich presence (game SDK, RPC tools, gateway examples) carries it; without
   it the client does not render the card as rich (2026-10-10: confirmed —
   card missing until we added it). For bots the user id IS the application
   id, so send `application_id: client.user.id`.

## Checklist to enable

- [ ] Upload art assets in the Developer Portal, note the keys
      (`watch` = large image, `seen` = small image) — manual step, cannot be done from here
- [x] Decide activity type + copy (name/details/state) — Watching,
      `"<displayName> live"`, `Live in #<channel>`, `come watch together`
- [x] Implement raw opcode-3 sender — `src/features/status/richPresence.js`,
      the single owner of presence (bubble + rich card in one payload)
- [x] Make sure nothing else overwrites it — `setPresence`/`setActivity`
      no longer called anywhere; `refreshWatchStatus` delegates to the sender
