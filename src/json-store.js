/**
 * Tiny JSON store factory — one implementation for every feature's
 * per-guild config file.
 *
 * Before this, each feature had its own copy of the load/save/getConfig/
 * updateConfig dance (~50 lines x 7 files). Features with genuinely
 * different semantics (control's normalization, streamwatch's and
 * voice-stats' default-merging) keep their own accessors but reuse
 * load()/save() from here.
 *
 * Usage:
 *   const { createStore } = require("../../json-store");
 *   const { getConfig, updateConfig } = createStore({
 *     file: "verify.json",          // under <repo>/data/
 *     defaults: () => ({...}),      // fresh default config for a new guild
 *     name: "verify",               // used in log messages
 *   });
 *
 * Config is keyed by guild id, cached in memory, fail-open: a missing or
 * corrupt file just means "no config yet", never a crash.
 */

const fs = require("fs");
const path = require("path");
const { log } = require("./log");

const DATA_DIR = path.join(__dirname, "..", "data");

function createStore({ file, defaults = () => ({}), name = "store" }) {
  const DATA_FILE = path.join(DATA_DIR, file);
  let cache = null;

  function load() {
    if (cache) return cache;
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      cache = fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) : {};
    } catch (err) {
      log.warn(`${name} store load failed:`, err.message);
      cache = {};
    }
    return cache;
  }

  function save() {
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(DATA_FILE, JSON.stringify(cache, null, 2));
    } catch (err) {
      log.warn(`${name} store save failed:`, err.message);
    }
  }

  /** Get (and create if missing) the config for a guild. Returns the live ref. */
  function getConfig(guildId) {
    const all = load();
    if (!all[guildId]) {
      all[guildId] = defaults();
      save();
    }
    return all[guildId];
  }

  /** Shallow-merge a patch into the guild's config and persist. */
  function updateConfig(guildId, patch) {
    const cfg = getConfig(guildId);
    Object.assign(cfg, patch);
    save();
    return cfg;
  }

  return { load, save, getConfig, updateConfig };
}

module.exports = { createStore };
