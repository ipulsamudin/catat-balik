// Form catat: satu layar untuk entri masuk maupun keluar, dioptimalkan untuk HP
// (keypad angka, tombol nominal cepat, autocomplete nama, simpan-lalu-lanjut).

import { data } from '../store.js';
import {
  pastikanOrang, simpanEntri, simpanAcara, cariEntriById, cariOrang,
  hapusBaris, orangAktif, acaraAktif, entriAktif,
} from '../db.js';
import { ARAH, JENIS, validasiEntri, idSudahDibalas, nilaiEntri, deskripsiEntri, cariOrangByNama, saranBalasan, hitungNeraca } from '../model.js';
import { esc, hariIni, ribuan, parseNominal, rupiah, tanggal, LABEL_JENIS_ACARA } from '../fmt.js';
import { judul, sukses, galat, konfirmasi, opsi, pada } from '../ui.js';
import { ke } from '../router.js';

export const judulHalaman = 'Catat';
export const autoReload = false; // jangan gambar ulang saat sinkron: form sedang diisi

let kotak = null;
let konteks = null;
let sedangEdit = null;

export function render(host, ctx) {
  kotak = host;
  konteks = ctx;
  sedangEdit = ctx.query.id ? cariEntriById(ctx.query.id) : null;

  host.innerHTML = `
    ${judul(sedangEdit ? 'Ubah catatan' : 'Catat sumbangan',
      sedangEdit ? 'Perubahan langsung memperbarui neraca.' : 'Isi nama dan nominal, sisanya opsional.')}
    <div id="area-form"></div>
    <datalist id="daftar-orang">
      ${orangAktif().map((p) => `<option value="${esc(p.nama)}"></option>`).join('')}
    </datalist>`;

  ikat();
  gambar(sedangEdit ? dariEntri(sedangEdit) : awal(ctx.query));
}

function awal(q) {
  const acaraSaya = acaraAktif()
    .filter((a) => a.pihak === 'saya')
    .sort((a, b) => String(b.tanggal || '').localeCompare(String(a.tanggal || '')));
  const balas = q.balas ? cariEntriById(q.balas) : null;
  const orang = balas ? cariOrang(balas.person_id) : (q.orang ? cariOrang(q.orang) : null);
  const arah = q.arah === ARAH.KELUAR || balas ? ARAH.KELUAR : ARAH.MASUK;

  let nominal = q.nominal ? parseNominal(q.nominal) : 0;
  if (balas && !nominal) {
    const d = data();
    const s = hitungNeraca(d).peta.get(balas.person_id);
    nominal = s ? saranBalasan(s.saldo, d.settings, s.tahunTunggu) : nilaiEntri(balas);
  }

  return {
    arah,
    jenis: JENIS.UANG,
    nama: orang ? orang.nama : '',
    event_id: q.acara || (arah === ARAH.MASUK && acaraSaya[0] ? acaraSaya[0].id : ''),
    tanggal: q.tanggal || hariIni(),
    nominal,
    barang_nama: '',
    barang_jumlah: '',
    barang_satuan: '',
    nilai_taksir: 0,
    balas_untuk_id: balas ? balas.id : '',
    catatan: '',
  };
}

function dariEntri(e) {
  const orang = cariOrang(e.person_id);
  return {
    arah: e.arah,
    jenis: e.jenis,
    nama: orang ? orang.nama : '',
    event_id: e.event_id || '',
    tanggal: e.tanggal || hariIni(),
    nominal: e.nominal || 0,
    barang_nama: e.barang_nama || '',
    barang_jumlah: e.barang_jumlah || '',
    barang_satuan: e.barang_satuan || '',
    nilai_taksir: e.nilai_taksir || 0,
    balas_untuk_id: e.balas_untuk_id || '',
    catatan: e.catatan || '',
  };
}

// ---------- render form ----------

