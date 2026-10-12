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
 *
 * load/save come from src/json-store.js; the accessors stay custom
 * because lockdown entries are normalized on every read/write.
 */

const { createStore } = require("../../json-store");

const store = createStore({ file: "control.json", name: "control" });

function normalizeLockdown(raw) {
  const asIdList = (v) =>
    Array.isArray(v) ? [...new Set(v.map(String).filter(Boolean))] : [];
  return {
    channels: asIdList(raw?.channels),
    users: asIdList(raw?.users),
    except: asIdList(raw?.except),
  };
}

/** Load the lockdown config for a guild (normalized; fail-open on error). */
function loadControlLockdown(guildId) {
  return normalizeLockdown(store.load()[guildId]);
}

function saveControlLockdown(guildId, lockdown) {
  const normalized = normalizeLockdown(lockdown);
  store.load()[guildId] = normalized;
  store.save();
  return normalized;
}

module.exports = { normalizeLockdown, loadControlLockdown, saveControlLockdown };
