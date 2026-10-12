/**
 * Honeypot store — JSON file, keyed by guild id.
 * load/save/getConfig/updateConfig come from src/json-store.js.
 */

const { createStore } = require("../../json-store");

function defaults() {
  return {
    enabled: true,
    honeypotChannelId: null,
    honeypotMessageId: null, // warning message (counter button edited in place)
    logsChannelId: null,
    action: "ban", // ban | kick | timeout
    timeoutMinutes: 60,
    exemptRoles: [],
    exemptUsers: [],
    emojis: {},
    logsWebhookId: null,
    logsWebhookToken: null,
    warningTitle: "DO NOT SEND MESSAGES IN THIS CHANNEL",
    warningDescription:
      "This channel is used to catch spam bots. Any messages sent here will result in {action}.",
    catches: 0,
  };
}

const { getConfig, updateConfig } = createStore({
  file: "honeypot.json",
  defaults,
  name: "honeypot",
});

module.exports = { getConfig, updateConfig, defaults };
