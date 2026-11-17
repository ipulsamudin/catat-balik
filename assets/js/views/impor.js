// Impor dari Excel/CSV: tempel langsung dari Excel (TSV) atau pilih berkas.
// Kolom dipetakan dengan dugaan otomatis, selalu ada pratinjau sebelum disimpan.

import { data } from '../store.js';
import { pastikanOrang, simpanEntri, acaraAktif, entriAktif, simpanAcara } from '../db.js';
import { ARAH, JENIS, nilaiEntri, validasiEntri, cariOrangByNama } from '../model.js';
import { parseDelimited, templateImpor } from '../csv.js';
import { bacaXlsx } from '../xlsx.js';
import { esc, rupiah, hariIni, parseNominal, parseTanggalFleksibel, normalNama, tanggal } from '../fmt.js';
import { judul, pada, sukses, galat, banner, unduhFile, pilihFile, bacaTeks, opsi, tanya } from '../ui.js';
import { ke } from '../router.js';

export const judulHalaman = 'Impor';
export const autoReload = false;

// Kolom tujuan beserta kata kunci untuk dugaan otomatis.
const TUJUAN = [
  ['nama', 'Nama orang *', ['nama', 'name', 'tamu', 'pemberi', 'penyumbang', 'donatur']],
  ['tanggal', 'Tanggal', ['tanggal', 'date', 'tgl', 'waktu']],
  ['arah', 'Arah (masuk/keluar)', ['arah', 'jenis transaksi', 'tipe', 'direction']],
  ['acara', 'Acara', ['acara', 'event', 'hajatan']],
  ['jenis', 'Jenis (uang/barang)', ['jenis', 'bentuk', 'kategori']],
  ['nominal', 'Nominal uang', ['nominal', 'uang', 'jumlah uang', 'amount', 'rupiah', 'sumbangan']],
  ['barang', 'Nama barang', ['barang', 'item', 'nama barang']],
  ['jumlah', 'Jumlah barang', ['jumlah', 'qty', 'banyak']],
  ['satuan', 'Satuan', ['satuan', 'unit']],
  ['nilai_taksir', 'Taksiran nilai barang', ['taksir', 'nilai', 'estimasi', 'harga']],
  ['alamat', 'Alamat', ['alamat', 'address', 'rt', 'desa']],
  ['telepon', 'Telepon', ['telepon', 'hp', 'phone', 'wa']],
  ['catatan', 'Catatan', ['catatan', 'keterangan', 'note', 'ket']],
];

let sumber = null; // {judul: [], baris: [][]}
let peta = {};
let kotak = null;

export function render(host) {
  kotak = host;
  sumber = null;
  peta = {};
  gambar();
  ikat();
}

function gambar() {
  kotak.innerHTML = `
    ${judul('Impor dari Excel / CSV', 'Dua langkah: tempel atau pilih berkas, lalu cocokkan kolom.')}

    <div class="card">
      <h2>1. Ambil data</h2>
      <label class="field">
        <span class="lbl">Tempel dari Excel / Spreadsheet</span>
        <textarea id="tempel" rows="5" placeholder="Pilih sel di Excel lalu Ctrl+C, klik di sini dan Ctrl+V. Baris pertama harus berisi nama kolom."></textarea>
        <span class="hint">Tempelan Excel otomatis dibaca sebagai kolom bertab.</span>
      </label>
      <div class="btn-row">
        <button class="btn btn-primary" type="button" id="baca-tempel">Baca tempelan</button>
        <button class="btn" type="button" id="pilih-berkas">Pilih berkas (.csv / .xlsx)</button>
      </div>
      <p class="small muted mt">Belum punya format? <a href="#" id="unduh-template">Unduh contoh CSV</a>.</p>
    </div>

    <div id="area-peta"></div>`;
}

