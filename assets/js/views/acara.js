// Acara: milik saya (sumber entri masuk) dan milik orang lain (tujuan entri keluar).

import { data } from '../store.js';
import { simpanAcara, hapusAcara, cariAcara, jumlahEntriAcara, pastikanOrang, orangAktif } from '../db.js';
import { rekapAcara, aktif } from '../model.js';
import { rupiah, rupiahSingkat, esc, tanggal, jarakWaktu, hariIni, LABEL_JENIS_ACARA } from '../fmt.js';
import { judul, kosong, opsi, pada, sukses, galat, konfirmasi, nilaiForm } from '../ui.js';
import { ke } from '../router.js';

export const judulHalaman = 'Acara';

export function render(host, ctx) {
  if (ctx.params?.id) return detail(host, ctx);
  return daftar(host, ctx);
}

// ---------- daftar ----------

function daftar(host, ctx) {
  const d = data();
  const semua = aktif(d.events).sort((a, b) => String(b.tanggal || '').localeCompare(String(a.tanggal || '')));
  const saya = semua.filter((a) => a.pihak === 'saya');
  const lain = semua.filter((a) => a.pihak !== 'saya');

  host.innerHTML = `
    ${judul('Acara', `${saya.length} acara saya · ${lain.length} acara orang lain`)}
    <div class="btn-row no-print">
      <a class="btn ${ctx.query.tambah ? '' : 'btn-primary'}" href="#/acara?tambah=1">+ Acara baru</a>
      <a class="btn" href="#/cetak">Cetak rekap</a>
    </div>
    ${ctx.query.tambah ? form({ pihak: ctx.query.pihak || 'saya' }) : ''}
    ${bagian('Acara saya', saya, d)}
    ${bagian('Acara orang lain', lain, d)}
    ${!semua.length ? kosong('Belum ada acara. Acara bersifat opsional — catatan boleh dibuat tanpa acara.') : ''}`;

  ikatForm(host, ctx);
}

function bagian(label, arr, d) {
  if (!arr.length) return '';
  return `
  <div class="section-head"><h2>${esc(label)}</h2><span class="small muted">${arr.length}</span></div>
  <div class="list">
    ${arr.map((a) => {
      const r = rekapAcara(d, a.id);
      const akanDatang = a.tanggal && a.tanggal >= hariIni();
      return `
      <a class="item" href="#/acara/${esc(a.id)}">
        <div class="grow">
          <div class="ttl">${esc(a.nama)}${akanDatang ? ' <span class="badge masuk">akan datang</span>' : ''}</div>
          <div class="meta">
            ${esc(LABEL_JENIS_ACARA[a.jenis] || 'Acara')} &middot; ${esc(tanggal(a.tanggal))}
            ${a.tanggal ? ` (${esc(jarakWaktu(a.tanggal))})` : ''}
            ${a.lokasi ? ` &middot; ${esc(a.lokasi)}` : ''}
          </div>
        </div>
        <div class="amt">${esc(rupiahSingkat(r.total))}<span class="sub">${r.nTamu} catatan</span></div>
      </a>`;
    }).join('')}
  </div>`;
}

