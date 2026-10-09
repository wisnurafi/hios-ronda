const { ActivityType } = require("discord.js");

/**
 * Builds the bubble custom status activity (same style as hios-bot).
 * Used by the streamwatch presence writer below.
 */
function bubbleActivity(statusConfig) {
  if (statusConfig.type === ActivityType.Custom) {
    return { name: "Custom Status", state: statusConfig.text, type: ActivityType.Custom };
  }
  const activity = { name: statusConfig.text, type: statusConfig.type };
  // Streaming activities need a valid stream URL to render properly.
  if (statusConfig.type === ActivityType.Streaming && statusConfig.url) {
    activity.url = statusConfig.url;
  }
  return activity;
}

module.exports = { bubbleActivity };