function ikat() {
  pada(kotak, '#baca-tempel', 'click', () => {
    const teks = kotak.querySelector('#tempel').value;
    if (!teks.trim()) { galat('Kotak tempelan masih kosong.'); return; }
    try {
      muat(parseDelimited(teks));
    } catch (err) {
      galat(err.message || 'Gagal membaca tempelan.');
    }
  });

  pada(kotak, '#pilih-berkas', 'click', async () => {
    const file = await pilihFile('.csv,.tsv,.txt,.xlsx,.xls');
    if (!file) return;
    try {
      if (/\.xlsx?$/i.test(file.name)) {
        banner('Memuat pustaka Excel…');
        muat(await bacaXlsx(file));
      } else {
        muat(parseDelimited(await bacaTeks(file)));
      }
    } catch (err) {
      galat(err.message || 'Gagal membaca berkas.');
    }
  });

  pada(kotak, '#unduh-template', 'click', (ev) => {
    ev.preventDefault();
    unduhFile('contoh-impor-catat-balik.csv', templateImpor(data().settings.pemisahCsv || ';'), 'text/csv;charset=utf-8');
  });

  // Delegasi untuk elemen yang muncul setelah data dibaca.
  pada(kotak, '#area-peta select, #area-peta input', 'change', () => {
    simpanPeta();
    gambarPratinjau();
  });

  // jalankanImpor kini async (dialog konfirmasi), jadi penolakannya harus
  // ditangkap di sini - kalau tidak, galat hilang tanpa jejak.
  pada(kotak, '#btn-impor', 'click', () => {
    jalankanImpor().catch((err) => galat(err && err.message ? err.message : String(err)));
  });
  pada(kotak, '#btn-ulang', 'click', () => { sumber = null; gambar(); });
}

function muat(hasil) {
  if (!hasil.judul.length || !hasil.baris.length) {
    galat('Data tidak terbaca. Pastikan baris pertama berisi nama kolom.');
    return;
  }
  sumber = hasil;
  peta = dugaPeta(hasil.judul);
  gambarPeta();
  banner(`${hasil.baris.length} baris terbaca.`, { durasi: 2500 });
}

function dugaPeta(judulKolom) {
  const p = {};
  const dipakai = new Set();
  for (const [kunci, , kataKunci] of TUJUAN) {
    const idx = judulKolom.findIndex((h, i) => {
      if (dipakai.has(i)) return false;
      const n = normalNama(h);
      return kataKunci.some((k) => n === normalNama(k) || n.includes(normalNama(k)));
    });
    if (idx >= 0) { p[kunci] = String(idx); dipakai.add(idx); }
    else p[kunci] = '';
  }
  return p;
}

function gambarPeta() {
  const acara = acaraAktif().sort((a, b) => String(b.tanggal || '').localeCompare(String(a.tanggal || '')));
  const opsiKolom = [['', '— tidak ada —'], ...sumber.judul.map((h, i) => [String(i), `${h || `kolom ${i + 1}`}`])];

  kotak.querySelector('#area-peta').innerHTML = `
    <div class="card">
      <h2>2. Cocokkan kolom</h2>
      <div class="map-grid">
        ${TUJUAN.map(([kunci, label]) => `
          <label for="map-${kunci}">${esc(label)}</label>
          <select id="map-${kunci}" data-map="${kunci}">${opsi(opsiKolom, peta[kunci] || '')}</select>`).join('')}
      </div>
    </div>

    <div class="card">
      <h2>3. Nilai bawaan</h2>
      <p class="small muted">Dipakai untuk baris yang kolomnya kosong atau tidak dipetakan.</p>
      <div class="fields-2">
        <label class="field">
          <span class="lbl">Arah</span>
          <select id="def-arah">${opsi([['masuk', 'Masuk (diterima)'], ['keluar', 'Keluar (saya beri)']], 'masuk')}</select>
        </label>
        <label class="field">
          <span class="lbl">Tanggal</span>
          <input type="date" id="def-tanggal" value="${esc(hariIni())}">
        </label>
      </div>
      <label class="field">
        <span class="lbl">Acara</span>
        <select id="def-acara">
          ${opsi([['', '— tanpa acara —'], ...acara.map((a) => [a.id, `${a.nama} — ${tanggal(a.tanggal)}`]), ['__baru', '+ Buat acara baru dari kolom Acara']], '')}
        </select>
        <span class="hint">Bila kolom Acara dipetakan dan pilihan ini &ldquo;buat acara baru&rdquo;, nama acara dari berkas akan dibuat otomatis.</span>
      </label>
      <label class="inline small">
        <input type="checkbox" id="izin-duplikat"> &nbsp;Izinkan baris yang sudah ada (nama + tanggal + nilai sama)
      </label>
    </div>

    <div id="area-pratinjau"></div>`;

  simpanPeta();
  gambarPratinjau();
}

