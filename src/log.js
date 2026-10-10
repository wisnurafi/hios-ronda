/**
 * Lightweight leveled logger — zero dependencies.
 *
 * LOG_LEVEL env controls verbosity: error < warn < info < debug.
 * Default: "info". Unknown values fall back to "info" with a warning.
 *
 * Drop-in compatible: log(...) === log.info(...).
 * Timestamps are WIB wall-clock to match the server owner's reading.
 */

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

const rawLevel = (process.env.LOG_LEVEL || "info").toLowerCase().trim();
const currentLevel = LEVELS[rawLevel] ?? LEVELS.info;

const WIB_OFFSET_MS = 7 * 3600 * 1000;

function timestamp() {
  return new Date(Date.now() + WIB_OFFSET_MS).toISOString().slice(0, 19).replace("T", " ");
}

function write(level, args) {
  if (LEVELS[level] > currentLevel) return;
  const prefix = `[${timestamp()}] [ronda] [${level.toUpperCase()}]`;
  // errors/warnings go to stderr so they stand out in host log viewers
  if (level === "error" || level === "warn") console.error(prefix, ...args);
  else console.log(prefix, ...args);
}

function make(level) {
  return (...args) => write(level, args);
}

const log = make("info");
log.error = make("error");
log.warn = make("warn");
log.info = make("info");
log.debug = make("debug");
log.level = rawLevel in LEVELS ? rawLevel : "info";

if (!(rawLevel in LEVELS)) {
  log.warn(`unknown LOG_LEVEL="${rawLevel}", falling back to "info"`);
}

module.exports = { log };
