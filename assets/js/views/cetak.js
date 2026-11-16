// Laporan siap cetak. Tombol Cetak memakai dialog cetak browser, jadi bisa
// disimpan sebagai PDF tanpa pustaka tambahan.

import { data } from '../store.js';
import { aktif, rekapAcara, prioritasBalas, cariEntri, deskripsiEntri, ARAH } from '../model.js';
import { rupiah, esc, tanggal, tanggalPanjang, hariIni, LABEL_JENIS_ACARA, LABEL_HUBUNGAN } from '../fmt.js';
import { judul, kosong, opsi, pada } from '../ui.js';
import { gantiTanpaRiwayat, querystring } from '../router.js';

export const judulHalaman = 'Cetak';

export function render(host, ctx) {
  const d = data();
  const jenis = ctx.query.jenis || (ctx.query.acara ? 'acara' : 'utang');
  const acaraId = ctx.query.acara || (aktif(d.events)[0]?.id || '');

  host.innerHTML = `
    ${judul('Cetak laporan', 'Pilih laporan, lalu tekan Cetak dan simpan sebagai PDF.')}
    <div class="toolbar no-print" id="pilih">
      <div class="filters">
        <select name="jenis" aria-label="Jenis laporan" style="grid-column:span 2">
          ${opsi([
            ['utang', 'Daftar utang balas budi'],
            ['acara', 'Rekap satu acara'],
            ['semua', 'Semua catatan'],
          ], jenis)}
        </select>
        <button class="btn btn-primary btn-sm" type="button" id="btn-cetak">Cetak</button>
      </div>
      ${jenis === 'acara' ? `
        <select name="acara" aria-label="Acara">
          ${opsi(aktif(d.events)
            .sort((a, b) => String(b.tanggal || '').localeCompare(String(a.tanggal || '')))
            .map((a) => [a.id, `${a.nama} — ${tanggal(a.tanggal)}`]), acaraId)}
        </select>` : ''}
    </div>
    <div id="laporan">${laporan(d, jenis, acaraId)}</div>`;

  pada(host, '#btn-cetak', 'click', () => window.print());
  pada(host, '#pilih select', 'change', () => {
    const baru = {
      jenis: host.querySelector('[name="jenis"]').value,
      acara: host.querySelector('[name="acara"]')?.value || ctx.query.acara || '',
    };
    gantiTanpaRiwayat(`/cetak${querystring(baru)}`);
    ctx.gambarUlang({ query: baru });
  });
}

function kepala(d, judulLaporan, keterangan) {
  const nama = d.settings.namaSaya;
  return `
  <div class="card flat">
    <h1 style="margin-bottom:.1rem">${esc(judulLaporan)}</h1>
    <p class="sub small muted">
      ${nama ? `${esc(nama)} &middot; ` : ''}${esc(keterangan)}<br>
      <span class="print-only">Dicetak ${esc(tanggalPanjang(hariIni()))} dari aplikasi Catat Balik</span>
    </p>
  </div>`;
}

function laporan(d, jenis, acaraId) {
  if (jenis === 'acara') return lapAcara(d, acaraId);
  if (jenis === 'semua') return lapSemua(d);
  return lapUtang(d);
}

function lapUtang(d) {
  const prio = prioritasBalas(d);
  if (!prio.length) return kosong('Tidak ada utang balas budi yang tersisa.');
  const total = prio.reduce((t, s) => t + s.saldo, 0);
  const totalSaran = prio.reduce((t, s) => t + s.saran, 0);
  return `
  ${kepala(d, 'Daftar Utang Balas Budi', `${prio.length} orang · total ${rupiah(total)}`)}
  <div class="card">
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>#</th><th>Nama</th><th>Keterangan</th>
            <th class="num">Masuk</th><th class="num">Sudah dibalas</th>
            <th class="num">Sisa</th><th class="num">Saran</th>
          </tr>
        </thead>
        <tbody>
          ${prio.map((s, i) => `
            <tr>
              <td class="num">${i + 1}</td>
              <td>${esc(s.orang.nama)}</td>
              <td>${esc([LABEL_HUBUNGAN[s.orang.hubungan], s.orang.alamat, s.orang.telepon].filter(Boolean).join(' · '))}</td>
              <td class="num">${esc(rupiah(s.masuk))}</td>
              <td class="num">${esc(rupiah(s.keluar))}</td>
              <td class="num">${esc(rupiah(s.saldo))}</td>
              <td class="num">${esc(rupiah(s.saran))}</td>
            </tr>`).join('')}
        </tbody>
        <tfoot>
          <tr><td colspan="5">Total</td><td class="num">${esc(rupiah(total))}</td><td class="num">${esc(rupiah(totalSaran))}</td></tr>
        </tfoot>
      </table>
    </div>
  </div>`;
}