function gambar(v) {
  const masuk = v.arah === ARAH.MASUK;
  const uang = v.jenis === JENIS.UANG;
  const area = kotak.querySelector('#area-form');

  area.innerHTML = `
  <form id="form-catat" novalidate>
    <div class="card">
      <div class="seg" data-tone="${masuk ? 'masuk' : 'keluar'}" style="margin-bottom:.8rem">
        <button type="button" data-arah="masuk" aria-pressed="${masuk}">Masuk (diterima)</button>
        <button type="button" data-arah="keluar" aria-pressed="${!masuk}">Keluar (saya beri)</button>
      </div>

      <label class="field">
        <span class="lbl">${masuk ? 'Diterima dari' : 'Diberikan kepada'} *</span>
        <input name="nama" list="daftar-orang" value="${esc(v.nama)}" required
               autocomplete="off" enterkeyhint="next" placeholder="Nama orang">
        <span class="hint">Nama baru otomatis ditambahkan ke daftar orang.</span>
      </label>

      <label class="field">
        <span class="lbl">Acara</span>
        <select name="event_id">${opsiAcara(v.event_id)}</select>
      </label>

      ${v.event_id === '__baru' ? formAcaraBaru(v) : ''}

      <label class="field">
        <span class="lbl">Tanggal *</span>
        <input type="date" name="tanggal" value="${esc(v.tanggal)}" required>
      </label>
    </div>

    <div class="card">
      <div class="seg" style="margin-bottom:.8rem">
        <button type="button" data-jenis="uang" aria-pressed="${uang}">Uang</button>
        <button type="button" data-jenis="barang" aria-pressed="${!uang}">Barang</button>
      </div>

      ${uang ? blokUang(v) : blokBarang(v)}
    </div>

    ${!masuk ? blokBalasan(v) : ''}

    <div class="card">
      <label class="field" style="margin:0">
        <span class="lbl">Catatan</span>
        <textarea name="catatan" rows="2" placeholder="mis. transfer BCA, diantar anaknya">${esc(v.catatan)}</textarea>
      </label>
    </div>

    <div class="btn-row">
      ${sedangEdit
        ? `<button class="btn btn-primary" type="submit" data-aksi="simpan">Simpan perubahan</button>
           <button class="btn btn-danger" type="button" data-aksi="hapus">Hapus</button>`
        : `<button class="btn btn-primary" type="submit" data-aksi="lanjut">Simpan &amp; catat lagi</button>
           <button class="btn" type="submit" data-aksi="tutup">Simpan &amp; tutup</button>`}
    </div>
  </form>`;

  if (!sedangEdit && !v.nama) area.querySelector('[name="nama"]')?.focus();
}

function opsiAcara(terpilih) {
  const semua = acaraAktif().sort((a, b) => String(b.tanggal || '').localeCompare(String(a.tanggal || '')));
  const saya = semua.filter((a) => a.pihak === 'saya');
  const lain = semua.filter((a) => a.pihak !== 'saya');
  const grup = (label, arr) => (arr.length
    ? `<optgroup label="${esc(label)}">${arr.map((a) => `<option value="${esc(a.id)}"${a.id === terpilih ? ' selected' : ''}>${esc(a.nama)} &mdash; ${esc(tanggal(a.tanggal))}</option>`).join('')}</optgroup>`
    : '');
  return [
    `<option value=""${!terpilih ? ' selected' : ''}>&mdash; Tanpa acara &mdash;</option>`,
    grup('Acara saya', saya),
    grup('Acara orang lain', lain),
    `<option value="__baru"${terpilih === '__baru' ? ' selected' : ''}>+ Buat acara baru&hellip;</option>`,
  ].join('');
}

function formAcaraBaru(v) {
  return `
  <div class="card flat" style="background:var(--surface-2);margin-bottom:.7rem">
    <h3>Acara baru</h3>
    <label class="field">
      <span class="lbl">Nama acara *</span>
      <input name="acara_nama" value="${esc(v.acara_nama || '')}" placeholder="mis. Pernikahan Dina &amp; Rizki">
    </label>
    <div class="fields-2">
      <label class="field">
        <span class="lbl">Jenis</span>
        <select name="acara_jenis">${opsi(Object.entries(LABEL_JENIS_ACARA), v.acara_jenis || 'pernikahan')}</select>
      </label>
      <label class="field">
        <span class="lbl">Tanggal</span>
        <input type="date" name="acara_tanggal" value="${esc(v.acara_tanggal || v.tanggal)}">
      </label>
    </div>
    <label class="field" style="margin:0">
      <span class="lbl">Tuan rumah</span>
      <select name="acara_pihak">
        ${opsi([['saya', 'Acara saya sendiri'], ['orang_lain', 'Acara orang lain']], v.acara_pihak || (v.arah === ARAH.MASUK ? 'saya' : 'orang_lain'))}
      </select>
    </label>
  </div>`;
}

