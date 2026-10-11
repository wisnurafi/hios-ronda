/**
 * Small pure helpers for the khodam game: WIB date keys, power rating,
 * quota math, and the roll cooldown.
 */

const ROLLS_PER_DAY = 4; // 1 free cek + 3 reroll
const MAX_COLLECTION = 10;
const ROLL_COOLDOWN_MS = 3000;

/** "YYYY-MM-DD" in Asia/Jakarta (WIB, UTC+7), no cron needed. */
function wibToday(date = new Date()) {
  return new Date(date.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

/**
 * Power rating used to pick each duelist's strongest khodam.
 * Weights ATK highest (it decides damage), HP at half weight since its
 * raw scale dwarfs the other stats.
 */
function powerOf(k) {
  return k.atk * 2 + k.def + k.spd + k.hp * 0.5;
}

/** Strongest khodam from a list of { khodam_id } resolved via `resolve`. */
function strongestOf(entries, resolve) {
  let best = null;
  let bestPower = -Infinity;
  for (const e of entries) {
    const k = resolve(e.khodam_id);
    if (!k) continue;
    const p = powerOf(k);
    if (p > bestPower) {
      bestPower = p;
      best = k;
    }
  }
  return best;
}

function rollsRemaining(rollsUsed) {
  return Math.max(0, ROLLS_PER_DAY - rollsUsed);
}

function canRoll(rollsUsed) {
  return rollsUsed < ROLLS_PER_DAY;
}

function needsReplace(collectionCount) {
  return collectionCount >= MAX_COLLECTION;
}

/** In-memory per-user cooldown. Returns remaining ms (0 = clear). */
function checkCooldown(map, key, now = Date.now()) {
  if (!map.has(key)) {
    map.set(key, now);
    return 0;
  }
  const remaining = map.get(key) + ROLL_COOLDOWN_MS - now;
  if (remaining > 0) return remaining;
  map.set(key, now);
  return 0;
}

module.exports = {
  ROLLS_PER_DAY,
  MAX_COLLECTION,
  ROLL_COOLDOWN_MS,
  wibToday,
  powerOf,
  strongestOf,
  rollsRemaining,
  canRoll,
  needsReplace,
  checkCooldown,
};
