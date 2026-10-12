/**
 * Lightweight leveled logger — zero dependencies.
 *
 * Port of the hios-bot mini logger (CommonJS flavor). LOG_LEVEL env
 * controls verbosity: error < warn < info < debug. Default "info".
 * Unknown values fall back to "info" with a warning.
 *
 * Usage:
 *   const { log } = require("../../log");
 *   log("khodam: panel bump done");            // callable === info
 *   log.info("message", { guildId, userId });  // structured meta
 *   log.warn("message", err);                  // Error -> stack printed
 *
 *   const { logFor } = require("../../log");
 *   const flog = logFor("khodam");             // auto-tags [khodam]
 *   flog.info("roll", { user, tier, ms: 812 });
 *
 * Interaction handlers should wrap with trace context so guildId/userId/
 * command ride along on every log line inside:
 *   const { runWithTraceContext, createInteractionTraceContext } = require("../../log");
 *   runWithTraceContext(createInteractionTraceContext(interaction), () =>
 *     handleSomething(interaction));
 *
 * Timestamps are WIB wall-clock to match the server owner's reading.
 * warn/error go to stderr so they stand out in the host log viewer.
 */

const { AsyncLocalStorage } = require("async_hooks");
const crypto = require("crypto");

// ---------------------------------------------------------------------------
// Trace context (AsyncLocalStorage bawaan Node)
// ---------------------------------------------------------------------------

const traceStorage = new AsyncLocalStorage();

function sanitizeCommandName(interaction) {
  if (interaction?.isChatInputCommand?.() && interaction.commandName) {
    return `/${interaction.commandName}`;
  }
  if (
    interaction?.isButton?.() ||
    interaction?.isModalSubmit?.() ||
    interaction?.isStringSelectMenu?.() ||
    interaction?.isUserSelectMenu?.()
  ) {
    return interaction.customId || null;
  }
  return null;
}

function createTraceId(prefix = "trc") {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

/** Trace context for an interaction (slash command, button, modal, select). */
function createInteractionTraceContext(interaction, overrides = {}) {
  return {
    traceId: createTraceId(),
    interactionId: interaction?.id || null,
    guildId: interaction?.guildId || null,
    channelId: interaction?.channelId || null,
    userId: interaction?.user?.id || null,
    command: sanitizeCommandName(interaction),
    ...overrides,
  };
}

/** Trace context for non-interaction events (voice state, timers, guild). */
function createEventTraceContext(overrides = {}) {
  return {
    traceId: createTraceId("evt"),
    interactionId: null,
    guildId: null,
    channelId: null,
    userId: null,
    command: null,
    ...overrides,
  };
}

function runWithTraceContext(traceContext, callback) {
  return traceStorage.run(traceContext, callback);
}

function getTraceContext() {
  return traceStorage.getStore() || null;
}

// ---------------------------------------------------------------------------
// Level & format
// ---------------------------------------------------------------------------

const SERVICE = "ronda";

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

const rawLevel = (process.env.LOG_LEVEL || "info").toLowerCase().trim();
const currentLevel = LEVELS[rawLevel] !== undefined ? LEVELS[rawLevel] : LEVELS.info;

const WIB_OFFSET_MS = 7 * 3600 * 1000;

function timestamp() {
  return new Date(Date.now() + WIB_OFFSET_MS).toISOString().slice(0, 19).replace("T", " ");
}

function attachTraceContext(meta) {
  const ctx = getTraceContext();
  if (!ctx) return meta;
  if (!meta.traceId && ctx.traceId) meta.traceId = ctx.traceId;
  if (!meta.guildId && ctx.guildId) meta.guildId = ctx.guildId;
  if (!meta.userId && ctx.userId) meta.userId = ctx.userId;
  if (!meta.command && ctx.command) meta.command = ctx.command;
  if (!meta.interactionId && ctx.interactionId) meta.interactionId = ctx.interactionId;
  return meta;
}

function stringifyMeta(meta) {
  const keys = Object.keys(meta);
  if (keys.length === 0) return "";
  const json = JSON.stringify(meta, (_key, value) =>
    value instanceof Error ? { message: value.message, stack: value.stack } : value
  );
  return ` ${json}`;
}

function write(level, feature, message, meta, extraArgs) {
  if (LEVELS[level] > currentLevel) return;
  attachTraceContext(meta);
  const tag = feature ? ` [${feature}]` : "";
  const prefix = `[${timestamp()}] [${SERVICE}] [${level.toUpperCase()}]${tag}`;
  const out = level === "error" || level === "warn" ? console.error : console.log;
  out(`${prefix} ${message}${stringifyMeta(meta)}`, ...extraArgs);
}

function normalizeArgs(message, metaOrError, extra) {
  let meta = {};
  const extraArgs = [...extra];
  if (metaOrError instanceof Error) {
    extraArgs.unshift(metaOrError.stack || metaOrError.message);
    meta = { error: metaOrError.message };
    if (metaOrError.code) meta.errorCode = String(metaOrError.code);
  } else if (metaOrError && typeof metaOrError === "object") {
    meta = { ...metaOrError };
  } else if (metaOrError !== undefined) {
    extraArgs.unshift(metaOrError);
  }
  return { meta, extraArgs };
}

function makeLogger(feature) {
  const make = (level) => (message, metaOrError, ...extra) => {
    const { meta, extraArgs } = normalizeArgs(message, metaOrError, extra);
    if (feature && !meta.feature) meta.feature = feature;
    write(level, feature, message, meta, extraArgs);
  };
  const callable = make("info");
  callable.error = make("error");
  callable.warn = make("warn");
  callable.info = make("info");
  callable.debug = make("debug");
  callable.level = rawLevel in LEVELS ? rawLevel : "info";
  return callable;
}

const log = makeLogger(null);

/** Child logger that tags every line with [feature] and meta.feature. */
function logFor(feature) {
  return makeLogger(feature);
}

if (!(rawLevel in LEVELS)) {
  log.warn(`unknown LOG_LEVEL="${rawLevel}", falling back to "info"`);
}

module.exports = {
  log,
  logFor,
  createTraceId,
  createInteractionTraceContext,
  createEventTraceContext,
  runWithTraceContext,
  getTraceContext,
};
