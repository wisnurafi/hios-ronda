/**
 * Khodam store — JSON file, keyed by guild id. Fail-open like the other
 * feature stores: a broken file never blocks the bot.
 *
 * Config shape:
 *   {
 *     enabled: bool,
 *     channelId: string|null,   // where the public panel + results live
 *     messageId: string|null,   // the posted panel message to edit in place
 *     emojis: { roll: {id,name}|null, collection, duel, leaderboard, mascot },
 *     emojiHashes: { roll: md5, ... },
 *   }
 */

const { createStore } = require("../../json-store");

function defaults() {
  return {
    enabled: true,
    channelId: null,
    messageId: null,
    emojis: {},
    emojiHashes: {},
  };
}

const { getConfig, updateConfig } = createStore({
  file: "khodam.json",
  defaults,
  name: "khodam",
});

module.exports = { getConfig, updateConfig, defaults };
