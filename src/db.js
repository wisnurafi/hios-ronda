/**
 * Shared Postgres (Neon) pool — ONE pool for the whole bot.
 *
 * Before this, every DB-backed feature created its own pg.Pool: 2x idle
 * connections, 2x reconnect loops, 2x copies of the Neon wake-up retry
 * logic. Now features register their schema and share the pool.
 *
 * Usage from a feature (see src/features/khodam/db.js):
 *   const db = require("../../db");
 *   db.registerSchema("khodam", SCHEMA);   // CREATE TABLE IF NOT EXISTS ...
 *   // query functions use db.getPool(), guarded by db.isEnabled()
 *
 * initDb() is idempotent — every feature's register() can call it safely.
 * If DATABASE_URL is unset or unreachable, the pool stays disabled and the
 * bot keeps running; DB-backed features degrade gracefully.
 */

const { Pool } = require("pg");
const { log } = require("./log");

let pool = null;
let enabled = false;
let initPromise = null;
let loopStarted = false;
const schemas = []; // [{ name, sql }]

/** Register a feature's schema. Must run before initDb() (module load is fine). */
function registerSchema(name, sql) {
  if (!schemas.some((s) => s.name === name)) schemas.push({ name, sql });
}

function isEnabled() {
  return enabled;
}

/** The shared pool. Only valid when isEnabled() is true. */
function getPool() {
  return pool;
}

/** Connect once + migrate all registered schemas. Idempotent, never throws. */
async function initDb() {
  if (enabled) return true;
  if (initPromise) return initPromise;
  initPromise = connect();
  const ok = await initPromise;
  initPromise = null;
  return ok;
}

async function connect() {
  const url = (process.env.DATABASE_URL || "").trim();
  const names = schemas.map((s) => s.name).join(", ") || "(none)";
  if (!url) {
    log.warn(`db: DATABASE_URL not set — database features disabled (${names})`);
    return false;
  }
  // Neon free tier suspends compute when idle — the first connection wakes
  // it up and can take 10-30s, so retry a few times before giving up.
  const attempts = 3;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    let candidate = null;
    try {
      candidate = new Pool({
        connectionString: url,
        max: 3, // tiny footprint for the free tier
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 30_000,
        ssl: { rejectUnauthorized: false }, // Neon requires SSL
      });
      candidate.on("error", (err) => log("db pool error:", err.message));
      await candidate.query("SELECT 1");
      for (const { name, sql } of schemas) {
        try {
          await candidate.query(sql);
        } catch (err) {
          log.warn(`db: schema "${name}" migration failed:`, err.message);
        }
      }
      pool = candidate;
      enabled = true;
      log(`db: connected, schemas ready (${names})`);
      return true;
    } catch (err) {
      log.warn(`db: connect attempt ${attempt}/${attempts} failed:`, err.message);
      try {
        await candidate?.end().catch(() => {});
      } catch {}
      if (attempt < attempts) await new Promise((r) => setTimeout(r, 5000));
    }
  }
  log.warn(`db: unavailable — database features disabled (${names})`);
  return false;
}

/**
 * Periodic re-attempt while disabled (e.g. Neon was still waking up at
 * startup). Idempotent — one loop for the whole bot. Cheap: runs at most
 * every 5 minutes, stops once connected.
 */
function startReconnectLoop() {
  if (loopStarted) return;
  loopStarted = true;
  const timer = setInterval(async () => {
    if (enabled) {
      clearInterval(timer);
      return;
    }
    if (!(process.env.DATABASE_URL || "").trim()) return;
    log("db: retrying connection...");
    await initDb();
  }, 5 * 60_000);
  timer.unref?.();
}

module.exports = { registerSchema, initDb, isEnabled, getPool, startReconnectLoop };
