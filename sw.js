// Service worker: aplikasi harus bisa dibuka dari nol tanpa internet.
// Naikkan VERSI setiap kali berkas aplikasi berubah agar cache lama dibuang.

const VERSI = 'catat-balik-v3';

const ASET = [
  './',
  './index.html',
  './config.js',
  './manifest.webmanifest',
  './assets/css/app.css',
  './assets/js/app.js',
  './assets/js/router.js',
  './assets/js/store.js',
  './assets/js/db.js',
  './assets/js/model.js',
  './assets/js/fmt.js',
  './assets/js/ui.js',
  './assets/js/csv.js',
  './assets/js/xlsx.js',
  './assets/js/sync.js',
  './assets/js/supabase.js',
  './assets/js/views/beranda.js',
  './assets/js/views/catat.js',
  './assets/js/views/daftar.js',
  './assets/js/views/orang.js',
  './assets/js/views/acara.js',
  './assets/js/views/lainnya.js',
  './assets/js/views/cetak.js',
  './assets/js/views/impor.js',
  './assets/js/views/pengaturan.js',
  './vendor/supabase-js-2.58.0.esm.js',
  './assets/icons/icon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSI);
    // Satu berkas gagal tidak boleh menggagalkan seluruh instalasi.
    await Promise.all(ASET.map(async (url) => {
      try {
        await cache.add(new Request(url, { cache: 'reload' }));
      } catch (err) {
        console.warn('[sw] gagal cache', url, err);
      }
    }));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const nama = await caches.keys();
    await Promise.all(nama.filter((n) => n !== VERSI).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Permintaan ke Supabase / CDN tidak disentuh: biar gagal apa adanya saat
  // offline supaya mesin sinkron tahu harus mengantre ulang.
  if (url.origin !== location.origin) return;

  // Navigasi: coba jaringan, jatuh ke shell dari cache saat offline.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        return await fetch(req);
      } catch {
        const cache = await caches.open(VERSI);
        return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
      }
    })());
    return;
  }

  // Aset: tampilkan dari cache lalu segarkan di belakang (stale-while-revalidate).
  event.respondWith((async () => {
    const cache = await caches.open(VERSI);
    const tersimpan = await cache.match(req, { ignoreSearch: true });
    const jaringan = fetch(req).then((res) => {
      if (res && res.ok && res.type === 'basic') cache.put(req, res.clone()).catch(() => {});
      return res;
    }).catch(() => null);

    if (tersimpan) { jaringan.catch(() => {}); return tersimpan; }
    const res = await jaringan;
    return res || Response.error();
  })());
});
