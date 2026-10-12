/**
 * Khodam game interactions — all component-based (no slash commands for
 * players). Panel buttons are structurally exempt from the control
 * lockdown (enforceControlLockdown early-returns for non-ChatInputCommand).
 *
 * - hios_kh_roll: weighted roll, daily quota, 3s cooldown, collection add
 *   or ephemeral replace-picker when full.
 * - hios_kh_collection: ephemeral personal collection view.
 * - hios_kh_duel: ephemeral user-select → instant duel, strongest khodam
 *   auto-picked, public result + W-D-L recorded.
 * - hios_kh_board: public leaderboard.
 */

const {
  EmbedBuilder,
  ActionRowBuilder,
  UserSelectMenuBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  MessageFlags,
} = require("discord.js");
const { log } = require("../../log");
const { getConfig } = require("./store");
const { bumpPanelToBottom } = require("./panel");
const { pickKhodam, getKhodam, tierOf } = require("./roster");
const { simulateDuel } = require("./battle");
const {
  wibToday,
  strongestOf,
  rollsRemaining,
  canRoll,
  needsReplace,
  checkCooldown,
  MAX_COLLECTION,
  ROLLS_PER_DAY,
} = require("./util");
const db = require("./db");

const cooldowns = new Map(); // `${guildId}:${userId}` -> timestamp
const pendingReplaces = new Map(); // `${guildId}:${userId}` -> { khodamId, expiresAt }
const REPLACE_TTL_MS = 5 * 60_000;

function displayNameOf(interaction) {
  return (
    interaction.member?.displayName ||
    interaction.user.globalName ||
    interaction.user.username
  );
}

function statsLine(k) {
  return `⚔️ ${k.atk}  🛡️ ${k.def}  ❤️ ${k.hp}  💨 ${k.spd}`;
}

function revealEmbed(display, khodam, note, remaining) {
  const tier = tierOf(khodam);
  return new EmbedBuilder()
    .setTitle(`🎲 ${display} mengecek khodamnya...`)
    .setDescription(
      `**${khodam.name}** ${tier.emoji} *${tier.label}*\n> ${khodam.desc}\n\n${statsLine(khodam)}\n\n${note}`
    )
    .setColor(tier.color)
    .setFooter({ text: `Sisa cek hari ini: ${remaining}x (reset 00:00 WIB)` });
}

function keyOf(interaction) {
  return `${interaction.guildId}:${interaction.user.id}`;
}

/**
 * Fire-and-forget: after a public game result, move the panel back to the
 * bottom of the channel so it never gets buried. Never throws and never
 * blocks the interaction that triggered it.
 *
 * Bumps are debounced per guild: rapid game bursts (many rolls/duels in a
 * row) collapse into ONE delete+repost instead of one per click — each bump
 * re-uploads 2 PNG attachments, so uncoalesced bumps are the heaviest API
 * churn in the bot. The trailing bump still guarantees the panel ends up at
 * the bottom after the burst.
 */
const BUMP_DEBOUNCE_MS = 10_000;
const scheduledBumps = new Map(); // guildId -> Timeout

function bumpPanel(interaction) {
  try {
    const guild = interaction.guild;
    if (!guild) return;
    if (scheduledBumps.has(guild.id)) return; // one already queued for this burst
    const t = setTimeout(() => {
      scheduledBumps.delete(guild.id);
      try {
        // Emojis come from the stored config (ensured at startup / panel
        // post) — no emoji re-sync on the hot path.
        bumpPanelToBottom(guild).catch((err) => log.warn("khodam bump failed:", err.message));
      } catch (err) {
        log.warn("khodam bump failed:", err.message);
      }
    }, BUMP_DEBOUNCE_MS);
    t.unref?.(); // cosmetic bump must not hold the process open
    scheduledBumps.set(guild.id, t);
  } catch (err) {
    log.warn("khodam bump failed:", err.message);
  }
}

async function gameReady(interaction) {
  const cfg = getConfig(interaction.guildId);
  if (!cfg.enabled) {
    await interaction.reply({
      content: "Gamenya lagi dimatiin admin. Balik lagi ntar ya.",
      flags: MessageFlags.Ephemeral,
    });
    return null;
  }
  if (!db.isEnabled()) {
    await interaction.reply({
      content: "Database-nya lagi nggak konek, coba lagi ntar.",
      flags: MessageFlags.Ephemeral,
    });
    return null;
  }
  return cfg;
}

// ---------------------------------------------------------------- roll ---

