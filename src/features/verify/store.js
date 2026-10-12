/**
 * Verify store — JSON file, keyed by guild id.
 *
 * Config shape:
 *   {
 *     enabled: bool,
 *     verifyChannelId: string|null,   // where the public verify message lives
 *     verifyMessageId: string|null,   // the posted message to edit in place
 *     verifiedRoleId: string|null,    // role granted on button click
 *     embedTitle: string,
 *     embedDescription: string,
 *     buttonLabel: string,
 *     emojis: { check: {id,name}|null, shield: {id,name}|null },
 *     emojiHashes: { check: md5, shield: md5 },
 *   }
 */

const { createStore } = require("../../json-store");

function defaults() {
  return {
    enabled: true,
    verifyChannelId: null,
    verifyMessageId: null,
    verifiedRoleId: null,
    embedTitle: "✅ Verify yourself",
    embedDescription:
      "Welcome to the server! Click the **Verify** button below to prove you're human and unlock the rest of the server.",
    buttonLabel: "Verify",
    emojis: {},
    emojiHashes: {},
  };
}

const { getConfig, updateConfig } = createStore({
  file: "verify.json",
  defaults,
  name: "verify",
});

module.exports = { getConfig, updateConfig, defaults };