function lapAcara(d, acaraId) {
  const r = rekapAcara(d, acaraId);
  if (!r.acara) return kosong('Acara belum dipilih atau sudah dihapus.');
  const tuanRumah = r.acara.person_id ? d.people.find((p) => p.id === r.acara.person_id) : null;
  return `
  ${kepala(d, `Rekap ${r.acara.nama}`, [
    LABEL_JENIS_ACARA[r.acara.jenis],
    tanggalPanjang(r.acara.tanggal),
    r.acara.lokasi,
    r.acara.pihak === 'saya' ? 'acara saya' : `tuan rumah: ${tuanRumah?.nama || 'orang lain'}`,
  ].filter(Boolean).join(' · '))}
  <div class="stats">
    <div class="stat"><div class="label">Catatan</div><div class="value">${r.nTamu}</div></div>
    <div class="stat"><div class="label">Uang</div><div class="value">${esc(rupiah(r.uang))}</div></div>
    <div class="stat"><div class="label">Barang</div><div class="value">${esc(rupiah(r.barang))}</div></div>
    <div class="stat"><div class="label">Total</div><div class="value">${esc(rupiah(r.total))}</div></div>
  </div>
  ${r.baris.length ? `
  <div class="card">
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>#</th><th>Nama</th><th>Alamat</th><th>Pemberian</th><th class="num">Nilai</th><th>Catatan</th></tr></thead>
        <tbody>
          ${r.baris.map((b, i) => `
            <tr>
              <td class="num">${i + 1}</td>
              <td>${esc(b.orang?.nama || '(orang terhapus)')}</td>
              <td>${esc(b.orang?.alamat || '')}</td>
              <td>${esc(deskripsiEntri(b.entri))}</td>
              <td class="num">${esc(rupiah(b.nilai))}</td>
              <td>${esc(b.entri.catatan || '')}</td>
            </tr>`).join('')}
        </tbody>
        <tfoot><tr><td colspan="4">Total</td><td class="num">${esc(rupiah(r.total))}</td><td></td></tr></tfoot>
      </table>
    </div>
  </div>` : kosong('Belum ada catatan di acara ini.')}`;
}

function lapSemua(d) {
  const { baris, total } = cariEntri(d, { urut: 'tanggal-naik' });
  if (!baris.length) return kosong('Belum ada catatan.');
  return `
  ${kepala(d, 'Semua Catatan', `${baris.length} catatan · nilai ${rupiah(total)}`)}
  <div class="card">
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>Tanggal</th><th>Arah</th><th>Nama</th><th>Acara</th><th>Pemberian</th><th class="num">Nilai</th><th>Status</th></tr></thead>
        <tbody>
          ${baris.map((b) => `
            <tr>
              <td>${esc(tanggal(b.entri.tanggal))}</td>
              <td>${b.entri.arah === ARAH.MASUK ? 'Masuk' : 'Keluar'}</td>
              <td>${esc(b.orang?.nama || '-')}</td>
              <td>${esc(b.acara?.nama || '')}</td>
              <td>${esc(deskripsiEntri(b.entri))}</td>
              <td class="num">${esc(rupiah(b.nilai))}</td>
              <td>${esc({ belum: 'Belum dibalas', dibalas: 'Sudah dibalas', balasan: 'Balasan', keluar: 'Pemberian' }[b.status] || '')}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}
