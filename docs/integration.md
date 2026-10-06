# Integrasi lintas klien

## Arsitektur

```text
Web app ───────┐
Mobile app ────┼──> API + database bersama (dikelola repo web)
Desktop app ───┘
```

Repo desktop adalah klien saja. Ia tidak menyalin database, menambah endpoint, atau menyediakan backend sendiri. Sinkronisasi berarti ketiga klien membaca dan menulis ke deployment API/database yang sama.

## URL API desktop

Buka **Pengaturan → URL dasar API**. Masukkan origin/root API, misalnya:

- Server lokal pada komputer yang sama: `http://localhost:4000`
- Server di komputer LAN: `http://192.168.1.10:4000`
- Deployment: `https://api.example.com`

Alamat disimpan di local storage aplikasi desktop. Jangan masukkan kredensial, token, query, atau data rahasia ke URL. Untuk perangkat berbeda, `localhost` menunjuk perangkat masing-masing; pakai alamat server yang dapat dijangkau bersama. Pastikan firewall dan konfigurasi jaringan mengizinkan koneksi.

Klien mengirim request dari proses utama Electron lewat IPC yang menyediakan operasi terbatas (`health`, katalog, buat RFQ, dan lacak RFQ). Renderer tidak menerima akses Node.js atau request path arbitrer.

## Endpoint dan data

Kontrak otoritatif adalah [`docs/openapi.yaml`](https://github.com/muchlisbstg/export-client-web-sync/blob/main/docs/openapi.yaml) pada repo web.

- Katalog dibaca dengan `GET /api/v1/products`.
- RFQ dikirim ke `POST /api/v1/inquiries` menggunakan `customerName`, `customerEmail`, `destinationCountry`, `productId`, dan `quantity`.
- Respons pembuatan memberikan kode pelacakan 24 karakter.
- Kode yang sama digunakan untuk `GET /api/v1/inquiries/{trackingCode}` dari web, mobile, atau desktop.

Kode pelacakan dapat dipakai siapa pun yang mengetahuinya untuk melihat status dan nama produk. Simpan dan bagikan secara terbatas.

## Mobile dan web

- Web menyajikan backend/API. Pengembangan lokalnya dijelaskan di README repo web.
- Mobile memakai `EXPO_PUBLIC_API_URL` yang diarahkan ke server sama. Gunakan IP LAN untuk perangkat fisik, bukan `localhost`.
- Desktop mengatur URL dari layar Settings.

## Keamanan dan batas penggunaan

MVP backend tidak memiliki autentikasi/admin policy dan belum menetapkan retensi data. Demo tidak boleh diisi data klien nyata. CORS backend tidak diubah oleh aplikasi desktop: panggilan desktop dibuat dari proses utama Electron sehingga tidak membutuhkan pengecualian origin baru.
