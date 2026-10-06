# Integrasi lintas klien

## Backend lokal desktop

Desktop sekarang menjalankan **Express + SQLite lokal** dari proses utama Electron. File database berada di `app.getPath('userData')/inquiries.sqlite`; pengujian dapat menginjeksikan path sementara. Binding default adalah `127.0.0.1:4002`. Renderer tetap memakai IPC dan kontrak API lama, dengan URL bawaan `http://127.0.0.1:4002`; URL pada layar Pengaturan tetap dapat diganti untuk API lain.

Endpoint publik yang kompatibel:

- `GET /health`
- `GET /api/v1/products`
- `POST /api/v1/inquiries`
- `GET /api/v1/inquiries/{trackingCode}`

Katalog adalah seed demo. Inquiry append-only dan memiliki UUID stabil, tracking code, data pelanggan, produk, jumlah/unit, status `received`, waktu pembuatan, serta `originNodeId`.

## Peer sync (demo only)

Tiga backend dapat menjadi peer tanpa master. Setiap peer memiliki `SYNC_NODE_ID` unik. Atur:

```env
SYNC_NODE_ID=desktop-local
SYNC_SHARED_SECRET=<secret-random-minimal-32-karakter-yang-sama-pada-ketiga-backend>
SYNC_PEERS=web-local=http://127.0.0.1:4000,mobile-local=http://127.0.0.1:4001
```

`POST /api/v1/sync/inquiries` menerima satu objek `InquiryRecord` dan memerlukan `Authorization: Bearer <SYNC_SHARED_SECRET>`. Secret kosong menonaktifkan endpoint (503). Buat secret dengan `openssl rand -hex 32`; jangan simpan di bundle atau log. ID/tracking code identik adalah no-op; isi berbeda mengembalikan HTTP 409 dan tidak menimpa record, sementara hash konflik dicatat durable. Outbox durable melakukan fan-out ke peer selain asal dan node sendiri, dengan timeout serta exponential backoff. Receiver hanya meneruskan record baru sehingga loop berhenti.

`SYNC_PEERS` harus berupa comma-separated `nodeId=http(s)://host:port`; URL dengan kredensial, query, atau fragment ditolak. API hanya bind non-loopback jika `API_HOST` diubah secara eksplisit dan server desktop sendiri hanya HTTP. Untuk peer non-local, gunakan reverse proxy TLS (`https`) di depan API dan batasi port HTTP ke loopback. **Sync hanya untuk demo: jangan gunakan data klien nyata, dan secret tidak pernah ditampilkan di UI/bundle/log.** Tidak ada login/admin, edit status, atau penghapusan.

## Kontrak klien

Ketiga klien tetap memakai endpoint publik di atas. Web dan mobile dapat diarahkan ke peer masing-masing. Kode pelacakan dapat digunakan lintas klien yang terhubung.
