# Catat Balik

Buku neraca **balas budi hajatan**. Catat sumbangan uang/barang yang **masuk** ke acara Anda dan yang **Anda berikan** ke acara orang lain, lalu aplikasi menghitung sendiri: *siapa yang masih harus saya balas, dan berapa.*

Buku tamu kertas menyimpan nama, tapi tidak menyimpan nominal, tidak bisa dicari, dan tidak tahu siapa yang sudah dibalas. Aplikasi ini mengisi kekosongan itu.

- **Jalan tanpa internet.** Dipakai sambil berdiri di depan kotak sumbangan, sinyal jelek pun tetap bisa mencatat.
- **Tanpa proses build.** HTML + CSS + JavaScript biasa. Push ke GitHub, situsnya langsung hidup.
- **Data milik Anda.** Tersimpan di perangkat; sinkron ke Supabase hanya bila Anda mengaktifkannya.

---

## Daftar isi

1. [Fitur](#fitur)
2. [Coba cepat di komputer](#coba-cepat-di-komputer)
3. [Deploy ke GitHub Pages](#deploy-ke-github-pages)
4. [Aktifkan sinkron cloud (Supabase)](#aktifkan-sinkron-cloud-supabase)
5. [Pasang di HP](#pasang-di-hp)
6. [Cara memakai sehari-hari](#cara-memakai-sehari-hari)
7. [Impor, ekspor, dan cetak](#impor-ekspor-dan-cetak)
8. [Cara kerja data dan sinkron](#cara-kerja-data-dan-sinkron)
9. [Struktur proyek](#struktur-proyek)
10. [Pengembangan dan pengujian](#pengembangan-dan-pengujian)
11. [Batasan yang perlu diketahui](#batasan-yang-perlu-diketahui)

---

## Fitur

| | |
|---|---|
| **Dua arah** | Catatan masuk (tamu di acara saya) dan keluar (saya menyumbang ke acara orang) dalam satu buku. |
| **Neraca per orang** | Saldo = masuk − keluar. Saldo positif berarti Anda masih berutang balas. |
| **Saran nominal balasan** | Sisa utang dibulatkan ke atas sesuai kelipatan pilihan Anda, bisa ditambah penyesuaian inflasi per tahun. |
| **Uang & barang** | Barang dicatat lengkap (nama, jumlah, satuan) dengan taksiran nilai agar ikut masuk neraca. |
| **Agenda** | Acara orang lain yang akan datang muncul di beranda lengkap dengan “bawa sekitar Rp sekian”. |
| **Offline penuh (PWA)** | Bisa dipasang di layar utama HP dan dibuka tanpa internet. |
| **Sinkron cloud opsional** | Supabase (Postgres + Auth + RLS), aman dari kehilangan HP, bisa dibuka di beberapa perangkat. |
| **Impor Excel/CSV** | Tempel langsung dari Excel atau pilih berkas, dengan pemetaan kolom dan pratinjau. |
| **Ekspor & cetak** | CSV (siap dibuka Excel), .xlsx, backup JSON, serta laporan siap cetak/PDF. |

---

## Coba cepat di komputer

Aplikasi memakai ES module, jadi **tidak bisa** dibuka lewat `file://` — harus lewat http.

```bash
# cara 1: server bawaan proyek (butuh Node 18+)
node tools/serve.mjs
# buka http://localhost:8765/

# cara 2: XAMPP — taruh folder ini di htdocs
# buka http://localhost/catat-balik/
```

Belum ada data? Buka tab **Catat**, isi nama dan nominal, simpan. Beranda langsung menampilkan neracanya.

---

## Deploy ke GitHub Pages

Seluruh isi repo adalah situsnya; tidak ada yang perlu di-build.

```bash
git init
git add -A
git commit -m "Catat Balik: versi pertama"

gh repo create catat-balik --public --source=. --push

# aktifkan Pages dengan sumber GitHub Actions
gh api -X POST repos/{owner}/catat-balik/pages -f build_type=workflow
```

Alur `.github/workflows/pages.yml` akan menjalankan pengujian lebih dulu, lalu memublikasikan situs ke:

```
https://<username>.github.io/catat-balik/
```

Lewat antarmuka web: **Settings → Pages → Source: GitHub Actions**.

> Semua jalur di aplikasi bersifat relatif dan routernya memakai hash (`#/orang/…`), jadi aman di subfolder Pages dan tidak 404 saat halaman di-refresh.

---

## Aktifkan sinkron cloud (Supabase)

Tanpa langkah ini aplikasi tetap berfungsi penuh, hanya saja data hidup di satu perangkat saja.

1. Buat akun gratis di [supabase.com](https://supabase.com), lalu **New project**. Catat *database password* Anda.
2. Buka **SQL Editor → New query**, tempel seluruh isi [`supabase/schema.sql`](supabase/schema.sql), tekan **Run**. Skrip ini membuat tabel, indeks, trigger, dan aturan keamanan (RLS). Aman dijalankan ulang.
3. Buka **Project Settings → API**, salin **Project URL** dan **anon public key**.
4. Buka aplikasi → tab **Lainnya → Pengaturan** → tempel keduanya → **Simpan koneksi**.
5. Masih di halaman yang sama, isi email dan sandi lalu tekan **Daftar baru** (sekali saja), kemudian **Masuk**.
6. Data lokal yang sudah ada otomatis diunggah. Indikator di pojok kanan atas berubah menjadi **Tersinkron**.
7. Di perangkat lain: buka URL yang sama, isi URL + anon key, masuk dengan akun yang sama — data tertarik ke sana.

**Tentang anon key.** Kunci ini memang dirancang untuk publik. Yang menjaga data adalah *Row Level Security*: setiap baris terikat `owner_id = auth.uid()`, sehingga pemegang anon key tanpa login tidak bisa membaca atau menulis apa pun. Karena itu kunci boleh ditaruh di `config.js` dan ikut ter-commit bila Anda mau. Yang **tidak boleh** dipublikasikan adalah *service_role key*.

Tip: bila tidak ingin repot konfirmasi email saat mendaftar, matikan **Authentication → Sign In / Providers → Email → Confirm email** di dashboard Supabase.

---

## Pasang di HP

1. Buka URL GitHub Pages di Chrome (Android) atau Safari (iPhone).
2. Android: menu **⋮ → Add to Home screen**. iPhone: tombol bagikan → **Add to Home Screen**.
3. Buka dari ikon layar utama — tampil layar penuh tanpa bilah alamat dan tetap jalan saat offline.

Pintasan tekan-lama ikon: *Catat masuk*, *Catat keluar*, dan *Perlu dibalas*.

---

## Cara memakai sehari-hari

**Saat Anda punya hajatan**

1. Buat acara di tab **Lainnya → Acara** (opsional, tapi memudahkan rekap).
2. Tiap tamu: tab **Catat** → nama → nominal → **Simpan & catat lagi**. Acara dan tanggal tetap terisi, tinggal ganti nama.
3. Selesai acara: **Lainnya → Cetak laporan → Rekap satu acara** untuk arsip.

**Saat orang lain punya hajatan**

1. Buka tab **Orang**, cari namanya. Di sana terlihat saldo dan **saran balasan**.
2. Tekan **Catat balasan** — nominalnya sudah terisi saran, tanggal hari ini.
3. Setelah tersimpan, sumbangan asalnya bertanda *sudah dibalas* dan orangnya hilang dari daftar “perlu dibalas”.

**Istilah**

- **Masuk** — orang lain memberi kepada Anda.
- **Keluar** — Anda memberi kepada orang lain.
- **Saldo / perlu dibalas** — masuk dikurangi keluar; positif berarti Anda masih berutang balas.
- **Taksiran nilai** — perkiraan harga barang; tanpa ini barang dihitung Rp 0 dan saldo tampak lebih kecil dari kenyataan.

---

## Impor, ekspor, dan cetak

**Impor** (tab **Lainnya → Impor**) menerima tempelan langsung dari Excel (Ctrl+C lalu Ctrl+V), berkas `.csv`, atau `.xlsx`. Kolom dicocokkan otomatis lalu bisa diperbaiki manual; selalu ada pratinjau, baris bermasalah dan duplikat ditandai sebelum apa pun disimpan. Butuh contoh format? Ada tombol **Unduh contoh CSV**.

**Ekspor** tersedia dalam CSV (catatan / per orang / acara), Excel `.xlsx`, dan **backup JSON** lengkap untuk pemulihan. CSV memakai penanda UTF-8 dan pemisah titik koma agar langsung rapi di Excel Indonesia — bisa diganti ke koma di Pengaturan.

**Cetak** (tab **Lainnya → Cetak laporan**) menyediakan tiga laporan: daftar utang balas budi, rekap satu acara, dan semua catatan. Tekan **Cetak**, lalu pilih *Save as PDF* di dialog cetak browser.

> Membaca berkas `.xlsx` butuh internet sekali untuk memuat pustaka pembacanya; CSV selalu jalan walau offline.

---

## Cara kerja data dan sinkron

```
            tulis                 antre                  push (upsert)
 UI  ──────────────▶  localStorage  ──────▶  outbox  ─────────────────▶  Supabase
      baca ◀───────       (sumber                       ◀─────────────
                       kebenaran UI)                     pull sejak cursor
```

- **Lokal dulu.** Setiap perubahan ditulis ke localStorage dan langsung tampil; jaringan menyusul. Aplikasi tidak pernah menunggu server untuk bisa dipakai.
- **Outbox.** Perubahan yang belum terkirim diantre dan dikirim ulang otomatis saat online, saat tab kembali terlihat, dan tiap lima menit.
- **Idempoten.** Primary key berupa UUID dibuat di perangkat, jadi pengiriman ulang hanya menimpa baris yang sama — tidak pernah menggandakan data.
- **Jam server.** `updated_at` selalu diisi trigger Postgres, bukan jam HP, sehingga cursor sinkron tidak rusak oleh jam perangkat yang meleset. Pull memundurkan cursor dua detik untuk menutup celah penulisan pada detik yang sama.
- **Penghapusan ikut tersinkron.** Hapus = `deleted_at` diisi (soft delete), bukan baris dibuang; tanpa ini penghapusan di satu HP tidak akan sampai ke HP lain.
- **Konflik.** Tulisan terakhir menang, per baris. Perubahan lokal yang masih di outbox tidak pernah ditimpa oleh hasil pull.
- **Sesi kedaluwarsa.** Bila token habis saat offline, data lokal tetap utuh dan bisa ditulis; indikator berubah menjadi *Perlu login* dan antrean dikirim setelah Anda masuk lagi.

Indikator di pojok kanan atas: **Lokal** (cloud belum diaktifkan) · **Tersinkron** · **Tertunda · n** · **Offline** · **Perlu login** · **Gagal sinkron**. Ketuk untuk memaksa sinkron.

---

## Struktur proyek

```
index.html                 kerangka aplikasi + navigasi
config.js                  (opsional) URL & anon key bila ingin di-hardcode
sw.js                      service worker: precache agar bisa dibuka offline
manifest.webmanifest       identitas PWA
assets/css/app.css         satu berkas gaya, termasuk mode gelap & layout cetak
assets/js/
  app.js                   boot, router, status sinkron, service worker
  store.js  db.js          state localStorage + CRUD dan outbox
  model.js                 semua perhitungan neraca (modul murni, teruji)
  sync.js   supabase.js    mesin sinkron dan klien Supabase
  csv.js    xlsx.js        impor/ekspor berkas
  fmt.js    ui.js  router.js
  views/                   satu berkas per halaman
vendor/                    supabase-js 2.58.0 terpasang lokal (bukan CDN)
supabase/schema.sql        tabel, indeks, trigger, dan RLS
tools/                     uji, generator ikon, server lokal
```

Mengapa `supabase-js` disalin ke repo alih-alih diambil dari CDN: PWA yang wajib bisa dibuka offline tidak boleh bergantung pada unduhan pihak ketiga saat start. Berkasnya ikut di-precache service worker.

---

## Pengembangan dan pengujian

Tidak ada dependensi npm. Node 18+ hanya dipakai untuk alat bantu.

```bash
npm test          # perhitungan neraca + pemeriksa import/aset (cepat)
npm run smoke     # buka 20 rute di Edge/Chrome headless + uji jalur tulis
npm run test:all  # keduanya
npm run icons     # bangun ulang ikon PNG dari geometri di tools/make-icons.mjs
npm run serve     # http://localhost:8765/
```

- `tools/selftest.mjs` — 114 pemeriksaan untuk `model.js`, `fmt.js`, `csv.js`.
- `tools/cek-impor.mjs` — karena tanpa bundler: memastikan setiap import menunjuk berkas dan nama yang benar-benar ada, daftar precache `sw.js` lengkap, dan rujukan di `index.html` valid.
- `tools/smoke.mjs` — menyalakan server, mengisi data contoh, lalu memeriksa DOM tiap rute serta menjalankan 35 pemeriksaan jalur tulis (catat → saldo → balasan → hapus) di browser sungguhan.

Ketiganya juga berjalan di GitHub Actions sebelum situs dipublikasikan.

**Setelah mengubah atau menambah berkas aplikasi:** naikkan `VERSI` di `sw.js` dan tambahkan berkas barunya ke daftar `ASET`, agar pengguna lama mendapat versi baru dan offline tetap utuh. `npm test` akan mengingatkan bila ada yang terlewat.

---

## Batasan yang perlu diketahui

- **Tidak ada notifikasi HP.** Pengingat berupa daftar prioritas dan agenda di dalam aplikasi; notifikasi dorong perlu server tersendiri.
- **Satu akun.** Keluarga yang ikut mencatat memakai login yang sama. Skema sudah menyisakan ruang untuk multi-pengguna tanpa migrasi besar.
- **Menghapus data lokal tidak menghapus data server.** Bila cloud aktif, data akan tertarik lagi saat sinkron berikutnya; untuk benar-benar menghapus, kosongkan tabel dari dashboard Supabase.
- **Memulihkan backup bersifat menimpa, bukan mengganti.** Baris yang ada di server tapi tidak ada di backup akan kembali saat sinkron.
- **Barang tanpa taksiran dihitung Rp 0.** Ini disengaja agar aplikasi tidak mengarang angka; beranda memberi peringatan bila ada barang yang belum ditaksir.
- **Penyimpanan browser ±5 MB** — cukup untuk puluhan ribu catatan. Aplikasi memperingatkan di 85%.

---

## Lisensi

MIT. Silakan pakai, ubah, dan bagikan.
