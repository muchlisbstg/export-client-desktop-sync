# Export Client — Desktop

Klien desktop berbasis Electron + React dengan **backend lokal Express + SQLite**. Desktop tetap mempertahankan kontrak API yang sama dengan [aplikasi web](https://github.com/muchlisbstg/export-client-web-sync) dan [aplikasi mobile](https://github.com/muchlisbstg/export-client-mobile-sync), serta dapat melakukan peer sync append-only.

## Kemampuan

- Memuat katalog demo dari database lokal desktop.
- Menyimpan permintaan penawaran (RFQ) di SQLite desktop; peer sync opsional membagikan record baru ke backend web dan mobile.
- Melacak permintaan dengan kode 24 karakter yang dapat digunakan lintas web, mobile, dan desktop.
- Menjalankan database lokal persisten di `app.getPath('userData')` dan API default `http://127.0.0.1:4002`.
- Sinkronisasi peer opsional dengan outbox/retry, konflik durable, dan idempotensi.
- Mengemas aplikasi untuk desktop melalui Electron Builder.

## Menjalankan lokal

Persyaratan: Node.js 22+ dan npm.

1. (Opsional) Salin `.env.example` ke `.env` dan isi konfigurasi peer sync. Secret kosong berarti sync nonaktif.

   ```bash
   cp .env.example .env
   ```

2. Jalankan aplikasi desktop:

   ```bash
   cd export-client-desktop-sync
   npm ci
   npm run dev
   ```

3. Buka **Pengaturan** bila ingin mengganti URL dari default `http://127.0.0.1:4002` ke server lain.

`npm run dev` memulai renderer, Electron, dan API lokal. `API_HOST` tetap loopback kecuali diubah eksplisit. API desktop sendiri hanya HTTP; untuk peer non-local, letakkan reverse proxy TLS di depannya dan jangan expose port HTTP langsung ke jaringan yang tidak tepercaya.

## Integrasi dengan web dan mobile

Ketiga klien memakai endpoint publik yang kompatibel:

- `GET /health` — memeriksa kesiapan server.
- `GET /api/v1/products` — membaca katalog demo pada peer yang dituju.
- `POST /api/v1/inquiries` — membuat RFQ pada peer yang dituju.
- `GET /api/v1/inquiries/{trackingCode}` — membaca status RFQ.

Peer sync internal tersedia melalui `POST /api/v1/sync/inquiries` dengan `Authorization: Bearer <SYNC_SHARED_SECRET>`. Setiap node memakai `SYNC_NODE_ID` unik dan `SYNC_PEERS=nodeId=http(s)://host:port`. Sync hanya demo; TLS diperlukan pada jaringan non-local.

Panggilan jaringan desktop dilakukan melalui proses utama Electron dan IPC yang terbatas pada endpoint yang diperlukan. Karena itu origin `file://` Electron tidak meminta perubahan atau pelonggaran CORS pada API web.

Detail konfigurasi dan alur ada di [`docs/integration.md`](docs/integration.md). Jangan masukkan data klien nyata.

## Pemeriksaan dan build

```bash
  npm test            # uji klien dan backend lokal/replikasi dua-node
npm run typecheck   # pemeriksaan TypeScript
npm run build       # build renderer, preload, dan Electron main
npm run package:dir # paket direktori aplikasi untuk host saat ini
npm run dist        # buat installer/artifact default host saat ini
```

CI Desktop juga menjalankan tes interoperabilitas terhadap backend Web dan Mobile. Untuk langkah menjalankan harness tiga repo secara lokal dan rincian cakupan konflik/replay, lihat [runbook pengujian interoperabilitas](https://github.com/muchlisbstg/export-client-web-sync/blob/main/docs/interop-testing.md); tes memakai data sintetis serta SQLite sementara dan tidak melakukan deployment.

Untuk menghasilkan installer platform tertentu, gunakan runner yang sesuai dengan platform target (Windows, macOS, atau Linux) dan konfigurasi Electron Builder.

## Status, privasi, dan batasan

Ini adalah **MVP/demo**, bukan aplikasi produksi. Katalog adalah data contoh. Backend saat ini belum memiliki login, kebijakan admin/otorisasi, maupun kebijakan retensi data; kode pelacakan berfungsi sebagai bearer secret. Jangan masukkan data klien nyata atau mengandalkannya untuk transaksi.

Sebelum penggunaan nyata, backend perlu autentikasi dan kontrol akses, perlindungan data pribadi dan retensi, TLS, backup, serta storage/deployment persisten yang sesuai. Tidak ada deployment backend atau penggunaan data klien nyata yang dilakukan sebagai bagian repo ini.
