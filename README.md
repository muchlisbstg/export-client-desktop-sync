# Export Client — Desktop

Klien desktop berbasis Electron + React untuk platform klien ekspor. Desktop memakai **API bersama yang sama** dengan [aplikasi web](https://github.com/muchlisbstg/export-client-web-sync) dan [aplikasi mobile](https://github.com/muchlisbstg/export-client-mobile-sync); repository web tetap menjadi pemilik server dan kontrak API.

## Kemampuan

- Memuat katalog produk demo dari API bersama.
- Mengirim permintaan penawaran (RFQ) ke API yang sama.
- Melacak permintaan dengan kode 24 karakter yang dapat digunakan lintas web, mobile, dan desktop.
- Mengatur dan menguji URL server API.
- Mengemas aplikasi untuk desktop melalui Electron Builder.

## Menjalankan lokal

Persyaratan: Node.js 22+ dan npm.

1. Jalankan API dari repo web (di komputer lain, alamat server harus dapat dijangkau):

   ```bash
   cd export-client-web-sync
   npm ci
   cp .env.example .env
   npm run dev:api
   ```

   API lokal tersedia di `http://localhost:4000`.

2. Jalankan aplikasi desktop:

   ```bash
   cd export-client-desktop-sync
   npm ci
   npm run dev
   ```

3. Buka **Pengaturan** pada aplikasi dan masukkan URL dasar API yang sama. Nilai bawaan `http://localhost:4000` cocok bila server berjalan di komputer yang sama. Untuk server lain, gunakan alamat HTTPS atau IP/hostname yang dapat dijangkau desktop.

`npm run dev` memulai renderer dan Electron. Aplikasi desktop tidak menjalankan atau menggantikan server API.

## Integrasi dengan web dan mobile

Ketiga klien memakai endpoint yang didefinisikan di [kontrak OpenAPI repo web](https://github.com/muchlisbstg/export-client-web-sync/blob/main/docs/openapi.yaml):

- `GET /health` — memeriksa kesiapan server.
- `GET /api/v1/products` — membaca katalog bersama.
- `POST /api/v1/inquiries` — membuat RFQ.
- `GET /api/v1/inquiries/{trackingCode}` — membaca status RFQ.

Agar data benar-benar sinkron, web, mobile, dan desktop harus diarahkan ke **deployment API yang sama**. Pada mobile, set `EXPO_PUBLIC_API_URL` sesuai petunjuk repo mobile. Kode pelacakan yang dibuat oleh klien mana pun dapat digunakan oleh dua klien lain.

Panggilan jaringan desktop dilakukan melalui proses utama Electron dan IPC yang terbatas pada endpoint yang diperlukan. Karena itu origin `file://` Electron tidak meminta perubahan atau pelonggaran CORS pada API web.

Detail konfigurasi dan alur ada di [`docs/integration.md`](docs/integration.md).

## Pemeriksaan dan build

```bash
npm test            # uji kontrak API dengan fetch mock
npm run typecheck   # pemeriksaan TypeScript
npm run build       # build renderer, preload, dan Electron main
npm run package:dir # paket direktori aplikasi untuk host saat ini
npm run dist        # buat installer/artifact default host saat ini
```

Untuk menghasilkan installer platform tertentu, gunakan runner yang sesuai dengan platform target (Windows, macOS, atau Linux) dan konfigurasi Electron Builder.

## Status, privasi, dan batasan

Ini adalah **MVP/demo**, bukan aplikasi produksi. Katalog adalah data contoh. Backend saat ini belum memiliki login, kebijakan admin/otorisasi, maupun kebijakan retensi data; kode pelacakan berfungsi sebagai bearer secret. Jangan masukkan data klien nyata atau mengandalkannya untuk transaksi.

Sebelum penggunaan nyata, backend perlu autentikasi dan kontrol akses, perlindungan data pribadi dan retensi, TLS, backup, serta storage/deployment persisten yang sesuai. Tidak ada deployment backend atau penggunaan data klien nyata yang dilakukan sebagai bagian repo ini.
