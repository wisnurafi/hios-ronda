const { ActivityType } = require("discord.js");
const { log } = require("../../log");

/**
 * Custom status feature (same style as hios-bot).
 *
 * Applied via discord.js setPresence — the library passes through
 * type/name/state/url, which is everything a custom status needs.
 * (Full rich presence with images/details needs raw opcode 3;
 * see docs/rich-presence.md for the discussion.)
 */
function applyCustomStatus(client, statusConfig) {
  if (!client.user) {
    log("cannot apply status: client not ready");
    return;
  }

  const activity =
    statusConfig.type === ActivityType.Custom
      ? { name: "Custom Status", state: statusConfig.text, type: ActivityType.Custom }
      : { name: statusConfig.text, type: statusConfig.type };

  // Streaming activities need a valid stream URL to render properly.
  if (statusConfig.type === ActivityType.Streaming && statusConfig.url) {
    activity.url = statusConfig.url;
  }

  client.user.setPresence({ status: statusConfig.mode, activities: [activity] });
  log(`status set: [${statusConfig.mode}] type=${statusConfig.type} "${statusConfig.text}"`);
}

module.exports = { applyCustomStatus };
