/**
 * Control lockdown store — JSON file, keyed by guild id.
 *
 * Same shape as hios-bot's `guild:<id>:control` key:
 *   { channels: [id], users: [id], except: [commandName] }
 * Empty lists = no restriction (default, backward compatible).
 *
 * Note: on ephemeral disk (free hosting) a wipe resets the config to
 * "no restriction". Like hios-bot's DB-timeout path, we fail OPEN — the
 * bot stays usable rather than locking everyone out.
 */

const fs = require("fs");
const path = require("path");
const { log } = require("../../log");

const DATA_DIR = path.join(__dirname, "..", "..", "..", "data");
const DATA_FILE = path.join(DATA_DIR, "control.json");

function normalizeLockdown(raw) {
  const asIdList = (v) =>
    Array.isArray(v) ? [...new Set(v.map(String).filter(Boolean))] : [];
  return {
    channels: asIdList(raw?.channels),
    users: asIdList(raw?.users),
    except: asIdList(raw?.except),
  };
}

let cache = null;

function load() {
  if (cache) return cache;
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    cache = fs.existsSync(DATA_FILE)
      ? JSON.parse(fs.readFileSync(DATA_FILE, "utf8"))
      : {};
  } catch (err) {
    log.warn("control store load failed:", err.message);
    cache = {};
  }
  return cache;
}

function save() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(cache, null, 2));
  } catch (err) {
    log.warn("control store save failed:", err.message);
  }
}

/** Load the lockdown config for a guild (normalized; fail-open on error). */
function loadControlLockdown(guildId) {
  const all = load();
  return normalizeLockdown(all[guildId]);
}

function saveControlLockdown(guildId, lockdown) {
  const normalized = normalizeLockdown(lockdown);
  load()[guildId] = normalized;
  save();
  return normalized;
}

module.exports = { normalizeLockdown, loadControlLockdown, saveControlLockdown };
