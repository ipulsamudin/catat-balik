// Menu "Lainnya": acara, cetak, impor, ekspor, pengaturan.

import { st, data } from '../store.js';
import { hitungNeraca, ringkasan } from '../model.js';
import {
  toCsv, KOLOM_ENTRI, KOLOM_ORANG, KOLOM_ACARA,
  barisEntri, barisOrang, barisAcara, backupObjek, namaFile,
} from '../csv.js';
import { unduhXlsx } from '../xlsx.js';
import { esc, rupiah } from '../fmt.js';
import { judul, pada, sukses, galat, unduhFile } from '../ui.js';

export const judulHalaman = 'Lainnya';

const IKON = {
  acara: '<path d="M7 3v3M17 3v3"/><rect x="3.5" y="6" width="17" height="15" rx="2"/><path d="M3.5 11h17"/>',
  cetak: '<path d="M7 8V4h10v4"/><rect x="4" y="8" width="16" height="7" rx="2"/><path d="M7 15h10v5H7z"/>',
  impor: '<path d="M12 3v11"/><path d="M8 10l4 4 4-4"/><path d="M4 19h16"/>',
  ekspor: '<path d="M12 14V3"/><path d="M8 7l4-4 4 4"/><path d="M4 19h16"/>',
  setelan: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
};

const baris = (href, ikon, judulTeks, ket) => `
  <a class="item" href="${href}">
    <svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${IKON[ikon]}</svg>
    <div class="grow">
      <div class="ttl">${esc(judulTeks)}</div>
      <div class="meta">${esc(ket)}</div>
    </div>
  </a>`;

export function render(host) {
  const d = data();
  const r = ringkasan(d);

  host.innerHTML = `
    ${judul('Lainnya')}
    <div class="menu-list">
      ${baris('#/acara', 'acara', 'Acara', `${r.nAcara} acara tercatat`)}
      ${baris('#/cetak', 'cetak', 'Cetak laporan', 'Rekap acara, utang balas, semua catatan')}
      ${baris('#/impor', 'impor', 'Impor dari Excel/CSV', 'Tempel dari Excel atau pilih berkas')}
      ${baris('#/pengaturan', 'setelan', 'Pengaturan', 'Sinkron cloud, pembulatan, backup')}
    </div>

    <div class="section-head"><h2>Ekspor</h2></div>
    <div class="card">
      <p class="small muted">CSV memakai pemisah <strong>${esc(d.settings.pemisahCsv === ',' ? 'koma (,)' : 'titik koma (;)')}</strong>
      dan penanda UTF-8 agar langsung rapi di Excel. Ganti pemisah di <a href="#/pengaturan">Pengaturan</a>.</p>
      <div class="btn-row">
        <button class="btn" type="button" data-ekspor="entri">CSV catatan</button>
        <button class="btn" type="button" data-ekspor="orang">CSV per orang</button>
        <button class="btn" type="button" data-ekspor="acara">CSV acara</button>
      </div>
      <div class="btn-row mt">
        <button class="btn" type="button" data-ekspor="xlsx">Excel (.xlsx)</button>
        <button class="btn" type="button" data-ekspor="backup">Backup JSON</button>
      </div>
    </div>

    <div class="section-head"><h2>Isi data</h2></div>
    <div class="card small">
      <div class="row-between"><span class="muted">Orang</span><strong>${r.nOrang}</strong></div>
      <div class="row-between"><span class="muted">Catatan masuk</span><strong>${r.nMasuk}</strong></div>
      <div class="row-between"><span class="muted">Catatan keluar</span><strong>${r.nKeluar}</strong></div>
      <div class="row-between"><span class="muted">Total masuk</span><strong>${esc(rupiah(r.totalMasuk))}</strong></div>
      <div class="row-between"><span class="muted">Total keluar</span><strong>${esc(rupiah(r.totalKeluar))}</strong></div>
      <div class="row-between"><span class="muted">Perlu dibalas</span><strong>${esc(rupiah(r.perluDibalas))}</strong></div>
    </div>

    <p class="small muted" style="text-align:center">Catat Balik &middot; data Anda tersimpan di perangkat ini${d.settings.supabaseUrl ? ' dan tersinkron ke Supabase' : ''}.</p>`;

  pada(host, '[data-ekspor]', 'click', async (ev, btn) => {
    const jenis = btn.dataset.ekspor;
    const d2 = data();
    const pemisah = d2.settings.pemisahCsv || ';';
    try {
      if (jenis === 'entri') {
        unduhFile(namaFile('catat-balik-catatan', 'csv'), toCsv(barisEntri(d2), KOLOM_ENTRI, { pemisah }), 'text/csv;charset=utf-8');
      } else if (jenis === 'orang') {
        unduhFile(namaFile('catat-balik-per-orang', 'csv'), toCsv(barisOrang(hitungNeraca(d2).list), KOLOM_ORANG, { pemisah }), 'text/csv;charset=utf-8');
      } else if (jenis === 'acara') {
        unduhFile(namaFile('catat-balik-acara', 'csv'), toCsv(barisAcara(d2), KOLOM_ACARA, { pemisah }), 'text/csv;charset=utf-8');
      } else if (jenis === 'backup') {
        unduhFile(namaFile('catat-balik-backup', 'json'), JSON.stringify(backupObjek(st()), null, 2), 'application/json');
      } else if (jenis === 'xlsx') {
        btn.disabled = true;
        btn.textContent = 'Menyiapkan…';
        await unduhXlsx(namaFile('catat-balik', 'xlsx'), [
          { nama: 'Catatan', kolom: KOLOM_ENTRI, rows: barisEntri(d2) },
          { nama: 'Per Orang', kolom: KOLOM_ORANG, rows: barisOrang(hitungNeraca(d2).list) },
          { nama: 'Acara', kolom: KOLOM_ACARA, rows: barisAcara(d2) },
        ]);
      }
      sukses('Berkas diunduh.');
    } catch (err) {
      galat(err.message || 'Gagal mengekspor.');
    } finally {
      if (jenis === 'xlsx') { btn.disabled = false; btn.textContent = 'Excel (.xlsx)'; }
    }
  });
}
