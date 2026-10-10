require("dotenv").config();

function required(name) {
  const value = (process.env[name] || "").trim();
  if (!value) {
    console.error(`[ronda] missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
}

const ACTIVITY_TYPES = {
  playing: 0,
  streaming: 1,
  listening: 2,
  watching: 3,
  custom: 4,
  competing: 5,
};

function parseActivityType(value, fallback) {
  if (value == null || String(value).trim() === "") return fallback;
  const n = Number(value);
  if (Number.isInteger(n) && n >= 0 && n <= 5) return n;
  const key = String(value).trim().toLowerCase();
  return ACTIVITY_TYPES[key] ?? fallback;
}

function parseStatusMode(value, fallback) {
  const v = String(value || "").trim().toLowerCase();
  return ["online", "idle", "dnd", "invisible"].includes(v) ? v : fallback;
}

module.exports = {
  token: required("BOT_TOKEN"),
  notifyChannelId: (process.env.NOTIFY_CHANNEL_ID || "").trim() || null,
  leaveGraceMs: Math.max(0, Number(process.env.LEAVE_GRACE_MS || 5000) || 5000),

  // Bot owner user IDs (comma-separated in OWNER_IDS env var).
  // Owners bypass the Administrator requirement on dashboards.
  owners: (process.env.OWNER_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean),

  status: {
    // Visible text. For type=custom this is the custom-status text
    // (like hios-bot's "thinking about you"); for other types it is
    // the activity name ("Playing <text>", "Watching <text>", ...).
    text: (process.env.STATUS_TEXT || "").trim() || "on patrol",
    // 0=Playing 1=Streaming 2=Listening 3=Watching 4=Custom 5=Competing
    // (number or name, e.g. STATUS_TYPE=watching)
    type: parseActivityType(process.env.STATUS_TYPE, 4),
    // Stream URL — only used when STATUS_TYPE=streaming (1).
    // Must be a valid Twitch/YouTube URL or Discord won't render it as "Streaming".
    url: (process.env.STATUS_URL || "").trim() || null,
    // online | idle | dnd | invisible
    mode: parseStatusMode(process.env.STATUS_MODE, "online"),
  },
};
