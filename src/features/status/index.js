const { Events } = require("discord.js");
const { applyPresence } = require("./presence");

/**
 * Status feature: presence via one raw opcode-3 writer (see presence.js —
 * it is the single owner of the bot's presence). Either/or: idle sends the
 * bubble custom status alone, watching sends the rich card alone.
 *
 * Nothing else in the codebase may call setPresence/setActivity, or the
 * two writers will fight and overwrite each other. Streamwatch refreshes
 * presence after every queue reconciliation via refreshWatchStatus(),
 * which calls the same single writer (applyPresence).
 */
function registerStatus(client, config) {
  client.once(Events.ClientReady, (c) => applyPresence(c, config));
}

module.exports = { registerStatus, applyPresence };