function simpanPeta() {
  for (const el of kotak.querySelectorAll('[data-map]')) peta[el.dataset.map] = el.value;
}

function bawaan() {
  return {
    arah: kotak.querySelector('#def-arah')?.value || ARAH.MASUK,
    tanggal: kotak.querySelector('#def-tanggal')?.value || hariIni(),
    acara: kotak.querySelector('#def-acara')?.value || '',
    izinDuplikat: !!kotak.querySelector('#izin-duplikat')?.checked,
  };
}

/** Ubah baris mentah menjadi calon entri + alasan bila ditolak. */
function olah() {
  const def = bawaan();
  const d = data();
  const acaraPeta = new Map(acaraAktif().map((a) => [normalNama(a.nama), a]));
  const ambil = (baris, kunci) => {
    const idx = peta[kunci];
    if (idx === '' || idx === undefined) return '';
    return String(baris[Number(idx)] ?? '').trim();
  };

  const adaSama = (nama, tgl, nilai) => {
    const orang = cariOrangByNama(d.people, nama);
    if (!orang) return false;
    return entriAktif().some((e) => e.person_id === orang.id && e.tanggal === tgl && nilaiEntri(e) === nilai);
  };

  const hasil = [];
  for (const baris of sumber.baris) {
    const nama = ambil(baris, 'nama');
    const nominalTeks = ambil(baris, 'nominal');
    const barang = ambil(baris, 'barang');
    const taksirTeks = ambil(baris, 'nilai_taksir');
    const jenisTeks = normalNama(ambil(baris, 'jenis'));
    const arahTeks = normalNama(ambil(baris, 'arah'));
    const tglTeks = ambil(baris, 'tanggal');

    const jenis = jenisTeks.startsWith('barang') || (!jenisTeks && !nominalTeks && barang)
      ? JENIS.BARANG
      : (jenisTeks.startsWith('uang') || nominalTeks ? JENIS.UANG : (barang ? JENIS.BARANG : JENIS.UANG));

    const calon = {
      nama,
      arah: arahTeks.startsWith('keluar') ? ARAH.KELUAR : (arahTeks.startsWith('masuk') ? ARAH.MASUK : def.arah),
      tanggal: parseTanggalFleksibel(tglTeks) || def.tanggal,
      jenis,
      nominal: jenis === JENIS.UANG ? parseNominal(nominalTeks) : 0,
      barang_nama: jenis === JENIS.BARANG ? (barang || 'Barang') : null,
      barang_jumlah: ambil(baris, 'jumlah') || null,
      barang_satuan: ambil(baris, 'satuan') || null,
      nilai_taksir: jenis === JENIS.BARANG ? parseNominal(taksirTeks) : 0,
      catatan: ambil(baris, 'catatan') || null,
      _acaraNama: ambil(baris, 'acara'),
      _alamat: ambil(baris, 'alamat'),
      _telepon: ambil(baris, 'telepon'),
    };

    const masalah = [];
    if (!nama) masalah.push('nama kosong');
    const salah = validasiEntri({ ...calon, person_id: nama ? 'sementara' : null });
    for (const s of salah) if (!s.includes('Nama')) masalah.push(s.replace(/\.$/, '').toLowerCase());

    const nilai = jenis === JENIS.UANG ? calon.nominal : calon.nilai_taksir;
    if (!masalah.length && !def.izinDuplikat && adaSama(nama, calon.tanggal, nilai)) {
      masalah.push('sudah ada (duplikat)');
    }

    // Acara: dari kolom bila ada, kalau tidak pakai pilihan bawaan.
    calon._eventId = def.acara && def.acara !== '__baru' ? def.acara : null;
    if (calon._acaraNama && def.acara === '__baru') {
      const ada = acaraPeta.get(normalNama(calon._acaraNama));
      calon._eventId = ada ? ada.id : '__buat';
    }

    hasil.push({ calon, masalah, nilai });
  }
  return hasil;
}

