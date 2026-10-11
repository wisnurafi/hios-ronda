/**
 * Khodam game panel — the single public message in the game channel.
 *
 * One embed (title + how-to-play + legend image + mascot thumbnail) and
 * 4 ICON-ONLY buttons. Posted/refreshed in place; the dashboard can also
 * create a locked #khodam channel (only the bot can send there) so public
 * results never get buried under chatter.
 */

const path = require("path");
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  ChannelType,
  PermissionFlagsBits,
} = require("discord.js");
const { log } = require("../../log");
const { getConfig, updateConfig } = require("./store");
const { emojiMention } = require("./emojis");
const { ROLLS_PER_DAY } = require("./util");

const ASSETS = path.join(__dirname, "assets");
const KHODAM_CHANNEL_NAME = "khodam";

// All buttons share the Secondary (gray) style — clean uniform look,
// and the full-color icons stay readable on it.
const PANEL_BUTTONS = [
  { key: "roll", customId: "hios_kh_roll", style: ButtonStyle.Secondary },
  { key: "collection", customId: "hios_kh_collection", style: ButtonStyle.Secondary },
  { key: "duel", customId: "hios_kh_duel", style: ButtonStyle.Secondary },
  { key: "leaderboard", customId: "hios_kh_board", style: ButtonStyle.Secondary },
];

function buildPanelPayload(emojis) {
  const embed = new EmbedBuilder()
    .setTitle("👹 Cek Khodam")
    .setDescription(
      "Setiap orang punya khodam penunggu. Cek khodam lu, kumpulin, dan adu lawan khodam orang lain!\n\n" +
        `**${ROLLS_PER_DAY}x cek per hari** — 1 cek gratis + 3 reroll, reset tiap jam 00:00 WIB.\n` +
        "Koleksi maksimal **10 khodam**. Di duel, khodam **terkuat** lu yang maju otomatis."
    )
    .setColor(0x9b59b6)
    .setThumbnail("attachment://mascot.png")
    .setImage("attachment://legend.png")
    .setFooter({ text: "Tombol di bawah ini buat semua orang — nggak perlu command" });

  const row = new ActionRowBuilder();
  for (const b of PANEL_BUTTONS) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(b.customId)
        .setEmoji(emojiMention(emojis, b.key))
        .setStyle(b.style)
    );
  }

  const files = [
    new AttachmentBuilder(path.join(ASSETS, "legend.png"), { name: "legend.png" }),
    new AttachmentBuilder(path.join(ASSETS, "mascot.png"), { name: "mascot.png" }),
  ];
  return { embeds: [embed], components: [row], files };
}

/** Fetch the live panel message, or null when it's gone/unset. */
async function fetchPanelMessage(guild, cfg) {
  try {
    if (!cfg.channelId || !cfg.messageId) return null;
    const channel = await guild.channels.fetch(cfg.channelId).catch(() => null);
    if (!channel?.isTextBased()) return null;
    const msg = await channel.messages.fetch(cfg.messageId).catch(() => null);
    if (!msg || msg.author.id !== guild.members.me.id) return null;
    return msg;
  } catch {
    return null;
  }
}

/**
 * Post the panel (or edit it in place when it already exists).
 * Returns the message, or throws with a human-readable message.
 */
async function postOrRefreshPanel(guild, emojis) {
  const cfg = getConfig(guild.id);
  if (!cfg.channelId) throw new Error("Channel belum diatur — set dulu di dashboard.");
  const channel = await guild.channels.fetch(cfg.channelId).catch(() => null);
  if (!channel?.isTextBased()) throw new Error("Channel game tidak ketemu.");

  const me = guild.members.me;
  const canSend =
    channel.permissionsFor(me)?.has(PermissionFlagsBits.SendMessages) &&
    channel.permissionsFor(me)?.has(PermissionFlagsBits.EmbedLinks) &&
    channel.permissionsFor(me)?.has(PermissionFlagsBits.AttachFiles);
  if (!canSend) throw new Error("Bot nggak punya izin kirim pesan/embed/file di channel itu.");

  const payload = buildPanelPayload(emojis);
  const existing = await fetchPanelMessage(guild, cfg);
  let msg;
  if (existing) {
    msg = await existing.edit(payload);
  } else {
    msg = await channel.send(payload);
  }
  // channelId is unchanged here (we fetched the channel by the stored id),
  // so only the message id needs updating.
  updateConfig(guild.id, { messageId: msg.id });
  return msg;
}

/**
 * Create a locked #khodam text channel: @everyone cannot send, so game
 * results never get buried. Only the bot posts there.
 */
async function createKhodamChannel(guild) {
  const me = guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageChannels)) {
    throw new Error("Bot butuh izin Manage Channels buat bikin channel.");
  }
  const channel = await guild.channels.create({
    name: KHODAM_CHANNEL_NAME,
    type: ChannelType.GuildText,
    topic: "👹 Arena Cek Khodam — cuma bot yang bisa kirim pesan di sini.",
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions],
      },
    ],
    reason: "hios-ronda khodam game channel",
  });
  return channel;
}

/**
 * Delete the current panel message (best effort) and post a fresh one at
 * the bottom of the channel, so the panel is always the latest message
 * even as public game results pile up above it.
 */
async function repostPanel(guild, emojis) {
  const cfg = getConfig(guild.id);
  if (cfg.channelId && cfg.messageId) {
    try {
      const channel = await guild.channels.fetch(cfg.channelId).catch(() => null);
      const msg = channel?.isTextBased()
        ? await channel.messages.fetch(cfg.messageId).catch(() => null)
        : null;
      // Only delete our own panel — never touch anything else.
      if (msg && msg.author.id === guild.members.me.id) {
        await msg.delete().catch(() => {});
      }
    } catch {}
    updateConfig(guild.id, { messageId: null });
  }
  await postOrRefreshPanel(guild, emojis);
}

// Per-guild promise chain: concurrent game results must not each post
// their own panel (double-post race).
const bumpQueues = new Map();

/**
 * Queue a panel bump for this guild. Fire-and-forget safe: never throws,
 * never blocks the game interaction that triggered it.
 */
function bumpPanelToBottom(guild, emojis) {
  const prev = bumpQueues.get(guild.id) || Promise.resolve();
  const next = prev
    .catch(() => {})
    .then(() => repostPanel(guild, emojis))
    .catch((err) => log.warn("khodam panel bump failed:", err.message));
  bumpQueues.set(guild.id, next);
  next.finally(() => {
    if (bumpQueues.get(guild.id) === next) bumpQueues.delete(guild.id);
  });
  return next;
}

module.exports = {
  buildPanelPayload,
  fetchPanelMessage,
  postOrRefreshPanel,
  repostPanel,
  bumpPanelToBottom,
  createKhodamChannel,
  PANEL_BUTTONS,
};
