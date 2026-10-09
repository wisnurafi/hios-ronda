const { applyPresence } = require("../status");

/**
 * Single owner for the bot's presence. Called after every queue
 * reconciliation (and on ready): bubble custom status always, plus a
 * rich "watching X live" card while someone is live. Implemented as one
 * raw opcode-3 payload — discord.js setPresence/setActivity would drop
 * the rich fields and fight with this writer.
 */
function refreshWatchStatus(client, config) {
  return applyPresence(client, config);
}

module.exports = { refreshWatchStatus };
