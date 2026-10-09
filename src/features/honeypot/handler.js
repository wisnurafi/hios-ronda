const { log } = require("../../log");
const { getConfig, updateConfig } = require("./store");
const { refreshCounter } = require("./setup");
const { getLogsWebhook } = require("./webhook");
const { emojiMention } = require("./emojis");

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

/** Send a log line as "HIOS | Honeypot" (webhook), falling back to the bot. */
async function deliverLog(guild, cfg, hook, options) {
  if (hook) {
    try {
      await hook.send(options);
      return;
    } catch (err) {
      log(`webhook send failed: ${err.message}`);
    }
  }
  const ch = await getLogsChannel(guild, cfg);
  if (ch) await ch.send(options).catch(() => {});
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

async function applyPunishment(guild, member, userId, cfg, warnIcon) {
  const me = guild.members.me;
  const verbs = ACTION_VERBS[cfg.action] || ACTION_VERBS.ban;
  const reason = `hios-ronda honeypot: sent a message in #${guild.channels.cache.get(cfg.honeypotChannelId)?.name ?? "honeypot"}`;

  // Server owner can never be punished by a bot.
  if (userId === guild.ownerId) {
    return {
      ok: false,
      warning:
        `${warnIcon} User <@${userId}> triggered the honeypot, but they are the server owner so I cannot ${verbs.present} them. ` +
        `In anycase ensure my role is higher than people's highest role and that I have ban members permission so I can ${verbs.present} for actual cases.`,
    };
  }

  // Role hierarchy: bot must outrank the target.
  if (member && me.roles.highest.comparePositionTo(member.roles.highest) <= 0) {
    return {
      ok: false,
      warning:
        `${warnIcon} User <@${userId}> triggered the honeypot, but my highest role is not above theirs so I cannot ${verbs.present} them. ` +
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
        `${warnIcon} User <@${userId}> triggered the honeypot, but I failed to ${verbs.present} them (${err.message}). ` +
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
    // Exempt users skip punishment, but their message is still deleted
    // and logged (like the reference honeypot bot).
    const exempt = member ? isExempt(member, cfg) : false;

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
    const E = {
      warn: emojiMention(cfg.emojis, "warn"),
      info: emojiMention(cfg.emojis, "info"),
      honey: emojiMention(cfg.emojis, "honey"),
    };

    // Native forward FIRST (snapshot needs the original message),
    // as "HIOS | Honeypot" via webhook. Then delete.
    // Plain-text quote fallback only if the forward fails — no embeds.
    const hook = await getLogsWebhook(guild, cfg);
    let forwarded = false;
    if (hook) {
      try {
        await hook.send({
          forward: { message: message.id, channel: message.channelId, guild: guild.id },
        });
        forwarded = true;
      } catch (err) {
        log(`native forward failed, using quote fallback: ${err.message}`);
      }
    }
    if (!forwarded) {
      const plainQuote =
        content.length > 1500 ? content.slice(0, 1500) + "…" : content;
      await deliverLog(guild, cfg, hook, {
        content: `Forwarded message:\n> ${plainQuote.replace(/\n/g, "\n> ")}`,
      });
    }

    await message.delete().catch(() => {});

    // Exempt: delete + log, no punishment, no counter.
    if (exempt) {
      log(`exempt user ${member.displayName} typed in honeypot — deleted, no punishment`);
      await deliverLog(
        guild,
        cfg,
        hook,
        `${E.info} Exempt user <@${userId}> sent a message in the honeypot. Message deleted, no punishment applied (exempt).`
      );
      return;
    }

    let result;
    if (wasRecentlyPunished(userId)) {
      result = { ok: true, verbs: ACTION_VERBS[cfg.action] || ACTION_VERBS.ban, repeated: true };
    } else {
      result = await applyPunishment(guild, member, userId, cfg, E.warn);
    }

    const newCfg = updateConfig(guild.id, { catches: cfg.catches + 1 });
    await refreshCounter(guild, newCfg);

    let line;
    if (result.ok && !result.repeated) {
      line = `${E.warn} User <@${userId}> triggered the honeypot and was **${result.verbs.past}**. ${E.honey}`;
    } else if (result.ok) {
      line = `${E.warn} User <@${userId}> triggered the honeypot again (already punished). ${E.honey}`;
    } else {
      line = result.warning;
    }

    await deliverLog(guild, cfg, hook, line);
    log(`honeypot catch: ${userId} (${result.ok ? result.verbs?.past ?? "re-punished" : "not punished"})`);
  } catch (err) {
    log("honeypot handler error:", err.message);
  }
}

module.exports = { handleHoneypotMessage };
