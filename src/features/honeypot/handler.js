const { EmbedBuilder } = require("discord.js");
const { log } = require("../../log");
const { getConfig, updateConfig } = require("./store");
const { refreshCounter } = require("./setup");

// userId -> timestamp of last punishment (anti double-punish on spam waves)
const recentPunishments = new Map();

const ACTION_VERBS = {
  ban: { present: "ban", past: "banned" },
  kick: { present: "kick", past: "kicked" },
  timeout: { present: "timeout", past: "timed out" },
};

function wasRecentlyPunished(userId) {
  const ts = recentPunishments.get(userId);
  if (ts && Date.now() - ts < 60_000) return true;
  recentPunishments.set(userId, Date.now());
  return false;
}

function isExempt(member, cfg) {
  if (cfg.exemptUsers.includes(member.id)) return true;
  return member.roles.cache.some((r) => cfg.exemptRoles.includes(r.id));
}

async function getLogsChannel(guild, cfg) {
  if (!cfg.logsChannelId) return null;
  try {
    const ch = await guild.channels.fetch(cfg.logsChannelId);
    return ch?.isTextBased() ? ch : null;
  } catch {
    return null;
  }
}

function quotedContent(message) {
  const text = (message.content || "").trim();
  if (text) return text.length > 1500 ? text.slice(0, 1500) + "…" : text;
  if (message.attachments.size > 0) return `*${message.attachments.size} attachment(s), no text*`;
  if (message.embeds.length > 0) return "*embed, no text*";
  return "*no text content*";
}

async function applyPunishment(guild, member, userId, cfg) {
  const me = guild.members.me;
  const verbs = ACTION_VERBS[cfg.action] || ACTION_VERBS.ban;
  const reason = `hios-ronda honeypot: sent a message in #${guild.channels.cache.get(cfg.honeypotChannelId)?.name ?? "honeypot"}`;

  // Server owner can never be punished by a bot.
  if (userId === guild.ownerId) {
    return {
      ok: false,
      warning:
        `⚠️ User <@${userId}> triggered the honeypot, but they are the server owner so I cannot ${verbs.present} them. ` +
        `In anycase ensure my role is higher than people's highest role and that I have ban members permission so I can ${verbs.present} for actual cases.`,
    };
  }

  // Role hierarchy: bot must outrank the target.
  if (member && me.roles.highest.comparePositionTo(member.roles.highest) <= 0) {
    return {
      ok: false,
      warning:
        `⚠️ User <@${userId}> triggered the honeypot, but my highest role is not above theirs so I cannot ${verbs.present} them. ` +
        `In anycase ensure my role is higher than people's highest role and that I have ban members permission so I can ${verbs.present} for actual cases.`,
    };
  }

  try {
    if (cfg.action === "kick") {
      if (!member) throw new Error("member not found");
      await member.kick(reason);
    } else if (cfg.action === "timeout") {
      if (!member) throw new Error("member not found");
      const ms = Math.min(Math.max(cfg.timeoutMinutes, 1), 40320) * 60_000;
      await member.timeout(ms, reason);
    } else {
      await guild.members.ban(userId, { deleteMessageSeconds: 86400, reason });
    }
    return { ok: true, verbs };
  } catch (err) {
    log(`punishment failed for ${userId}: ${err.message}`);
    return {
      ok: false,
      warning:
        `⚠️ User <@${userId}> triggered the honeypot, but I failed to ${verbs.present} them (${err.message}). ` +
        `In anycase ensure my role is higher than people's highest role and that I have ban members permission so I can ${verbs.present} for actual cases.`,
    };
  }
}

/**
 * messageCreate handler — the actual trap.
 */
async function handleHoneypotMessage(message) {
  try {
    if (!message.guild) return;
    // Ignore our own messages. Other bots are NOT exempt —
    // spam often comes from bot accounts.
    if (message.author.id === message.client.user.id) return;

    const guild = message.guild;
    const cfg = getConfig(guild.id);
    if (!cfg.enabled || !cfg.honeypotChannelId) return;
    if (message.channelId !== cfg.honeypotChannelId) return;

    const member = await guild.members.fetch(message.author.id).catch(() => null);
    if (member && isExempt(member, cfg)) {
      log(`exempt user ${member.displayName} typed in honeypot, ignored`);
      return;
    }

    // Webhook spam: try to nuke the webhook too.
    if (message.webhookId) {
      try {
        const webhooks = await message.channel.fetchWebhooks();
        const hook = webhooks.get(message.webhookId);
        if (hook) await hook.delete("hios-ronda honeypot: spam webhook");
        log(`deleted spam webhook ${message.webhookId}`);
      } catch (err) {
        log(`webhook delete failed: ${err.message}`);
      }
    }

    await message.delete().catch(() => {});

    const userId = message.author.id;
    const content = quotedContent(message);
    let result;
    if (wasRecentlyPunished(userId)) {
      result = { ok: true, verbs: ACTION_VERBS[cfg.action] || ACTION_VERBS.ban, repeated: true };
    } else {
      result = await applyPunishment(guild, member, userId, cfg);
    }

    const newCfg = updateConfig(guild.id, { catches: cfg.catches + 1 });
    await refreshCounter(guild, newCfg);

    const logsChannel = await getLogsChannel(guild, newCfg);
    if (!logsChannel) {
      log("no logs channel configured, catch not logged to Discord");
      return;
    }

    const quote = new EmbedBuilder()
      .setAuthor({ name: `${message.author.tag} (${userId})` })
      .setDescription(`> ${content.replace(/\n/g, "\n> ")}`)
      .setFooter({ text: `#${message.channel.name} • ${new Date().toLocaleDateString("en-US")}` })
      .setTimestamp();

    let line;
    if (result.ok && !result.repeated) {
      line = `⚠️ User <@${userId}> triggered the honeypot and was **${result.verbs.past}**. 🍯`;
    } else if (result.ok) {
      line = `⚠️ User <@${userId}> triggered the honeypot again (already punished). 🍯`;
    } else {
      line = result.warning;
    }

    await logsChannel.send({ content: `↩️ Forwarded message:`, embeds: [quote] });
    await logsChannel.send(line);
    log(`honeypot catch: ${userId} (${result.ok ? result.verbs?.past ?? "re-punished" : "not punished"})`);
  } catch (err) {
    log("honeypot handler error:", err.message);
  }
}

module.exports = { handleHoneypotMessage };
