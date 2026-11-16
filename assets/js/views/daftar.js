// Daftar semua catatan: cari, filter, urutkan, lalu ketuk untuk mengubah.
// Saat filter berubah hanya bagian hasil yang digambar ulang, supaya fokus dan
// posisi kursor di kotak pencarian tidak hilang saat mengetik.

import { data } from '../store.js';
import { acaraAktif } from '../db.js';
import { cariEntri, deskripsiEntri, ARAH } from '../model.js';
import { rupiah, esc, inisial, tanggal, LABEL_JENIS_ACARA } from '../fmt.js';
import { judul, kosong, opsi, pada } from '../ui.js';
import { gantiTanpaRiwayat, querystring } from '../router.js';

export const judulHalaman = 'Daftar';

export function render(host, ctx) {
  const f = {
    q: ctx.query.q || '',
    arah: ctx.query.arah || '',
    jenis: ctx.query.jenis || '',
    status: ctx.query.status || '',
    eventId: ctx.query.acara || '',
    urut: ctx.query.urut || 'tanggal-turun',
  };

  host.innerHTML = `
    ${judul('Daftar catatan', 'Ketuk sebuah catatan untuk mengubah atau menghapusnya.')}
    ${toolbar(f)}
    <div id="hasil"></div>`;

  const gambarHasil = () => {
    const { baris, total } = cariEntri(data(), f);
    const sub = host.querySelector('.page-head .sub');
    if (sub) sub.textContent = `${baris.length} catatan · total ${rupiah(total)}`;
    host.querySelector('#hasil').innerHTML = baris.length
      ? `<div class="list">${baris.map(kartu).join('')}</div>`
      : kosong('Tidak ada catatan yang cocok.', '<a class="btn btn-primary" href="#/catat">+ Catat baru</a>');
  };

  const ambilFilter = () => {
    const box = host.querySelector('#filter');
    f.q = box.querySelector('[name="q"]').value.trim();
    f.arah = box.querySelector('[name="arah"]').value;
    f.jenis = box.querySelector('[name="jenis"]').value;
    f.status = box.querySelector('[name="status"]').value;
    f.eventId = box.querySelector('[name="acara"]').value;
    f.urut = box.querySelector('[name="urut"]').value;
    // replaceState: filter tidak menumpuk di riwayat tombol "kembali",
    // tapi URL tetap bisa dibagikan / di-bookmark.
    gantiTanpaRiwayat(`/daftar${querystring({ ...f, acara: f.eventId, eventId: '' })}`);
    gambarHasil();
  };

  pada(host, '#filter select', 'change', ambilFilter);
  let timer = null;
  pada(host, '#filter [name="q"]', 'input', () => {
    clearTimeout(timer);
    timer = setTimeout(ambilFilter, 200);
  });

  gambarHasil();
}

function toolbar(f) {
  const acara = acaraAktif().sort((a, b) => String(b.tanggal || '').localeCompare(String(a.tanggal || '')));
  return `
  <div class="toolbar no-print" id="filter">
    <input name="q" value="${esc(f.q)}" placeholder="Cari nama, acara, catatan…" enterkeyhint="search" autocomplete="off">
    <div class="filters">
      <select name="arah" aria-label="Arah">${opsi([['', 'Semua arah'], ['masuk', 'Masuk'], ['keluar', 'Keluar']], f.arah)}</select>
      <select name="jenis" aria-label="Jenis">${opsi([['', 'Uang & barang'], ['uang', 'Uang'], ['barang', 'Barang']], f.jenis)}</select>
      <select name="status" aria-label="Status">${opsi([['', 'Semua status'], ['belum', 'Belum dibalas'], ['dibalas', 'Sudah dibalas']], f.status)}</select>
    </div>
    <div class="filters">
      <select name="acara" aria-label="Acara" style="grid-column:span 2">
        ${opsi([['', 'Semua acara'], ...acara.map((a) => [a.id, `${a.nama} (${LABEL_JENIS_ACARA[a.jenis] || 'acara'})`])], f.eventId)}
      </select>
      <select name="urut" aria-label="Urutan">
        ${opsi([
          ['tanggal-turun', 'Terbaru'],
          ['tanggal-naik', 'Terlama'],
          ['nilai-turun', 'Nilai terbesar'],
          ['nilai-naik', 'Nilai terkecil'],
          ['nama', 'Nama A-Z'],
        ], f.urut)}
      </select>
    </div>
  </div>`;
}

const BADGE = {
  belum: '<span class="badge warn">belum dibalas</span>',
  dibalas: '<span class="badge ok">sudah dibalas</span>',
  balasan: '<span class="badge masuk">balasan</span>',
  keluar: '',
};

function kartu(b) {
  const masuk = b.entri.arah === ARAH.MASUK;
  const nama = b.orang?.nama || '(orang terhapus)';
  return `
  <a class="item" href="#/catat?id=${esc(b.entri.id)}&kembali=/daftar">
    <div class="avatar">${esc(inisial(nama))}</div>
    <div class="grow">
      <div class="ttl">${esc(nama)} ${BADGE[b.status] || ''}</div>
      <div class="meta">
        ${esc(tanggal(b.entri.tanggal))} &middot; ${esc(deskripsiEntri(b.entri))}
        ${b.acara ? ` &middot; ${esc(b.acara.nama)}` : ''}
        ${b.entri.catatan ? ` &middot; ${esc(b.entri.catatan)}` : ''}
      </div>
    </div>
    <div class="amt" style="color:var(--${masuk ? 'masuk' : 'keluar'})">
      ${masuk ? '+' : '−'}${esc(rupiah(b.nilai))}
      <span class="sub">${masuk ? 'masuk' : 'keluar'}</span>
    </div>
  </a>`;
}
