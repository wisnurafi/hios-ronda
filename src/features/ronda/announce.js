/**
 * Builds and sends the weekly announcements:
 *  - 🌙 Night Owls leaderboard (top 5 by night minutes)
 *  - 📋 Weekly Patrol Report (server voice aggregates)
 *
 * All user-facing text is English. The plain-text message above each embed
 * comes from the per-guild dashboard template (with {placeholders}).
 */

const { EmbedBuilder, ChannelType } = require("discord.js");
const { log } = require("../../log");
const { isEnabled, topNightOwls, weekRows, pruneOldWeeks } = require("./db");
const { getGuildConfig, updateFeatureConfig } = require("./store");
const { weekStartWeeksAgo, weekLabel, formatDuration, wibParts } = require("./time");

const MEDALS = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"];
// The scheduler ticks every 5 minutes; a feature is due when its configured
// day/hour matches and the minute falls inside one tick window.
const CHECK_MINUTES = 5;
// Guard against firing twice if the bot restarts inside the same window.
const DEDUP_MS = 30 * 60_000;

/**
 * True when `cfg` (a per-guild feature config) should announce now.
 * `now` is injectable for tests.
 */
function isDue(cfg, now = Date.now()) {
  if (!cfg || cfg.enabled === false) return false;
  const s = cfg.schedule || { day: 1, hour: 9, minute: 0 };
  const { day, hour, minute } = wibParts(now);
  if (day !== s.day || hour !== s.hour) return false;
  if (minute < s.minute || minute >= s.minute + CHECK_MINUTES) return false;
  if (cfg.lastAnnouncedAt && now - cfg.lastAnnouncedAt < DEDUP_MS) return false;
  return true;
}

function renderTemplate(template, vars) {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{${k}}`).join(v);
  }
  return out;
}

/** Resolve the announce channel: dashboard pick -> NOTIFY_CHANNEL_ID env -> system/first text channel. */
async function resolveChannel(guild, channelId) {
  if (channelId) {
    const c = guild.channels.cache.get(channelId);
    if (c?.isTextBased()) return c;
  }
  const envId = (process.env.NOTIFY_CHANNEL_ID || "").trim();
  if (envId) {
    const c = guild.channels.cache.get(envId);
    if (c?.isTextBased()) return c;
  }
  if (guild.systemChannel?.isTextBased()) return guild.systemChannel;
  return (
    guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildText && c.permissionsFor(guild.members.me)?.has("SendMessages")
    ) || null
  );
}

function displayName(guild, userId) {
  const m = guild.members.cache.get(userId);
  return m ? m.displayName : `User ${userId}`;
}

/** Embed for the night-owl leaderboard. `rows`: [{ user_id, night_minutes }]. */
function buildBegadangEmbed(guild, weekStart, rows) {
  const lines = rows.map((r, i) => {
    const medal = MEDALS[i] || `${i + 1}.`;
    return `${medal} **${displayName(guild, r.user_id)}** — ${formatDuration(r.night_minutes)} after midnight`;
  });
  return new EmbedBuilder()
    .setTitle("🌙 Night Owls Leaderboard")
    .setDescription(
      `Week of **${weekLabel(weekStart)}**\n\n` +
        (lines.length > 0 ? lines.join("\n") : "_No night activity recorded this week._")
    )
    .setColor(0x1a1a2e)
    .setFooter({ text: "Night patrol • night = 00:00–05:00 WIB" })
    .setTimestamp();
}

/** Embed for the weekly patrol report. */
function buildRapotEmbed(guild, weekStart, rows) {
  let totalMinutes = 0;
  let mostActive = null;
  let longest = null;
  const channelMinutes = {};
  for (const r of rows) {
    totalMinutes += r.total_minutes;
    if (!mostActive || r.total_minutes > mostActive.total_minutes) mostActive = r;
    if (!longest || r.longest_session_minutes > longest.longest_session_minutes) longest = r;
    const ch = r.channels || {};
    for (const [cid, mins] of Object.entries(ch)) {
      channelMinutes[cid] = (channelMinutes[cid] || 0) + mins;
    }
  }
  const favChannelId = Object.entries(channelMinutes).sort((a, b) => b[1] - a[1])[0]?.[0];
  const favChannel = favChannelId ? `<#${favChannelId}>` : "—";
  const nightTop = [...rows].sort((a, b) => b.night_minutes - a.night_minutes)[0];

  const fields = [
    {
      name: "🎙️ Total voice time",
      value: rows.length > 0 ? `**${formatDuration(totalMinutes)}** across ${rows.length} member(s)` : "—",
      inline: true,
    },
    {
      name: "🔥 Most active",
      value: mostActive ? `<@${mostActive.user_id}> (${formatDuration(mostActive.total_minutes)})` : "—",
      inline: true,
    },
    {
      name: "⏱️ Longest session",
      value: longest ? `<@${longest.user_id}> (${formatDuration(longest.longest_session_minutes)})` : "—",
      inline: true,
    },
    { name: "🏠 Favorite channel", value: favChannel, inline: true },
    {
      name: "🌙 Night owl #1",
      value:
        nightTop && nightTop.night_minutes > 0
          ? `<@${nightTop.user_id}> (${formatDuration(nightTop.night_minutes)} after midnight)`
          : "—",
      inline: true,
    },
  ];

  return new EmbedBuilder()
    .setTitle("📋 Weekly Patrol Report")
    .setDescription(`Week of **${weekLabel(weekStart)}**`)
    .setColor(0x2b6cb0)
    .addFields(fields)
    .setFooter({ text: "Night patrol • all times WIB" })
    .setTimestamp();
}

