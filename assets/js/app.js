// Boot aplikasi: router, render view, status sinkron, service worker.
// Prinsipnya: layar digambar dari data lokal lebih dulu, jaringan menyusul.

import { parseHash, cocok } from './router.js';
import { subscribe, kuota, gudangTersedia } from './store.js';
import { onStatus, mulaiOtomatis, STATUS, sinkron } from './sync.js';
import { banner, tutupBanner } from './ui.js';

import * as beranda from './views/beranda.js';
import * as catat from './views/catat.js';
import * as daftar from './views/daftar.js';
import * as orang from './views/orang.js';
import * as acara from './views/acara.js';
import * as lainnya from './views/lainnya.js';
import * as cetak from './views/cetak.js';
import * as impor from './views/impor.js';
import * as pengaturan from './views/pengaturan.js';

const RUTE = [
  ['/', beranda, 'beranda'],
  ['/catat', catat, 'catat'],
  ['/daftar', daftar, 'daftar'],
  ['/orang', orang, 'orang'],
  ['/orang/:id', orang, 'orang'],
  ['/acara', acara, 'lainnya'],
  ['/acara/:id', acara, 'lainnya'],
  ['/lainnya', lainnya, 'lainnya'],
  ['/cetak', cetak, 'lainnya'],
  ['/impor', impor, 'lainnya'],
  ['/pengaturan', pengaturan, 'lainnya'],
];

const wadah = document.getElementById('view');
let aktif = null;

// ---------- render ----------

function tampilkan(view, ctx, tab, { jagaScroll = false } = {}) {
  const scroll = window.scrollY;

  // Setiap render memakai elemen baru: listener view sebelumnya ikut terbuang,
  // jadi tidak ada event yang menumpuk antar halaman.
  wadah.innerHTML = '';
  const kotak = document.createElement('div');
  wadah.appendChild(kotak);

  const lengkap = {
    ...ctx,
    gambarUlang: (patch = {}) => tampilkan(view, { ...ctx, ...patch }, tab, { jagaScroll: true }),
  };
  aktif = { view, ctx: lengkap, tab };

  try {
    const hasil = view.render(kotak, lengkap);
    if (hasil && typeof hasil.catch === 'function') hasil.catch(tampilkanGalat);
  } catch (err) {
    tampilkanGalat(err);
  }

  tandaiTab(tab);
  document.title = `${view.judulHalaman || 'Catat Balik'} · Catat Balik`;
  if (jagaScroll) window.scrollTo(0, scroll);
  else window.scrollTo(0, 0);
}

function tampilkanGalat(err) {
  console.error(err);
  wadah.innerHTML = `
    <div class="card">
      <h1>Terjadi kesalahan</h1>
      <p class="small muted">${String(err && err.message ? err.message : err)}</p>
      <div class="btn-row">
        <a class="btn btn-primary" href="#/">Ke beranda</a>
        <button class="btn" type="button" onclick="location.reload()">Muat ulang</button>
      </div>
    </div>`;
}

function rute() {
  const { jalur, query } = parseHash(location.hash);
  for (const [pola, view, tab] of RUTE) {
    const params = cocok(pola, jalur);
    if (params) return tampilkan(view, { params, query }, tab);
  }
  wadah.innerHTML = `
    <div class="card">
      <h1>Halaman tidak ditemukan</h1>
      <p class="small muted">Alamat <code>${jalur.replace(/[<>&]/g, '')}</code> tidak dikenal.</p>
      <a class="btn btn-primary" href="#/">Ke beranda</a>
    </div>`;
  tandaiTab('beranda');
}

function tandaiTab(tab) {
  for (const a of document.querySelectorAll('.tabbar a')) {
    if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
}

// ---------- status sinkron di header ----------

function pasangChip() {
  const chip = document.getElementById('sync-chip');
  const teks = document.getElementById('sync-chip-text');
  onStatus((s) => {
    chip.dataset.state = s.state;
    const label = STATUS[s.state] || s.state;
    teks.textContent = s.tertunda && s.state !== 'menyinkron' ? `${label} · ${s.tertunda}` : label;
    chip.title = s.pesan || `Status sinkron: ${label}`;
  });

  // Ketuk chip = coba sinkron sekarang; tahan perilaku tautan ke Pengaturan
  // hanya bila cloud belum aktif.
  chip.addEventListener('click', (ev) => {
    if (chip.dataset.state === 'lokal' || chip.dataset.state === 'perlu-login') return; // biarkan ke Pengaturan
    ev.preventDefault();
    sinkron();
  });
}

// ---------- service worker ----------

function pasangServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol === 'file:') return;

  navigator.serviceWorker.register('./sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const baru = reg.installing;
      if (!baru) return;
      baru.addEventListener('statechange', () => {
        if (baru.state === 'installed' && navigator.serviceWorker.controller) {
          banner('Versi baru tersedia.', {
            aksi: {
              label: 'Muat ulang',
              onClick: () => {
                reg.waiting?.postMessage({ type: 'SKIP_WAITING' });
                setTimeout(() => location.reload(), 300);
              },
            },
          });
        }
      });
    });
  }).catch((err) => console.warn('Service worker gagal didaftarkan:', err));

  let sudahMuatUlang = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (sudahMuatUlang) return;
    sudahMuatUlang = true;
  });
}

// ---------- mulai ----------

function mulai() {
  if (!location.hash) location.hash = '#/';
  rute();
  window.addEventListener('hashchange', () => { tutupBanner(); rute(); });

  // Data berubah (edit lokal maupun hasil pull) -> gambar ulang view yang
  // tidak sedang menampung isian form.
  let menunggu = false;
  subscribe(() => {
    if (!aktif || aktif.view.autoReload === false) return;
    if (menunggu) return;
    menunggu = true;
    requestAnimationFrame(() => {
      menunggu = false;
      if (aktif) tampilkan(aktif.view, aktif.ctx, aktif.tab, { jagaScroll: true });
    });
  });

  pasangChip();
  mulaiOtomatis();
  pasangServiceWorker();

  const k = kuota();
  if (!gudangTersedia()) {
    banner('Penyimpanan browser diblokir — data hanya bertahan selama tab terbuka.', { kind: 'galat' });
  } else if (k.penuh) {
    banner('Penyimpanan penuh. Unduh backup lalu aktifkan sinkron cloud.', { kind: 'galat' });
  } else if (k.persen >= 85) {
    banner(`Penyimpanan lokal ${k.persen}% terpakai. Sebaiknya unduh backup.`, { durasi: 8000 });
  }
}

mulai();
