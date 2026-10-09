const { applyPresence } = require("./richPresence");

/**
 * Status feature: bubble custom status (same style as hios-bot), sent
 * together with the rich "watching" card through one raw opcode-3 writer.
 * See richPresence.js — it is the single owner of the bot's presence.
 */

module.exports = { applyPresence };
