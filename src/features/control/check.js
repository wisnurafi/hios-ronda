/**
 * Control lockdown check — pure function, ported 1:1 from hios-bot's
 * src/utils/controlLockdown.js (checkControlLockdown).
 *
 * Returns null when the invocation is allowed, otherwise
 * `{ reason: 'channel' | 'user', message }` with a user-facing message.
 *
 * Rules (identical to hios-bot):
 * - Bot owner bypasses everything.
 * - Excepted commands bypass the lockdown entirely.
 * - Non-empty channel allowlist: command must run in an allowed channel
 *   (or a thread under one — parentId counts).
 * - Non-empty user allowlist: only listed users may run commands.
 * - Empty lists = no restriction.
 */

const { normalizeLockdown } = require("./store");

function checkControlLockdown(
  lockdown,
  { commandName, userId, channelId, parentChannelId = null, isOwner = false }
) {
  const cfg = normalizeLockdown(lockdown);

  if (isOwner) {
    return null;
  }
  if (commandName && cfg.except.includes(commandName)) {
    return null;
  }

  if (cfg.channels.length > 0) {
    const inAllowedChannel =
      cfg.channels.includes(channelId) ||
      (parentChannelId != null && cfg.channels.includes(parentChannelId));
    if (!inAllowedChannel) {
      return {
        reason: "channel",
        message: `This bot can only be controlled in ${cfg.channels
          .map((id) => `<#${id}>`)
          .join(" ")}.`,
      };
    }
  }

  if (cfg.users.length > 0 && !cfg.users.includes(userId)) {
    return {
      reason: "user",
      message: "You are not on the list of people allowed to control this bot.",
    };
  }

  return null;
}

module.exports = { checkControlLockdown };
