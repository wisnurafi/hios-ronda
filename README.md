# hios-ronda

Bot patroli Go Live buat Discord. Kalau ada yang mulai streaming (Go Live) di voice channel mana pun, bot otomatis join ke channel itu — presence + auto manage, plus notifikasi `@here` ke public chat.

> Catatan jujur: bot Discord nggak bisa "nonton" video stream lewat API resmi. Yang dilakuin bot ini: join voice channel si streamer sebagai presence + ngatur antrean otomatis.

## Cara kerja

- Trigger: `voiceStateUpdate` → `self_stream = true`, di channel mana pun.
- Antrean FIFO per server: yang live duluan yang dilayani (bot cuma 1, cuma bisa di 1 voice channel per server).
- Stream berhenti → grace period 5 detik (anti toggle iseng) → bot leave → pindah ke antrean berikutnya yang masih live.
- Channel di-private/lock sehingga bot nggak bisa join → di-skip, lanjut ke antrean berikutnya.
- Streamer pindah channel pas lagi live → bot leave, **nggak** ngikutin. Join lagi cuma kalau ada event Go Live baru.
- Streamer stop tapi masih di voice → bot leave (setelah grace).
- Bot nggak pernah nahan temp channel: dia leave begitu stream selesai, jadi auto-delete channel tetap jalan normal.
- Koneksi voice putus tiba-tiba → bot coba reconnect sendiri.
- Notifikasi ke public chat: `🔴 @here **Nama** lagi live di **#channel**` (+ `⚫ **Nama** selesai streaming.` pas berhenti).

## Setup

1. Buat aplikasi + bot di [Discord Developer Portal](https://discord.com/developers/applications), copy token-nya.
2. Invite bot dengan scope `bot` + permission: **View Channels**, **Connect** (voice), **Send Messages**. Intent yang dipakai: `Guilds`, `GuildVoiceStates` (dua-duanya non-privileged, nggak perlu toggle khusus).
3. Di server hosting:

```bash
npm install
cp .env.example .env
# isi BOT_TOKEN di .env
npm start
```

## Env vars

| Var | Wajib | Default | Keterangan |
|-----|-------|---------|------------|
| `BOT_TOKEN` | ya | – | Token bot Discord |
| `NOTIFY_CHANNEL_ID` | tidak | `1400349914155847744` | Channel teks buat notifikasi live |
| `LEAVE_GRACE_MS` | tidak | `5000` | Grace period sebelum leave pas stream berhenti (ms) |

## Resource

Ringan: cuma event gateway + 1 koneksi voice (tanpa receive/decode audio). Aman buat tier gratisan.
