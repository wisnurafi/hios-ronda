require("dotenv").config();

function required(name) {
  const value = (process.env[name] || "").trim();
  if (!value) {
    console.error(`[ronda] missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
}

module.exports = {
  token: required("BOT_TOKEN"),
  notifyChannelId: (process.env.NOTIFY_CHANNEL_ID || "").trim() || null,
  leaveGraceMs: Math.max(0, Number(process.env.LEAVE_GRACE_MS || 5000) || 5000),
};