function form(a = {}) {
  const pihak = a.pihak === 'orang_lain' ? 'orang_lain' : 'saya';
  return `
  <div class="card">
    <h2>${a.id ? 'Ubah acara' : 'Acara baru'}</h2>
    <form id="form-acara">
      ${a.id ? `<input type="hidden" name="id" value="${esc(a.id)}">` : ''}
      <label class="field">
        <span class="lbl">Nama acara *</span>
        <input name="nama" value="${esc(a.nama || '')}" required autocomplete="off" placeholder="mis. Pernikahan Dina &amp; Rizki">
      </label>
      <div class="fields-2">
        <label class="field">
          <span class="lbl">Jenis</span>
          <select name="jenis">${opsi(Object.entries(LABEL_JENIS_ACARA), a.jenis || 'pernikahan')}</select>
        </label>
        <label class="field">
          <span class="lbl">Tanggal *</span>
          <input type="date" name="tanggal" value="${esc(a.tanggal || hariIni())}" required>
        </label>
      </div>
      <label class="field">
        <span class="lbl">Tuan rumah</span>
        <select name="pihak">${opsi([['saya', 'Saya sendiri'], ['orang_lain', 'Orang lain']], pihak)}</select>
        <span class="hint">Acara orang lain dipakai untuk mengingatkan Anda membawa balasan.</span>
      </label>
      <label class="field" id="wrap-host" ${pihak === 'saya' ? 'hidden' : ''}>
        <span class="lbl">Nama tuan rumah</span>
        <input name="host_nama" list="daftar-orang-acara" value="${esc(a._hostNama || '')}" autocomplete="off">
        <datalist id="daftar-orang-acara">${orangAktif().map((p) => `<option value="${esc(p.nama)}"></option>`).join('')}</datalist>
      </label>
      <label class="field">
        <span class="lbl">Lokasi</span>
        <input name="lokasi" value="${esc(a.lokasi || '')}" autocomplete="off">
      </label>
      <div class="btn-row">
        <button class="btn btn-primary" type="submit">Simpan</button>
        <a class="btn" href="${a.id ? `#/acara/${esc(a.id)}` : '#/acara'}">Batal</a>
      </div>
    </form>
  </div>`;
}

function ikatForm(host, ctx) {
  pada(host, '[name="pihak"]', 'change', (ev) => {
    const wrap = host.querySelector('#wrap-host');
    if (wrap) wrap.hidden = ev.target.value !== 'orang_lain';
  });

  pada(host, '#form-acara', 'submit', (ev) => {
    ev.preventDefault();
    const v = nilaiForm(ev.target);
    if (!v.nama) { galat('Nama acara wajib diisi.'); return; }
    let personId = null;
    if (v.pihak === 'orang_lain' && v.host_nama) personId = pastikanOrang(v.host_nama)?.id || null;
    const acara = simpanAcara({
      id: v.id || undefined,
      nama: v.nama,
      jenis: v.jenis,
      tanggal: v.tanggal,
      pihak: v.pihak,
      person_id: personId,
      lokasi: v.lokasi,
    });
    sukses(`Acara "${acara.nama}" disimpan.`);
    ke(`/acara/${acara.id}`);
  });
}

// ---------- detail ----------

function detail(host, ctx) {
  const acara = cariAcara(ctx.params.id);
  if (!acara || acara.deleted_at) {
    host.innerHTML = judul('Acara tidak ditemukan') + kosong('Acara ini sudah dihapus.', '<a class="btn" href="#/acara">Kembali</a>');
    return;
  }
  const d = data();
  const r = rekapAcara(d, acara.id);
  const tuanRumah = acara.person_id ? d.people.find((p) => p.id === acara.person_id) : null;

  if (ctx.query.ubah) {
    host.innerHTML = judul('Ubah acara') + form({ ...acara, _hostNama: tuanRumah?.nama || '' });
    ikatForm(host, ctx);
    return;
  }

  host.innerHTML = `
    ${judul(acara.nama, [
      LABEL_JENIS_ACARA[acara.jenis],
      tanggal(acara.tanggal),
      acara.pihak === 'saya' ? 'acara saya' : `tuan rumah: ${tuanRumah?.nama || 'orang lain'}`,
      acara.lokasi,
    ].filter(Boolean).join(' · '))}

    <div class="stats">
      <div class="stat"><div class="label">Total</div><div class="value">${esc(rupiahSingkat(r.total))}</div><div class="note">${r.nTamu} catatan</div></div>
      <div class="stat"><div class="label">Uang</div><div class="value masuk">${esc(rupiahSingkat(r.uang))}</div></div>
      <div class="stat"><div class="label">Barang</div><div class="value">${esc(rupiahSingkat(r.barang))}</div><div class="note">${r.nBarang} barang</div></div>
      <div class="stat"><div class="label">Rata-rata</div><div class="value">${esc(rupiahSingkat(r.nTamu ? r.total / r.nTamu : 0))}</div></div>
    </div>

    <div class="btn-row no-print">
      <a class="btn btn-primary" href="#/catat?acara=${esc(acara.id)}&arah=${acara.pihak === 'saya' ? 'masuk' : 'keluar'}">+ Catat di acara ini</a>
      <a class="btn" href="#/cetak?acara=${esc(acara.id)}">Cetak</a>
      <a class="btn" href="#/acara/${esc(acara.id)}?ubah=1">Ubah</a>
      <button class="btn btn-danger" type="button" id="hapus-acara">Hapus</button>
    </div>

    <div class="section-head"><h2>Catatan di acara ini</h2><a href="#/daftar?acara=${esc(acara.id)}">Buka di Daftar</a></div>
    ${r.baris.length ? `
      <div class="card">
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Nama</th><th>Pemberian</th><th class="num">Nilai</th></tr></thead>
            <tbody>
              ${r.baris.map((b) => `
                <tr>
                  <td>${esc(b.orang?.nama || '(orang terhapus)')}</td>
                  <td>${esc(b.entri.jenis === 'uang' ? 'Uang' : `${b.entri.barang_jumlah || ''} ${b.entri.barang_satuan || ''} ${b.entri.barang_nama || 'Barang'}`.trim())}</td>
                  <td class="num">${esc(rupiah(b.nilai))}</td>
                </tr>`).join('')}
            </tbody>
            <tfoot><tr><td colspan="2">Total</td><td class="num">${esc(rupiah(r.total))}</td></tr></tfoot>
          </table>
        </div>
      </div>` : kosong('Belum ada catatan di acara ini.')}
  `;

  pada(host, '#hapus-acara', 'click', () => {
    const n = jumlahEntriAcara(acara.id);
    const pesan = n
      ? `Hapus acara "${acara.nama}"? ${n} catatan di dalamnya TIDAK dihapus, hanya dilepas dari acara ini.`
      : `Hapus acara "${acara.nama}"?`;
    if (!konfirmasi(pesan)) return;
    hapusAcara(acara.id, { ikutEntri: false });
    sukses('Acara dihapus.');
    ke('/acara');
  });
}
