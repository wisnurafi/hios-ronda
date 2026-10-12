/**
 * Shared channel resolver — one implementation for every feature that
 * posts to a configured channel (streamwatch notifications, honeypot
 * logs, voice-stats announcements).
 *
 * Before this, each feature had its own copy of the same shape: take a
 * channel ID, resolve it to a usable text channel, return null (never
 * throw) when the ID is unset, the channel is gone/inaccessible, or it
 * isn't text-based. Callers stay silent on null, exactly like before.
 */

async function resolveTextChannel(guild, channelId) {
  if (!channelId || !guild) return null;
  try {
    const ch =
      guild.channels.cache.get(channelId) ??
      (await guild.channels.fetch(channelId).catch(() => null));
    return ch?.isTextBased() ? ch : null;
  } catch {
    return null;
  }
}

module.exports = { resolveTextChannel };
