# Rich Presence (RPC) for bots — research notes

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

## Checklist to enable

- [ ] Upload art assets in the Developer Portal, note the keys
- [ ] Decide activity type + copy (name/details/state)
- [ ] Implement raw opcode-3 sender (see `presence.js` for the pattern)
- [ ] Make sure `src/features/status/` doesn't overwrite it
