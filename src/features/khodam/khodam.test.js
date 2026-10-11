/**
 * Unit tests for the khodam game (pure logic only — no Discord, no DB).
 * Run: node --test src/features/khodam/khodam.test.js
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");

const { TIERS, ROSTER, getKhodam, pickKhodam, tierOf } = require("./roster");
const { simulateDuel, rollDamage, MAX_ROUNDS } = require("./battle");
const {
  wibToday,
  powerOf,
  strongestOf,
  rollsRemaining,
  canRoll,
  needsReplace,
  checkCooldown,
  ROLLS_PER_DAY,
  MAX_COLLECTION,
  ROLL_COOLDOWN_MS,
} = require("./util");

// Deterministic RNG for tests.
function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TIER_RANGES = {
  common: { atk: [5, 12], def: [5, 12], hp: [30, 55], spd: [5, 12], count: 25 },
  rare: { atk: [11, 20], def: [11, 20], hp: [50, 75], spd: [11, 20], count: 14 },
  epic: { atk: [19, 30], def: [19, 30], hp: [70, 100], spd: [19, 30], count: 7 },
  legendary: { atk: [29, 42], def: [29, 42], hp: [95, 130], spd: [29, 42], count: 3 },
  mythic: { atk: [41, 60], def: [41, 60], hp: [125, 165], spd: [41, 60], count: 2 },
};

test("roster: 51 unique khodam, valid tiers, stats in range", () => {
  assert.equal(ROSTER.length, 51);
  const ids = new Set(ROSTER.map((k) => k.id));
  assert.equal(ids.size, 51, "duplicate khodam ids");
  const counts = {};
  for (const k of ROSTER) {
    assert.ok(TIERS[k.tier], `unknown tier ${k.tier}`);
    assert.ok(k.name && k.desc, `missing name/desc for ${k.id}`);
    const r = TIER_RANGES[k.tier];
    for (const stat of ["atk", "def", "hp", "spd"]) {
      assert.ok(
        k[stat] >= r[stat][0] && k[stat] <= r[stat][1],
        `${k.id}.${stat}=${k[stat]} out of ${k.tier} range`
      );
    }
    counts[k.tier] = (counts[k.tier] || 0) + 1;
  }
  for (const [tier, r] of Object.entries(TIER_RANGES)) {
    assert.equal(counts[tier], r.count, `tier ${tier} count`);
  }
  const totalChance = Object.values(TIERS).reduce((s, t) => s + t.chance, 0);
  assert.ok(Math.abs(totalChance - 1) < 1e-9, "tier chances must sum to 1");
});

test("pickKhodam: weighted distribution matches tier chances", () => {
  const rand = mulberry32(1234);
  const n = 20000;
  const counts = {};
  for (let i = 0; i < n; i++) {
    const k = pickKhodam(rand);
    counts[k.tier] = (counts[k.tier] || 0) + 1;
  }
  const tolerance = { common: 0.03, rare: 0.03, epic: 0.02, legendary: 0.015, mythic: 0.01 };
  for (const [tier, meta] of Object.entries(TIERS)) {
    const observed = (counts[tier] || 0) / n;
    assert.ok(
      Math.abs(observed - meta.chance) < tolerance[tier],
      `${tier}: observed ${observed.toFixed(3)}, expected ${meta.chance}`
    );
  }
});

test("pickKhodam: deterministic with seeded RNG", () => {
  const a = Array.from({ length: 20 }, () => pickKhodam(mulberry32(99)).id);
  const b = Array.from({ length: 20 }, () => pickKhodam(mulberry32(99)).id);
  assert.deepEqual(a, b);
});

test("getKhodam / tierOf", () => {
  const k = getKhodam("semar-multiverse");
  assert.equal(k.name, "Semar Multiverse");
  assert.equal(tierOf(k).label, "Mythic");
  assert.equal(getKhodam("nope"), null);
});

test("rollDamage: within [ATK*0.85 - DEF*0.6, ATK*1.15 - DEF*0.6], min 1", () => {
  const rand = mulberry32(7);
  for (let i = 0; i < 500; i++) {
    const atk = 5 + Math.floor(rand() * 55);
    const def = 5 + Math.floor(rand() * 55);
    const dmg = rollDamage(atk, def, rand);
    const lo = Math.max(1, Math.round(atk * 0.85 - def * 0.6));
    const hi = Math.max(1, Math.round(atk * 1.15 - def * 0.6));
    assert.ok(dmg >= lo && dmg <= hi, `dmg ${dmg} not in [${lo},${hi}]`);
    assert.ok(dmg >= 1);
  }
});

test("simulateDuel: deterministic with seeded RNG", () => {
  const a = getKhodam("buto-ijo-gym");
  const b = getKhodam("naga-komodo-santet");
  const r1 = simulateDuel(a, b, mulberry32(42));
  const r2 = simulateDuel(a, b, mulberry32(42));
  assert.deepEqual(r1, r2);
  assert.ok(["a", "b", "draw"].includes(r1.winner));
  assert.ok(r1.rounds >= 1 && r1.rounds <= MAX_ROUNDS);
});

test("simulateDuel: higher SPD attacks first; tie goes to A", () => {
  const fast = { atk: 30, def: 10, hp: 100, spd: 30 };
  const slow = { atk: 30, def: 10, hp: 100, spd: 10 };
  const r = simulateDuel(fast, slow, mulberry32(1));
  assert.equal(r.log[0].attacker, "a");
  const r2 = simulateDuel(slow, fast, mulberry32(1));
  assert.equal(r2.log[0].attacker, "b");
  const tie = simulateDuel({ ...fast, spd: 20 }, { ...slow, spd: 20 }, mulberry32(1));
  assert.equal(tie.log[0].attacker, "a");
});

test("simulateDuel: 20-round cap forces a draw (tanks)", () => {
  const tank = { atk: 5, def: 60, hp: 165, spd: 10 };
  const r = simulateDuel(tank, { ...tank }, mulberry32(5));
  assert.equal(r.winner, "draw");
  assert.equal(r.rounds, MAX_ROUNDS);
});

test("simulateDuel: mythic beats common almost surely", () => {
  const mythic = getKhodam("batara-kala-prime");
  const common = getKhodam("pocong-gabut");
  let wins = 0;
  for (let i = 0; i < 50; i++) {
    const r = simulateDuel(mythic, common, mulberry32(1000 + i));
    if (r.winner === "a") wins++;
  }
  assert.ok(wins >= 45, `mythic only won ${wins}/50 vs common`);
});

test("wibToday: UTC+7 date key", () => {
  // 2026-10-10 16:00 UTC = 2026-10-10 23:00 WIB
  assert.equal(wibToday(new Date(Date.UTC(2026, 9, 10, 16, 0, 0))), "2026-10-10");
  // 2026-10-10 17:00 UTC = 2026-10-11 00:00 WIB (rolls over)
  assert.equal(wibToday(new Date(Date.UTC(2026, 9, 10, 17, 0, 0))), "2026-10-11");
  assert.match(wibToday(), /^\d{4}-\d{2}-\d{2}$/);
});

test("quota: 4 rolls/day", () => {
  assert.equal(ROLLS_PER_DAY, 4);
  assert.ok(canRoll(0) && canRoll(3));
  assert.ok(!canRoll(4) && !canRoll(99));
  assert.equal(rollsRemaining(1), 3);
  assert.equal(rollsRemaining(4), 0);
});

test("collection: replace needed at 10", () => {
  assert.equal(MAX_COLLECTION, 10);
  assert.ok(!needsReplace(9));
  assert.ok(needsReplace(10));
  assert.ok(needsReplace(11));
});

test("strongestOf: picks highest power khodam", () => {
  const entries = [{ khodam_id: "pocong-gabut" }, { khodam_id: "semar-multiverse" }, { khodam_id: "tuyul-wifi" }];
  const best = strongestOf(entries, getKhodam);
  assert.equal(best.id, "semar-multiverse");
  assert.equal(strongestOf([], getKhodam), null);
  assert.equal(strongestOf([{ khodam_id: "ghost" }], getKhodam), null);
});

test("powerOf: ATK-weighted ordering", () => {
  const a = getKhodam("batara-kala-prime");
  const b = getKhodam("pocong-gabut");
  assert.ok(powerOf(a) > powerOf(b));
});

test("checkCooldown: 3s per user", () => {
  const map = new Map();
  assert.equal(checkCooldown(map, "u1", 1000), 0);
  const rem = checkCooldown(map, "u1", 1500);
  assert.ok(rem > 0 && rem <= ROLL_COOLDOWN_MS);
  assert.equal(checkCooldown(map, "u1", 1000 + ROLL_COOLDOWN_MS), 0);
  assert.equal(checkCooldown(map, "u2", 1500), 0, "cooldown is per-user");
});
