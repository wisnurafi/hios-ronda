const { applyPresence } = require("./richPresence");

/**
 * Status feature: presence via one raw opcode-3 writer (see richPresence.js —
 * it is the single owner of the bot's presence). Either/or: idle sends the
 * bubble custom status alone, watching sends the rich card alone.
 */

module.exports = { applyPresence };