function blokUang(v) {
  return `
  <label class="field" style="margin:0">
    <span class="lbl">Nominal *</span>
    <input name="nominal" inputmode="numeric" autocomplete="off" enterkeyhint="done"
           value="${v.nominal ? esc(ribuan(v.nominal)) : ''}" placeholder="0">
    <span class="hint">Rupiah. Boleh ditulis singkat: <em>100rb</em>, <em>1,5jt</em>.</span>
  </label>
  <div class="quick">
    ${[20000, 50000, 100000, 200000, 300000, 500000, 1000000]
      .map((n) => `<button type="button" data-nominal="${n}">${esc(ribuan(n))}</button>`).join('')}
  </div>`;
}

function blokBarang(v) {
  return `
  <label class="field">
    <span class="lbl">Barang *</span>
    <input name="barang_nama" value="${esc(v.barang_nama)}" placeholder="mis. Gula, Beras, Kipas angin" autocomplete="off">
  </label>
  <div class="fields-2">
    <label class="field">
      <span class="lbl">Jumlah</span>
      <input name="barang_jumlah" inputmode="decimal" value="${esc(v.barang_jumlah)}" placeholder="mis. 2">
    </label>
    <label class="field">
      <span class="lbl">Satuan</span>
      <input name="barang_satuan" value="${esc(v.barang_satuan)}" placeholder="kg / dus / buah" autocomplete="off">
    </label>
  </div>
  <label class="field" style="margin:0">
    <span class="lbl">Taksiran nilai</span>
    <input name="nilai_taksir" inputmode="numeric" value="${v.nilai_taksir ? esc(ribuan(v.nilai_taksir)) : ''}" placeholder="0">
    <span class="hint">Dipakai untuk menghitung neraca. Dikosongkan = dihitung Rp 0.</span>
  </label>`;
}

function blokBalasan(v) {
  const orang = cariOrangByNama(data().people, v.nama);
  if (!orang) {
    return `<div class="card flat small muted">Isi nama dulu untuk mengaitkan catatan ini sebagai balasan sumbangan yang pernah masuk.</div>`;
  }
  const dibalas = idSudahDibalas(data().entries);
  const belum = entriAktif()
    .filter((e) => e.person_id === orang.id && e.arah === ARAH.MASUK && (!dibalas.has(e.id) || e.id === v.balas_untuk_id))
    .sort((a, b) => String(a.tanggal).localeCompare(String(b.tanggal)));

  if (!belum.length) {
    return `<div class="card flat small muted">Tidak ada sumbangan masuk dari ${esc(orang.nama)} yang belum dibalas.</div>`;
  }
  return `
  <div class="card">
    <label class="field" style="margin:0">
      <span class="lbl">Balasan untuk</span>
      <select name="balas_untuk_id">
        <option value="">&mdash; Bukan balasan catatan tertentu &mdash;</option>
        ${belum.map((e) => `<option value="${esc(e.id)}"${e.id === v.balas_untuk_id ? ' selected' : ''}>${esc(tanggal(e.tanggal))} &middot; ${esc(deskripsiEntri(e))} &middot; ${esc(rupiah(nilaiEntri(e)))}</option>`).join('')}
      </select>
      <span class="hint">Mengaitkan membuat sumbangan itu bertanda &ldquo;sudah dibalas&rdquo;.</span>
    </label>
  </div>`;
}

// ---------- interaksi ----------

function ikat() {
  pada(kotak, '[data-arah]', 'click', (ev, btn) => {
    const v = baca();
    v.arah = btn.dataset.arah;
    if (v.arah === ARAH.MASUK) v.balas_untuk_id = '';
    gambar(v);
  });

  pada(kotak, '[data-jenis]', 'click', (ev, btn) => {
    const v = baca();
    v.jenis = btn.dataset.jenis;
    gambar(v);
  });

  pada(kotak, '[data-nominal]', 'click', (ev, btn) => {
    const input = kotak.querySelector('[name="nominal"]');
    if (!input) return;
    const tambah = Number(btn.dataset.nominal);
    const kini = parseNominal(input.value);
    input.value = ribuan(kini + tambah);
    input.focus();
  });

  // Format ribuan sambil mengetik supaya nominal besar tetap terbaca.
  kotak.addEventListener('input', (ev) => {
    const el = ev.target;
    if (el.name !== 'nominal' && el.name !== 'nilai_taksir') return;
    const angka = String(el.value).replace(/[^0-9]/g, '');
    el.value = angka ? ribuan(Number(angka)) : '';
  });

  // Nama berubah -> pilihan "balasan untuk" ikut diperbarui.
  kotak.addEventListener('change', (ev) => {
    if (ev.target.name === 'nama' || ev.target.name === 'event_id') gambar(baca());
  });

  pada(kotak, '[data-aksi="hapus"]', 'click', () => {
    if (!sedangEdit) return;
    if (!konfirmasi('Hapus catatan ini? Neraca akan ikut berubah.')) return;
    hapusBaris('entries', sedangEdit.id);
    sukses('Catatan dihapus.');
    ke(konteks.query.kembali || '/daftar');
  });

  kotak.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const aksi = ev.submitter?.dataset.aksi || 'tutup';
    simpan(aksi);
  });
}

