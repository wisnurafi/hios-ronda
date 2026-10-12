const { log } = require("../../log");
const { resolveTextChannel } = require("../../channels");
const { getWatchConfig, isNotifyEnabled } = require("./store");

/** Resolve the notify channel (null-safe via the shared helper). */
function getNotifyChannel(guild, notifyChannelId) {
  return resolveTextChannel(guild, notifyChannelId);
}

/** Per-guild dashboard setting wins, env NOTIFY_CHANNEL_ID is the fallback. */
function resolveNotifyChannelId(guild, config) {
  return getWatchConfig(guild.id).notifyChannelId || config.notifyChannelId;
}

/** Fill {mention} / {name} / {channel} placeholders in the message template. */
function renderMessage(template, member, voiceChannel) {
  return template
    .split("{mention}")
    .join(`<@${member.id}>`)
    .split("{name}")
    .join(member.displayName)
    .split("{channel}")
    .join(voiceChannel.name);
}

async function notifyLive(guild, member, voiceChannel, config) {
  if (!isNotifyEnabled(guild.id)) {
    log.debug(`streamwatch notify silenced in ${guild.name} (notify disabled)`);
    return; // silenced via /watch dashboard
  }
  const ch = await getNotifyChannel(guild, resolveNotifyChannelId(guild, config));
  if (!ch) {
    log.warn(`streamwatch: no notify channel in ${guild.name}, skipped live notify for ${member.displayName}`);
    return;
  }
  const t0 = Date.now();
  try {
    await ch.send({
      content: renderMessage(getWatchConfig(guild.id).notifyMessage, member, voiceChannel),
      allowedMentions: { parse: ["everyone", "users"] },
    });
    log.info("streamwatch live notify sent", {
      user: member.displayName,
      channel: voiceChannel.name,
      ms: Date.now() - t0,
    });
  } catch (err) {
    log.warn(`notify failed in ${guild.id}:`, err.message);
  }
}

async function notifyEnded(guild, member, config) {
  if (!isNotifyEnabled(guild.id)) return; // silenced via /watch dashboard
  const ch = await getNotifyChannel(guild, resolveNotifyChannelId(guild, config));
  if (!ch) return;
  const t0 = Date.now();
  try {
    await ch.send({ content: `⚫ **${member.displayName}** finished streaming.` });
    log.info("streamwatch ended notify sent", { user: member.displayName, ms: Date.now() - t0 });
  } catch (err) {
    log.warn(`notify failed in ${guild.id}:`, err.message);
  }
}

module.exports = { notifyLive, notifyEnded };