async function handleRoll(interaction) {
  if (!(await gameReady(interaction))) return;

  const remaining_cd = checkCooldown(cooldowns, keyOf(interaction));
  if (remaining_cd > 0) {
    await interaction.reply({
      content: `Sabar bro, tunggu ${Math.ceil(remaining_cd / 1000)} detik dulu.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const ymd = wibToday();
  const used = await db.getDailyRolls(interaction.guildId, interaction.user.id, ymd);
  if (!canRoll(used)) {
    await interaction.reply({
      content: `Kuota cek hari ini habis (${ROLLS_PER_DAY}x). Balik lagi besok jam 00:00 WIB!`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const khodam = pickKhodam();
  const newUsed = await db.incrementDailyRoll(interaction.guildId, interaction.user.id, ymd);
  const remaining = rollsRemaining(newUsed);
  const display = displayNameOf(interaction);

  const collection = await db.getCollection(interaction.guildId, interaction.user.id);
  const owned = collection.some((c) => c.khodam_id === khodam.id);

  if (owned) {
    await interaction.reply({
      embeds: [revealEmbed(display, khodam, "Khodam ini **sudah ada** di koleksimu.", remaining)],
    });
    bumpPanel(interaction);
    return;
  }

  if (!needsReplace(collection.length)) {
    await db.addToCollection(interaction.guildId, interaction.user.id, khodam.id);
    await interaction.reply({
      embeds: [
        revealEmbed(display, khodam, "✨ **Khodam baru!** Ditambahkan ke koleksimu.", remaining),
      ],
    });
    bumpPanel(interaction);
    return;
  }

  // Collection full — ephemeral picker: replace one, or discard the new one.
  pendingReplaces.set(keyOf(interaction), { khodamId: khodam.id, expiresAt: Date.now() + REPLACE_TTL_MS });
  const tier = tierOf(khodam);
  const options = collection
    .map((c) => getKhodam(c.khodam_id))
    .filter(Boolean)
    .map((k) => {
      const t = tierOf(k);
      return new StringSelectMenuOptionBuilder()
        .setLabel(k.name.slice(0, 100))
        .setDescription(`${t.label} • ${statsLine(k)}`.slice(0, 100))
        .setValue(k.id)
        .setEmoji(t.emoji);
    });
  options.push(
    new StringSelectMenuOptionBuilder()
      .setLabel("Buang khodam baru")
      .setDescription("Tetap simpan 10 khodam yang sekarang")
      .setValue("discard")
      .setEmoji("🗑️")
  );
  const menu = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("hios_kh_replace")
      .setPlaceholder("Koleksi penuh! Pilih yang mau diganti...")
      .addOptions(options)
  );
  await interaction.reply({
    embeds: [
      revealEmbed(
        display,
        khodam,
        `⚠️ Koleksimu **penuh** (${MAX_COLLECTION}/${MAX_COLLECTION}). Pilih satu khodam di bawah buat diganti, atau buang yang baru ini.`,
        remaining
      ).setFooter({ text: "Pilihan ini cuma buat lu — orang lain nggak liat" }),
    ],
    components: [menu],
    flags: MessageFlags.Ephemeral,
  });
}

// ---------------------------------------------------------- collection ---

async function handleCollection(interaction) {
  if (!db.isEnabled()) {
    await interaction.reply({
      content: "Database-nya lagi nggak konek, coba lagi ntar.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const collection = await db.getCollection(interaction.guildId, interaction.user.id);
  const display = displayNameOf(interaction);

  if (collection.length === 0) {
    await interaction.reply({
      content: "Koleksimu masih kosong. Pencet 🎲 di panel buat cek khodam pertamamu!",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const entries = collection
    .map((c) => getKhodam(c.khodam_id))
    .filter(Boolean)
    .sort((a, b) => b.atk * 2 + b.def + b.spd + b.hp * 0.5 - (a.atk * 2 + a.def + a.spd + a.hp * 0.5));

  const lines = entries.map((k, i) => {
    const t = tierOf(k);
    return `**${i + 1}.** ${t.emoji} **${k.name}** — ${statsLine(k)}`;
  });

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle(`🎒 Koleksi khodam ${display}`)
        .setDescription(lines.join("\n"))
        .setColor(0x3498db)
        .setFooter({ text: `${collection.length}/${MAX_COLLECTION} khodam • diurut dari terkuat` }),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

// ---------------------------------------------------------------- duel ---

async function handleDuelButton(interaction) {
  if (!(await gameReady(interaction))) return;
  const picker = new ActionRowBuilder().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId("hios_kh_duel_pick")
      .setPlaceholder("Pilih lawan duel lu...")
      .setMinValues(1)
      .setMaxValues(1)
  );
  await interaction.reply({
    content: "Pilih siapa yang mau lu tantang duel khodam:",
    components: [picker],
    flags: MessageFlags.Ephemeral,
  });
}

function formatBattleLog(result, nameA, nameB) {
  const lines = result.log.map((e) => {
    const attacker = e.attacker === "a" ? nameA : nameB;
    const victimHp = e.attacker === "a" ? e.hpB : e.hpA;
    return `R${e.round} — **${attacker}** mukul **${e.damage}** dmg (sisa HP: ${victimHp})`;
  });
  if (lines.length <= 10) return lines.join("\n");
  return [...lines.slice(0, 6), "…", ...lines.slice(-4)].join("\n");
}

async function handleDuelPick(interaction) {
  const targetId = interaction.values[0];
  const attackerId = interaction.user.id;

  if (targetId === attackerId) {
    await interaction.reply({ content: "Nggak bisa duel lawan diri sendiri bro.", flags: MessageFlags.Ephemeral });
    return;
  }
  const target = await interaction.guild.members.fetch(targetId).catch(() => null);
  if (!target || target.user.bot) {
    await interaction.reply({ content: "Nggak bisa duel lawan bot.", flags: MessageFlags.Ephemeral });
    return;
  }
  if (!(await gameReady(interaction))) return;

  const [attColl, defColl] = await Promise.all([
    db.getCollection(interaction.guildId, attackerId),
    db.getCollection(interaction.guildId, targetId),
  ]);
  if (attColl.length === 0) {
    await interaction.reply({
      content: "Lu belum punya khodam. Cek dulu pake 🎲 di panel!",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (defColl.length === 0) {
    await interaction.reply({
      content: `<@${targetId}> belum punya khodam. Suruh dia cek dulu!`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const khodamA = strongestOf(attColl, getKhodam);
  const khodamB = strongestOf(defColl, getKhodam);
  if (!khodamA || !khodamB) {
    await interaction.reply({ content: "Ada yang aneh sama datanya, coba lagi ntar.", flags: MessageFlags.Ephemeral });
    return;
  }

  const result = simulateDuel(khodamA, khodamB);
  const guildId = interaction.guildId;

  let outcomeLine;
  if (result.winner === "a") {
    await Promise.all([
      db.recordDuel(guildId, attackerId, khodamA.id, "win"),
      db.recordDuel(guildId, targetId, khodamB.id, "loss"),
    ]);
    outcomeLine = `🏆 **PEMENANG: ${khodamA.name}** milik <@${attackerId}>!`;
  } else if (result.winner === "b") {
    await Promise.all([
      db.recordDuel(guildId, attackerId, khodamA.id, "loss"),
      db.recordDuel(guildId, targetId, khodamB.id, "win"),
    ]);
    outcomeLine = `🏆 **PEMENANG: ${khodamB.name}** milik <@${targetId}>!`;
  } else {
    await Promise.all([
      db.recordDuel(guildId, attackerId, khodamA.id, "draw"),
      db.recordDuel(guildId, targetId, khodamB.id, "draw"),
    ]);
    outcomeLine = "🤝 **DRAW!** Keduanya kelelahan setelah 20 ronde.";
  }

  const tierA = tierOf(khodamA);
  const tierB = tierOf(khodamB);
  const embed = new EmbedBuilder()
    .setTitle("⚔️ DUEL KHODAM")
    .setDescription(
      `<@${attackerId}> (**${khodamA.name}** ${tierA.emoji}) vs <@${targetId}> (**${khodamB.name}** ${tierB.emoji})`
    )
    .addFields(
      { name: `${khodamA.name} — ${statsLine(khodamA)}`, value: "\u200b", inline: false },
      { name: `${khodamB.name} — ${statsLine(khodamB)}`, value: "\u200b", inline: false },
      { name: "📜 Battle Log", value: formatBattleLog(result, khodamA.name, khodamB.name), inline: false },
      { name: "Hasil", value: outcomeLine, inline: false }
    )
    .setColor(0xe74c3c)
    .setFooter({ text: `${result.rounds} ronde • SPD tertinggi mukul duluan` })
    .setTimestamp();

  await interaction.deferUpdate();
  await interaction.channel.send({ embeds: [embed] }).catch(() => {});
  bumpPanel(interaction);
  await interaction
    .editReply({ content: "⚔️ Duel selesai! Hasilnya udah dipost di channel.", components: [] })
    .catch(() => {});
}

// ----------------------------------------------------------- leaderboard ---

async function handleBoard(interaction) {
  if (!db.isEnabled()) {
    await interaction.reply({
      content: "Database-nya lagi nggak konek, coba lagi ntar.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const [byWins, byRate] = await Promise.all([
    db.leaderboardByWins(interaction.guildId, 5),
    db.leaderboardByWinRate(interaction.guildId, 5),
  ]);

  const medals = ["🥇", "🥈", "🥉", "4.", "5."];
  const winsLines =
    byWins.length === 0
      ? "_Belum ada duel. Jadilah yang pertama!_"
      : byWins
          .map((r, i) => {
            const w = Number(r.wins);
            const d = Number(r.draws);
            const l = Number(r.losses);
            return `${medals[i]} <@${r.user_id}> — **${w}** menang (${l} kalah, ${d} draw)`;
          })
          .join("\n");

  const rateLines =
    byRate.length === 0
      ? "_Belum cukup data (min. 3 duel per khodam)._"
      : byRate
          .map((r, i) => {
            const k = getKhodam(r.khodam_id);
            const w = Number(r.wins);
            const d = Number(r.draws);
            const l = Number(r.losses);
            const pct = Math.round((w / Math.max(1, w + d + l)) * 100);
            const name = k ? `**${k.name}**` : `\`${r.khodam_id}\``;
            return `${medals[i]} <@${r.user_id}> • ${name} — **${pct}%** (${w}W-${l}L-${d}D)`;
          })
          .join("\n");

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle("🏆 Leaderboard Khodam")
        .addFields(
          { name: "👑 Paling Sering Menang", value: winsLines, inline: false },
          { name: "🎯 Win Rate Tertinggi", value: rateLines, inline: false }
        )
        .setColor(0xf1c40f)
        .setTimestamp(),
    ],
  });
  bumpPanel(interaction);
}

