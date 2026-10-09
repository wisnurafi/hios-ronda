const { applyPresence } = require("../status");

/**
 * Single owner for the bot's presence. Called after every queue
 * reconciliation (and on ready). Either/or: idle -> bubble custom status
 * alone; watching -> rich "watching X live" card alone (live QA proved a
 * 2nd activity in the array is silently dropped). Raw opcode 3 —
 * discord.js setPresence/setActivity would drop the rich fields and fight
 * with this writer.
 */
function refreshWatchStatus(client, config) {
  return applyPresence(client, config);
}

module.exports = { refreshWatchStatus };