/** Template vars shared by both announcements. */
function commonVars(guild, weekStart, rows) {
  let mostActive = null;
  let longest = null;
  let totalMinutes = 0;
  const channelMinutes = {};
  for (const r of rows) {
    totalMinutes += r.total_minutes;
    if (!mostActive || r.total_minutes > mostActive.total_minutes) mostActive = r;
    if (!longest || r.longest_session_minutes > longest.longest_session_minutes) longest = r;
    for (const [cid, mins] of Object.entries(r.channels || {})) {
      channelMinutes[cid] = (channelMinutes[cid] || 0) + mins;
    }
  }
  const favChannelId = Object.entries(channelMinutes).sort((a, b) => b[1] - a[1])[0]?.[0];
  const nightTop = [...rows].sort((a, b) => b.night_minutes - a.night_minutes)[0];
  return {
    week: weekLabel(weekStart),
    total_hours: formatDuration(totalMinutes),
    most_active: mostActive ? `<@${mostActive.user_id}>` : "—",
    longest_session:
      longest != null ? `<@${longest.user_id}> (${formatDuration(longest.longest_session_minutes)})` : "—",
    favorite_channel: favChannelId ? `<#${favChannelId}>` : "—",
    night_owl: nightTop && nightTop.night_minutes > 0 ? `<@${nightTop.user_id}>` : "—",
    top1: nightTop && nightTop.night_minutes > 0 ? `<@${nightTop.user_id}>` : "—",
    top1_time: nightTop ? formatDuration(nightTop.night_minutes) : "—",
  };
}

/**
 * Send one feature's weekly announcement for a guild.
 * `feature`: "begadang" | "rapot". `weekStart`: the week being reported.
 */
async function announceFeature(client, guild, feature, weekStart) {
  const cfg = getGuildConfig(guild.id)[feature];
  if (!cfg || cfg.enabled === false) return;
  const channel = await resolveChannel(guild, cfg.channelId);
  if (!channel) {
    log(`ronda announce: no channel available in ${guild.name} (${feature})`);
    return;
  }
  const rows = feature === "begadang" ? await topNightOwls(guild.id, weekStart, 5) : await weekRows(guild.id, weekStart);
  const vars = commonVars(guild, weekStart, rows);
  const content = renderTemplate(cfg.message, vars);
  const embed =
    feature === "begadang" ? buildBegadangEmbed(guild, weekStart, rows) : buildRapotEmbed(guild, weekStart, rows);
  try {
    await channel.send({ content, embeds: [embed] });
    updateFeatureConfig(guild.id, feature, { lastAnnouncedAt: Date.now() });
    log(`ronda announce: ${feature} sent in ${guild.name} for week ${weekStart}`);
  } catch (err) {
    log(`ronda announce: send failed (${feature}):`, err.message);
  }
}

/**
 * Scheduler tick (every 5 min): announce for every guild whose per-guild
 * schedule is due, then prune old rows at most once a day.
 */
let lastPruneDay = null;
async function runDueAnnouncements(client) {
  if (!isEnabled()) return; // DB down: stay quiet, the reconnect loop handles it
  const now = Date.now();
  const lastWeek = weekStartWeeksAgo(now, 1);
  for (const [, guild] of client.guilds.cache) {
    const cfg = getGuildConfig(guild.id);
    for (const feature of ["begadang", "rapot"]) {
      try {
        if (isDue(cfg[feature], now)) {
          await announceFeature(client, guild, feature, lastWeek);
        }
      } catch (err) {
        log(`ronda announce: guild ${guild.id} (${feature}) failed:`, err.message);
      }
    }
  }
  const today = new Date(now + 7 * 3600 * 1000).toISOString().slice(0, 10); // WIB date
  if (today !== lastPruneDay) {
    lastPruneDay = today;
    try {
      await pruneOldWeeks();
    } catch (err) {
      log("ronda prune error:", err.message);
    }
  }
}

module.exports = {
  renderTemplate,
  isDue,
  buildBegadangEmbed,
  buildRapotEmbed,
  commonVars,
  announceFeature,
  runDueAnnouncements,
};