// ------------------------------------------------------ replace picker ---

async function handleReplacePick(interaction) {
  const key = keyOf(interaction);
  const pending = pendingReplaces.get(key);
  if (!pending || pending.expiresAt < Date.now()) {
    pendingReplaces.delete(key);
    await interaction.reply({
      content: "Pilihannya udah kedaluwarsa. Roll lagi buat dapet khodam baru.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  pendingReplaces.delete(key);
  const newKhodam = getKhodam(pending.khodamId);
  if (!newKhodam) {
    await interaction.update({ content: "Khodamnya nggak ketemu, coba roll lagi.", components: [] });
    return;
  }

  const choice = interaction.values[0];
  if (choice === "discard") {
    await interaction.update({
      content: `Yaudah, **${newKhodam.name}** dibuang. Koleksimu tetap sama.`,
      embeds: [],
      components: [],
    });
    return;
  }

  const oldKhodam = getKhodam(choice);
  await db.removeFromCollection(interaction.guildId, interaction.user.id, choice);
  await db.addToCollection(interaction.guildId, interaction.user.id, newKhodam.id);

  await interaction.update({
    content: `🔄 **${oldKhodam ? oldKhodam.name : choice}** diganti sama **${newKhodam.name}**!`,
    embeds: [],
    components: [],
  });
  const tier = tierOf(newKhodam);
  await interaction.channel
    .send({
      embeds: [
        revealEmbed(
          displayNameOf(interaction),
          newKhodam,
          `✨ **Khodam baru!** Menggantikan **${oldKhodam ? oldKhodam.name : "khodam lama"}** di koleksimu.\n` +
            `_Statistik duel ${oldKhodam ? oldKhodam.name : "khodam lama"} tetap tersimpan._`,
          0
        ).setFooter({ text: "Hasil replace koleksi penuh" }),
      ],
    })
    .catch(() => {});
  bumpPanel(interaction);
}

// ---------------------------------------------------------------- router ---

async function handleKhodamButton(interaction) {
  const customId = interaction.customId;
  try {
    if (customId === "hios_kh_roll") await handleRoll(interaction);
    else if (customId === "hios_kh_collection") await handleCollection(interaction);
    else if (customId === "hios_kh_duel") await handleDuelButton(interaction);
    else if (customId === "hios_kh_board") await handleBoard(interaction);
  } catch (err) {
    log.warn("khodam button error:", err.message);
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: "Ada error, coba lagi ntar.", flags: MessageFlags.Ephemeral });
      }
    } catch {}
  }
}

async function handleKhodamSelect(interaction) {
  try {
    if (interaction.customId === "hios_kh_duel_pick") await handleDuelPick(interaction);
    else if (interaction.customId === "hios_kh_replace") await handleReplacePick(interaction);
  } catch (err) {
    log.warn("khodam select error:", err.message);
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: "Ada error, coba lagi ntar.", flags: MessageFlags.Ephemeral });
      }
    } catch {}
  }
}

module.exports = { handleKhodamButton, handleKhodamSelect };
