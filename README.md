# Djuita HR Portal

Portal HR lintas perangkat untuk PT Uchy Mitra Suksesindo / House of Djuita.

## Arsitektur produksi

- Netlify: hosting frontend dan serverless functions.
- Supabase Auth: login dan sesi pengguna.
- Supabase Postgres: pengguna, staf, permohonan, persetujuan, nomor surat, dan audit log.
- Supabase Storage private bucket: KTP serta tanda tangan/cap.
- Row Level Security: izin akses diputuskan oleh database, bukan sekadar menyembunyikan tombol.

Jika endpoint `/api/config` tidak tersedia, portal masuk ke mode pratinjau lokal agar versi GitHub Pages lama tidak langsung berhenti. Mode ini tidak boleh digunakan untuk operasional lintas perangkat.

## Setup Supabase

1. Buat proyek Supabase.
2. Jalankan seluruh isi `supabase/migrations/202607290001_initial.sql` melalui SQL Editor atau Supabase CLI.
3. Salin Project URL, publishable key, dan secret key.
4. Jangan pernah menaruh secret key di HTML, JavaScript browser, Git, atau variabel build publik.

## Setup Netlify

Hubungkan repository ini ke Netlify. Tambahkan environment variables berikut dengan scope Functions:

```text
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY
BOOTSTRAP_SECRET
DJUITA_AUTH_EMAIL_DOMAIN
```

Gunakan nilai `DJUITA_AUTH_EMAIL_DOMAIN=users.djuita.internal` kecuali ada kebutuhan khusus.

## Membuat Admin pertama

Setelah deploy pertama, panggil endpoint bootstrap satu kali:

```bash
curl -X POST https://DOMAIN-NETLIFY/api/bootstrap-admin \
  -H 'content-type: application/json' \
  -H 'x-bootstrap-secret: NILAI_BOOTSTRAP_SECRET' \
  --data '{"username":"hrtiara","fullName":"Hullia Ratu Tiara","password":"GANTI-DENGAN-PASSWORD-KUAT"}'
```

Endpoint otomatis menolak bootstrap kedua jika profil sudah tersedia. Setelah berhasil, ganti `BOOTSTRAP_SECRET` di Netlify dan deploy ulang.

## Pemeriksaan lokal

```bash
npm install
npm run check
npx netlify dev
```

Mode produksi lokal memerlukan `.env` yang dibuat dari `.env.example`.

## Catatan keamanan data KTP

- Bucket bersifat private dan dibatasi RLS.
- Maksimal file 8 MB dan hanya menerima JPEG, PNG, WebP, atau PDF.
- Publishable key boleh berada di browser jika RLS aktif.
- Supabase secret key hanya boleh berada pada Netlify Functions.
- Tetapkan kebijakan retensi dan penghapusan KTP sesuai kebutuhan legal/HR perusahaan sebelum go-live.