function gambarPratinjau() {
  if (!sumber) return;
  const olahan = olah();
  const siap = olahan.filter((o) => !o.masalah.length);
  const tolak = olahan.filter((o) => o.masalah.length);
  const total = siap.reduce((t, o) => t + o.nilai, 0);

  kotak.querySelector('#area-pratinjau').innerHTML = `
    <div class="card">
      <h2>4. Pratinjau</h2>
      <p class="small">
        <strong>${siap.length} baris siap diimpor</strong> (nilai ${esc(rupiah(total))})
        ${tolak.length ? ` &middot; <span style="color:var(--danger)">${tolak.length} dilewati</span>` : ''}
      </p>
      <div class="preview-wrap">
        <table class="table">
          <thead><tr><th>#</th><th>Nama</th><th>Tanggal</th><th>Arah</th><th>Pemberian</th><th class="num">Nilai</th><th>Status</th></tr></thead>
          <tbody>
            ${olahan.slice(0, 30).map((o, i) => `
              <tr>
                <td class="num">${i + 1}</td>
                <td>${esc(o.calon.nama || '—')}</td>
                <td>${esc(o.calon.tanggal)}</td>
                <td>${esc(o.calon.arah)}</td>
                <td>${esc(o.calon.jenis === JENIS.UANG ? 'Uang' : (o.calon.barang_nama || 'Barang'))}</td>
                <td class="num">${esc(rupiah(o.nilai))}</td>
                <td>${o.masalah.length
                  ? `<span class="badge danger">${esc(o.masalah.join(', '))}</span>`
                  : '<span class="badge ok">siap</span>'}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      ${olahan.length > 30 ? `<p class="small muted mt">Menampilkan 30 dari ${olahan.length} baris.</p>` : ''}
      <div class="btn-row mt">
        <button class="btn btn-primary" type="button" id="btn-impor" ${siap.length ? '' : 'disabled'}>Impor ${siap.length} catatan</button>
        <button class="btn" type="button" id="btn-ulang">Mulai ulang</button>
      </div>
    </div>`;
}

async function jalankanImpor() {
  const olahan = olah();
  const siap = olahan.filter((o) => !o.masalah.length);
  if (!siap.length) { galat('Tidak ada baris yang bisa diimpor.'); return; }
  if (!await tanya(`Impor ${siap.length} catatan sekarang?`)) return;

  const def = bawaan();
  const cacheAcara = new Map();
  let masuk = 0;

  for (const { calon } of siap) {
    const orang = pastikanOrang(calon.nama, { alamat: calon._alamat || undefined, telepon: calon._telepon || undefined });
    if (!orang) continue;

    let eventId = calon._eventId;
    if (eventId === '__buat' && calon._acaraNama) {
      const kunci = normalNama(calon._acaraNama);
      if (!cacheAcara.has(kunci)) {
        const acara = simpanAcara({
          nama: calon._acaraNama,
          jenis: 'lainnya',
          tanggal: calon.tanggal,
          pihak: calon.arah === ARAH.MASUK ? 'saya' : 'orang_lain',
          person_id: calon.arah === ARAH.MASUK ? null : orang.id,
        });
        cacheAcara.set(kunci, acara.id);
      }
      eventId = cacheAcara.get(kunci);
    }
    if (eventId === '__buat') eventId = def.acara && def.acara !== '__baru' ? def.acara : null;

    simpanEntri({
      arah: calon.arah,
      person_id: orang.id,
      event_id: eventId || null,
      tanggal: calon.tanggal,
      jenis: calon.jenis,
      nominal: calon.nominal,
      barang_nama: calon.barang_nama,
      barang_jumlah: calon.barang_jumlah,
      barang_satuan: calon.barang_satuan,
      nilai_taksir: calon.nilai_taksir,
      catatan: calon.catatan,
    });
    masuk += 1;
  }

  sukses(`${masuk} catatan diimpor.`);
  ke('/daftar');
}
