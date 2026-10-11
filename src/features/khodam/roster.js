/**
 * Khodam roster — the collectible spirits of the Cek Khodam game.
 *
 * ~50 khodam drafted with Indonesian meme flavor. Each has fixed stats
 * (deterministic roster = stable balance + testable). Tiers gate the
 * weighted roll chances; stat ranges grow per tier.
 *
 * Shape: { id, name, tier, atk, def, hp, spd, desc }
 */

const TIERS = {
  common: { chance: 0.5, emoji: "⚪", label: "Common", color: 0x95a5a6 },
  rare: { chance: 0.28, emoji: "🔵", label: "Rare", color: 0x3498db },
  epic: { chance: 0.14, emoji: "🟣", label: "Epic", color: 0x9b59b6 },
  legendary: { chance: 0.06, emoji: "🟡", label: "Legendary", color: 0xf1c40f },
  mythic: { chance: 0.02, emoji: "🔴", label: "Mythic", color: 0xe74c3c },
};

const ROSTER = [
  // ---------------- COMMON (50%) — ATK/DEF/SPD 5-12, HP 30-55 ----------------
  { id: "tuyul-wifi", name: "Tuyul Wifi", tier: "common", atk: 7, def: 5, hp: 38, spd: 12, desc: "Spesialis maling bandwidth. Ping 999 tapi tetep ngotot mabar." },
  { id: "pocong-gabut", name: "Pocong Gabut", tier: "common", atk: 6, def: 8, hp: 45, spd: 5, desc: "Lompat-lompat doang tiap malam tanpa tujuan. Kayak lu scroll TikTok jam 2 pagi." },
  { id: "kuntilanak-senja", name: "Kuntilanak Senja", tier: "common", atk: 8, def: 6, hp: 40, spd: 10, desc: "Nangkring di pohon sambil ketawa, tapi ketawanya ketawa capek abis lembur." },
  { id: "genderuwo-magang", name: "Genderuwo Magang", tier: "common", atk: 5, def: 7, hp: 42, spd: 6, desc: "Baru 3 bulan jadi hantu, masih nanya-nanya SOP nakutin ke senior." },
  { id: "sundel-bolong-influencer", name: "Sundel Bolong Influencer", tier: "common", atk: 7, def: 6, hp: 36, spd: 11, desc: "Endorse pocong sebelah, engagement naik 300%. Bolongnya makin estetik." },
  { id: "wewe-gombel-arisan", name: "Wewe Gombel Arisan", tier: "common", atk: 6, def: 9, hp: 48, spd: 5, desc: "Ketua arisan komplek hantu. Yang telat bayar diculik, literally." },
  { id: "leak-scroll-tiktok", name: "Leak Scroll TikTok", tier: "common", atk: 9, def: 5, hp: 34, spd: 12, desc: "Niatnya cuma 5 menit, tau-tau matahari terbit. Nggak bisa berhenti." },
  { id: "jelangkung-afk", name: "Jelangkung AFK", tier: "common", atk: 5, def: 6, hp: 40, spd: 7, desc: "Dipanggil nggak dateng-dateng. Status online, orangnya ngilang." },
  { id: "hantu-ambulans", name: "Hantu Ambulans", tier: "common", atk: 8, def: 7, hp: 44, spd: 9, desc: "Suaranya wiu-wiu tiap malam Jumat. Nggak bawa pasien, cuma muter-muter." },
  { id: "suster-ngesot-ojol", name: "Suster Ngesot Ojol", tier: "common", atk: 7, def: 6, hp: 38, spd: 12, desc: "Ngesot ngebut antar orderan. Rating 4.9, nggak pernah telat." },
  { id: "banaspati-kompor", name: "Banaspati Kompor", tier: "common", atk: 10, def: 5, hp: 32, spd: 8, desc: "Api biru, sekali sentuh gosong. Jangan tanya kenapa kompor lu bunyi sendiri." },
  { id: "jenglot-kopi-sachet", name: "Jenglot Kopi Sachet", tier: "common", atk: 6, def: 5, hp: 30, spd: 10, desc: "Kecil, item, dan bikin melek semaleman. Overdosis begadang." },
  { id: "siluman-kucing-oren", name: "Siluman Kucing Oren", tier: "common", atk: 11, def: 7, hp: 40, spd: 11, desc: "Bar-bar, nggak ada takutnya. Gelud lawan genderuwo juga hayuk." },
  { id: "hantu-lorong-kos", name: "Hantu Lorong Kos", tier: "common", atk: 5, def: 8, hp: 46, spd: 6, desc: "Penunggu lorong kos lantai 3. Hobinya matiin lampu pas lu bawa mie." },
  { id: "pocong-lari-pagi", name: "Pocong Lari Pagi", tier: "common", atk: 7, def: 7, hp: 50, spd: 11, desc: "Ikut fun run tiap Minggu. Lompatannya makin kenceng, PB terus." },
  { id: "kuntilanak-karaoke", name: "Kuntilanak Karaoke", tier: "common", atk: 8, def: 5, hp: 36, spd: 9, desc: "Suaranya melengking, mic nomor 7. Tetangga hantu pada protes." },
  { id: "genderuwo-satpam", name: "Genderuwo Satpam", tier: "common", atk: 7, def: 10, hp: 52, spd: 5, desc: "Jaga portal komplek kuburan. Tamu wajib lapor 1x24 jam." },
  { id: "tuyul-top-up", name: "Tuyul Top Up", tier: "common", atk: 6, def: 6, hp: 34, spd: 12, desc: "Jasa top up diamond, dana gaib cair 5 menit. Testimoni banyak." },
  { id: "sundel-bolong-begadang", name: "Sundel Bolong Begadang", tier: "common", atk: 7, def: 6, hp: 38, spd: 10, desc: "Ratu begadang server ini. Jam 4 pagi masih online." },
  { id: "wewe-gombel-gofood", name: "Wewe Gombel GoFood", tier: "common", atk: 6, def: 8, hp: 44, spd: 8, desc: "Dulu culik anak yang jajan sembarangan. Sekarang sekalian nganterin gofood." },
  { id: "hantu-parkir-liar", name: "Hantu Parkir Liar", tier: "common", atk: 5, def: 9, hp: 48, spd: 5, desc: "\"Parkir sini bang, aman bang.\" Tarif gaib 5 ribu." },
  { id: "leak-macet-tol", name: "Leak Macet Tol", tier: "common", atk: 6, def: 7, hp: 46, spd: 5, desc: "Terjebak di tol sejak 2019. Bensin gaib habis, nggak bisa pulang." },
  { id: "jelangkung-mabar", name: "Jelangkung Mabar", tier: "common", atk: 9, def: 6, hp: 36, spd: 10, desc: "Push rank tiap malam, role jungler. Nggak pernah mau ganti role." },
  { id: "banaspati-korek", name: "Banaspati Korek Gas", tier: "common", atk: 8, def: 5, hp: 34, spd: 9, desc: "Api kecil tapi konsisten. Kayak semangat lu Senin pagi." },
  { id: "pocong-ketinggalan-rombongan", name: "Pocong Ketinggalan Rombongan", tier: "common", atk: 6, def: 7, hp: 42, spd: 6, desc: "Rombongannya udah pindah alam, dia masih nyasar di gang buntu." },

  // ---------------- RARE (28%) — ATK/DEF/SPD 11-20, HP 50-75 ----------------
  { id: "nyi-roro-kidul-lite", name: "Nyi Roro Kidul Lite", tier: "rare", atk: 14, def: 15, hp: 68, spd: 13, desc: "Versi hemat sang ratu pantai selatan. Tetap anggun, tapi naik KRL." },
  { id: "nyai-blorong-freelance", name: "Nyai Blorong Freelance", tier: "rare", atk: 16, def: 12, hp: 60, spd: 15, desc: "Terima proyek pesugihan remote, WFA (work from alam gaib)." },
  { id: "genderuwo-ceo", name: "Genderuwo CEO", tier: "rare", atk: 15, def: 16, hp: 70, spd: 12, desc: "Mimpin startup alam gaib, valuasi 1 triliun tuyul." },
  { id: "kuntilanak-merah-marun", name: "Kuntilanak Merah Marun", tier: "rare", atk: 17, def: 13, hp: 62, spd: 16, desc: "Edisi terbatas, warnanya lebih mahal. Ketawanya ada reverb-nya." },
  { id: "pocong-ekspedisi", name: "Pocong Ekspedisi", tier: "rare", atk: 13, def: 14, hp: 66, spd: 18, desc: "Paket gaib sameday, garansi pocong-nya nggak dibuka." },
  { id: "tuyul-kripto", name: "Tuyul Kripto", tier: "rare", atk: 18, def: 11, hp: 55, spd: 17, desc: "All-in koin micin, portofolio minus 90% tapi tetap hold." },
  { id: "sundel-bolong-night-shift", name: "Sundel Bolong Night Shift", tier: "rare", atk: 14, def: 13, hp: 64, spd: 14, desc: "Shift malam 12 jam nonstop. Tunjangan lembur berupa ketawa." },
  { id: "wewe-gombel-investasi", name: "Wewe Gombel Investasi Bodong", tier: "rare", atk: 15, def: 15, hp: 68, spd: 11, desc: "\"Dijamin untung 20% per bulan!\" Korbannya diculik beneran." },
  { id: "leak-premium", name: "Leak Langganan Premium", tier: "rare", atk: 16, def: 14, hp: 62, spd: 15, desc: "Bebas iklan, bisa skip ritual. Langganan 149 ribu per bulan." },
  { id: "jenglot-barista", name: "Jenglot Barista", tier: "rare", atk: 12, def: 12, hp: 58, spd: 16, desc: "Bikin kopi susu gula aren, latte art-nya tengkorak." },
  { id: "siluman-ular-sawah", name: "Siluman Ular Sawah", tier: "rare", atk: 17, def: 15, hp: 70, spd: 13, desc: "Nungguin panen, sekali melilit traktor ikut keangkat." },
  { id: "hantu-bioskop", name: "Hantu Bioskop", tier: "rare", atk: 13, def: 13, hp: 60, spd: 14, desc: "Duduk di kursi F8 tiap malam. Nggak pernah bayar, nggak pernah ketahuan." },
  { id: "genderuwo-rapat", name: "Genderuwo Rapat", tier: "rare", atk: 12, def: 17, hp: 72, spd: 11, desc: "Rapat 4 jam nggak ada keputusan. Notulennya ditulis pake darah." },
  { id: "kuntilanak-pramugari", name: "Kuntilanak Pramugari", tier: "rare", atk: 15, def: 14, hp: 64, spd: 17, desc: "\"Selamat datang di penerbangan GA-ib.\" Ketawanya jadi pengumuman kabin." },

  // ---------------- EPIC (14%) — ATK/DEF/SPD 19-30, HP 70-100 ----------------
  { id: "buto-ijo-gym", name: "Buto Ijo Gym", tier: "epic", atk: 28, def: 24, hp: 95, spd: 20, desc: "Member gym 5 tahun, ototnya segede pintu. Proteinnya tumbal." },
  { id: "raksasa-es-kelapa", name: "Raksasa Es Kelapa", tier: "epic", atk: 24, def: 28, hp: 100, spd: 19, desc: "Segede gaban tapi adem. Sekali gebuk, haus lu hilang." },
  { id: "naga-komodo-santet", name: "Naga Komodo Santet", tier: "epic", atk: 30, def: 22, hp: 90, spd: 24, desc: "Gigitan beracun plus kiriman santet. Double kill." },
  { id: "garuda-senja", name: "Garuda Senja", tier: "epic", atk: 26, def: 24, hp: 88, spd: 30, desc: "Terbangnya gagah, tapi cuma keluar pas golden hour buat konten." },
  { id: "leak-calonarang-pro-max", name: "Leak Calonarang Pro Max", tier: "epic", atk: 29, def: 25, hp: 92, spd: 26, desc: "Versi paling update, kameranya 3, ilmunya 10." },
  { id: "nyai-blorong-sultan", name: "Nyai Blorong Sultan", tier: "epic", atk: 27, def: 27, hp: 96, spd: 22, desc: "Naik alphard gaib, ajudannya 40 tuyul." },
  { id: "jenglot-kolektor-pusaka", name: "Jenglot Kolektor Pusaka", tier: "epic", atk: 25, def: 29, hp: 94, spd: 21, desc: "Koleksi kerisnya 300, semuanya bunyi sendiri jam 12 malam." },

  // ---------------- LEGENDARY (6%) — ATK/DEF/SPD 29-42, HP 95-130 ----------------
  { id: "buto-terong-sultan", name: "Buto Terong Sultan", tier: "legendary", atk: 40, def: 35, hp: 125, spd: 30, desc: "Badannya ungu mengkilap, sekali kentut gempa 5 SR." },
  { id: "naga-barong-digital", name: "Naga Barong Digital", tier: "legendary", atk: 42, def: 33, hp: 120, spd: 38, desc: "Barong yang udah go-digital. Aumannya ada efek bass boosted." },
  { id: "kuntilanak-putih-final-boss", name: "Kuntilanak Putih Final Boss", tier: "legendary", atk: 38, def: 40, hp: 130, spd: 33, desc: "Bukan mini-boss lagi. HP bar-nya tiga lapis." },

  // ---------------- MYTHIC (2%) — ATK/DEF/SPD 41-60, HP 125-165 ----------------
  { id: "semar-multiverse", name: "Semar Multiverse", tier: "mythic", atk: 55, def: 58, hp: 160, spd: 45, desc: "Ada di semua timeline sekaligus. Ketawanya bikin retak dimensi." },
  { id: "batara-kala-prime", name: "Batara Kala Prime", tier: "mythic", atk: 60, def: 55, hp: 165, spd: 50, desc: "Raksasa pemakan waktu. Sekali ngemil, deadline lu maju seminggu." },
];

const byId = new Map(ROSTER.map((k) => [k.id, k]));

function getKhodam(id) {
  return byId.get(id) || null;
}

/**
 * Weighted roll: pick a tier by TIERS chance, then a uniform khodam inside it.
 * `random` is injectable (Math.random by default) so tests can seed it.
 */
function pickKhodam(random = Math.random) {
  const r = random();
  let acc = 0;
  let tier = "common";
  for (const [key, meta] of Object.entries(TIERS)) {
    acc += meta.chance;
    if (r < acc) {
      tier = key;
      break;
    }
  }
  const pool = ROSTER.filter((k) => k.tier === tier);
  return pool[Math.floor(random() * pool.length)];
}

function tierOf(khodam) {
  return TIERS[khodam.tier] || TIERS.common;
}

module.exports = { TIERS, ROSTER, getKhodam, pickKhodam, tierOf };