function baca() {
  const form = kotak.querySelector('#form-catat');
  const v = { arah: ARAH.MASUK, jenis: JENIS.UANG };
  if (!form) return v;
  const g = (n) => form.querySelector(`[name="${n}"]`);
  const nilai = (n) => (g(n) ? String(g(n).value).trim() : '');

  v.arah = form.querySelector('[data-arah][aria-pressed="true"]')?.dataset.arah || ARAH.MASUK;
  v.jenis = form.querySelector('[data-jenis][aria-pressed="true"]')?.dataset.jenis || JENIS.UANG;
  v.nama = nilai('nama');
  v.event_id = nilai('event_id');
  v.tanggal = nilai('tanggal') || hariIni();
  v.nominal = parseNominal(nilai('nominal'));
  v.barang_nama = nilai('barang_nama');
  v.barang_jumlah = nilai('barang_jumlah');
  v.barang_satuan = nilai('barang_satuan');
  v.nilai_taksir = parseNominal(nilai('nilai_taksir'));
  v.balas_untuk_id = nilai('balas_untuk_id');
  v.catatan = nilai('catatan');
  v.acara_nama = nilai('acara_nama');
  v.acara_jenis = nilai('acara_jenis');
  v.acara_tanggal = nilai('acara_tanggal');
  v.acara_pihak = nilai('acara_pihak');
  return v;
}

function simpan(aksi) {
  const v = baca();

  if (!v.nama) { galat('Nama wajib diisi.'); kotak.querySelector('[name="nama"]')?.focus(); return; }

  let eventId = v.event_id || null;
  if (eventId === '__baru') {
    if (!v.acara_nama) { galat('Nama acara baru wajib diisi.'); return; }
    const acara = simpanAcara({
      nama: v.acara_nama,
      jenis: v.acara_jenis || 'pernikahan',
      tanggal: v.acara_tanggal || v.tanggal,
      pihak: v.acara_pihak || 'saya',
      person_id: v.acara_pihak === 'orang_lain' ? pastikanOrang(v.nama)?.id || null : null,
    });
    eventId = acara.id;
  }

  const orang = pastikanOrang(v.nama);
  const calon = {
    id: sedangEdit ? sedangEdit.id : undefined,
    arah: v.arah,
    person_id: orang.id,
    event_id: eventId,
    tanggal: v.tanggal,
    jenis: v.jenis,
    nominal: v.nominal,
    barang_nama: v.barang_nama,
    barang_jumlah: v.barang_jumlah,
    barang_satuan: v.barang_satuan,
    nilai_taksir: v.nilai_taksir,
    balas_untuk_id: v.balas_untuk_id,
    catatan: v.catatan,
  };

  const salah = validasiEntri({ ...calon, jenis: v.jenis });
  if (salah.length) { galat(salah[0]); return; }

  simpanEntri(calon);

  const ringkas = v.jenis === JENIS.UANG ? rupiah(v.nominal) : deskripsiEntri(calon);
  sukses(`${sedangEdit ? 'Perubahan disimpan' : 'Tersimpan'}: ${v.nama} &middot; ${ringkas}`.replace(/&middot;/g, '·'));

  if (sedangEdit) { ke(konteks.query.kembali || '/daftar'); return; }

  if (aksi === 'lanjut') {
    // Pertahankan konteks acara/tanggal/arah; kosongkan identitas & nilai.
    gambar({
      arah: v.arah,
      jenis: v.jenis,
      nama: '',
      event_id: eventId || '',
      tanggal: v.tanggal,
      nominal: 0,
      barang_nama: '',
      barang_jumlah: '',
      barang_satuan: '',
      nilai_taksir: 0,
      balas_untuk_id: '',
      catatan: '',
    });
    kotak.querySelector('[name="nama"]')?.focus();
  } else {
    ke('/daftar');
  }
}
