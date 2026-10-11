/**
 * Duel simulator — pure turn-based battle, no Discord involved.
 *
 * Rules (from the final plan):
 * - Higher SPD attacks first, then they alternate.
 * - damage = max(1, ATK × (0.85–1.15) − DEF × 0.6), rounded.
 * - Max 20 rounds → draw ("keduanya kelelahan").
 *
 * `random` is injectable so tests can use a seeded RNG for determinism.
 */

const MAX_ROUNDS = 20;

function rollDamage(atk, def, random) {
  const variance = 0.85 + random() * 0.3; // 0.85 – 1.15
  return Math.max(1, Math.round(atk * variance - def * 0.6));
}

/**
 * @param {{atk,def,hp,spd}} a khodam A stats
 * @param {{atk,def,hp,spd}} b khodam B stats
 * @returns {{ winner: "a"|"b"|"draw", rounds: number, log: Array }}
 *   log entries: { round, attacker: "a"|"b", damage, hpA, hpB }
 */
function simulateDuel(a, b, random = Math.random) {
  let hpA = a.hp;
  let hpB = b.hp;
  const first = a.spd >= b.spd ? "a" : "b"; // tie → A strikes first
  const log = [];
  let rounds = 0;

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    rounds = round;
    const order = first === "a" ? ["a", "b"] : ["b", "a"];
    for (const side of order) {
      const attacker = side === "a" ? a : b;
      const defender = side === "a" ? b : a;
      const dmg = rollDamage(attacker.atk, defender.def, random);
      if (side === "a") hpB -= dmg;
      else hpA -= dmg;
      log.push({
        round,
        attacker: side,
        damage: dmg,
        hpA: Math.max(0, hpA),
        hpB: Math.max(0, hpB),
      });
      if (hpA <= 0 || hpB <= 0) break; // fallen fighter can't counter
    }
    if (hpA <= 0 || hpB <= 0) break;
  }

  let winner;
  if (hpA <= 0 && hpB <= 0) winner = "draw";
  else if (hpB <= 0) winner = "a";
  else if (hpA <= 0) winner = "b";
  else winner = "draw"; // survived all 20 rounds — both exhausted

  return { winner, rounds, log };
}

module.exports = { simulateDuel, rollDamage, MAX_ROUNDS };
