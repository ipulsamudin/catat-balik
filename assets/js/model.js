// Semua perhitungan neraca balas budi. Modul murni: menerima data, mengembalikan
// hasil hitungan, tidak menyentuh DOM maupun localStorage - supaya bisa diuji
// lewat `node tools/selftest.mjs`.

import { hariIni, selisihHari, normalNama } from './fmt.js';

export const ARAH = { MASUK: 'masuk', KELUAR: 'keluar' };
export const JENIS = { UANG: 'uang', BARANG: 'barang' };

/** Buang baris yang sudah dihapus (soft delete) - dipakai sebelum semua hitungan. */
export function aktif(rows) {
  return (rows || []).filter((r) => r && !r.deleted_at);
}

/**
 * Nilai rupiah sebuah entri. Barang memakai taksiran nilainya; barang tanpa
 * taksiran bernilai 0 supaya tidak mengarang angka ke dalam neraca.
 */
export function nilaiEntri(e) {
  if (!e) return 0;
  if (e.jenis === JENIS.BARANG) return Math.round(Number(e.nilai_taksir) || 0);
  return Math.round(Number(e.nominal) || 0);
}

/** "Uang" atau "2 kg Gula" */
export function deskripsiEntri(e) {
  if (!e) return '-';
  if (e.jenis === JENIS.UANG) return 'Uang';
  const jml = Number(e.barang_jumlah) || 0;
  const satuan = (e.barang_satuan || '').trim();
  const nama = (e.barang_nama || 'Barang').trim();
  const depan = jml > 0 ? `${String(jml).replace('.', ',')}${satuan ? ' ' + satuan : ''} ` : '';
  return (depan + nama).trim();
}

export function petaById(rows) {
  const m = new Map();
  for (const r of rows || []) m.set(r.id, r);
  return m;
}

/** Id entri masuk yang sudah ditunjuk oleh entri keluar sebagai balasan. */
export function idSudahDibalas(entries) {
  const s = new Set();
  for (const e of aktif(entries)) {
    if (e.arah === ARAH.KELUAR && e.balas_untuk_id) s.add(e.balas_untuk_id);
  }
  return s;
}

/**
 * Neraca per orang. saldo > 0 berarti saya masih berutang balas ke orang itu.
 * Mengembalikan array terurut nama, plus peta berdasarkan person_id.
 */
export function hitungNeraca(d, acuan = hariIni()) {
  const people = aktif(d.people);
  const entries = aktif(d.entries);
  const dibalas = idSudahDibalas(entries);
  const peta = new Map();

  const kosong = (orang) => ({
    orang,
    masuk: 0,
    keluar: 0,
    saldo: 0,
    nMasuk: 0,
    nKeluar: 0,
    entriMasuk: [],
    entriKeluar: [],
    masukBelumDibalas: [],
    terakhirMasuk: null,
    terakhirKeluar: null,
    tahunTunggu: 0,
  });

  for (const orang of people) peta.set(orang.id, kosong(orang));

  for (const e of entries) {
    if (!e.person_id) continue;
    let s = peta.get(e.person_id);
    if (!s) {
      // Entri menunjuk orang yang sudah dihapus: tetap dihitung dengan nama penanda
      // supaya total tidak diam-diam berubah.
      s = kosong({ id: e.person_id, nama: '(orang terhapus)', _hilang: true });
      peta.set(e.person_id, s);
    }
    const nilai = nilaiEntri(e);
    if (e.arah === ARAH.KELUAR) {
      s.keluar += nilai;
      s.nKeluar += 1;
      s.entriKeluar.push(e);
      if (!s.terakhirKeluar || (e.tanggal || '') > s.terakhirKeluar) s.terakhirKeluar = e.tanggal || null;
    } else {
      s.masuk += nilai;
      s.nMasuk += 1;
      s.entriMasuk.push(e);
      if (!s.terakhirMasuk || (e.tanggal || '') > s.terakhirMasuk) s.terakhirMasuk = e.tanggal || null;
      if (!dibalas.has(e.id)) s.masukBelumDibalas.push(e);
    }
  }

  for (const s of peta.values()) {
    s.saldo = s.masuk - s.keluar;
    s.entriMasuk.sort(urutTanggalTurun);
    s.entriKeluar.sort(urutTanggalTurun);
    s.masukBelumDibalas.sort(urutTanggalNaik);
    const tertua = s.masukBelumDibalas[0] || s.entriMasuk[s.entriMasuk.length - 1];
    s.tahunTunggu = tertua && tertua.tanggal
      ? Math.max(0, selisihHari(tertua.tanggal, acuan) / 365)
      : 0;
  }

  const list = [...peta.values()].sort((a, b) => a.orang.nama.localeCompare(b.orang.nama, 'id'));
  return { peta, list };
}

function urutTanggalTurun(a, b) { return String(b.tanggal || '').localeCompare(String(a.tanggal || '')); }
function urutTanggalNaik(a, b) { return String(a.tanggal || '').localeCompare(String(b.tanggal || '')); }

/**
 * Saran nominal balasan: saldo disesuaikan inflasi per tahun (opsional),
 * lalu dibulatkan ke ATAS ke kelipatan yang diatur pengguna.
 */
export function saranBalasan(saldo, settings = {}, tahunTunggu = 0) {
  const bulat = Math.max(1, Number(settings.pembulatan) || 1);
  const persen = Number(settings.penyesuaian) || 0;
  if (saldo <= 0) return 0;
  const faktor = persen ? Math.pow(1 + persen / 100, Math.max(0, tahunTunggu)) : 1;
  // Dibulatkan ke rupiah penuh dulu: tanpa ini sisa pecahan biner (mis.
  // 121000.00000000003) membuat pembulatan ke atas melompat satu kelipatan.
  const disesuaikan = Math.round(saldo * faktor);
  return Math.ceil(disesuaikan / bulat) * bulat;
}

/** Siapa yang masih harus dibalas, paling mendesak di atas. */
export function prioritasBalas(d, acuan = hariIni()) {
  const { list } = hitungNeraca(d, acuan);
  return list
    .filter((s) => s.saldo > 0)
    .map((s) => ({ ...s, saran: saranBalasan(s.saldo, d.settings, s.tahunTunggu) }))
    .sort((a, b) => {
      if (b.saldo !== a.saldo) return b.saldo - a.saldo;
      const ta = a.masukBelumDibalas[0]?.tanggal || '9999';
      const tb = b.masukBelumDibalas[0]?.tanggal || '9999';
      return ta.localeCompare(tb);
    });
}

export function ringkasan(d, acuan = hariIni()) {
  const { list } = hitungNeraca(d, acuan);
  const entries = aktif(d.entries);
  let totalMasuk = 0; let totalKeluar = 0; let perluDibalas = 0; let nPerluDibalas = 0;
  let barangMasuk = 0; let barangTanpaTaksiran = 0;

  for (const s of list) {
    totalMasuk += s.masuk;
    totalKeluar += s.keluar;
    if (s.saldo > 0) { perluDibalas += s.saldo; nPerluDibalas += 1; }
  }
  for (const e of entries) {
    if (e.jenis === JENIS.BARANG) {
      if (e.arah === ARAH.MASUK) barangMasuk += 1;
      if (!(Number(e.nilai_taksir) > 0)) barangTanpaTaksiran += 1;
    }
  }

  return {
    totalMasuk,
    totalKeluar,
    selisih: totalMasuk - totalKeluar,
    perluDibalas,
    nPerluDibalas,
    nOrang: aktif(d.people).length,
    nEntri: entries.length,
    nMasuk: entries.filter((e) => e.arah === ARAH.MASUK).length,
    nKeluar: entries.filter((e) => e.arah === ARAH.KELUAR).length,
    nAcara: aktif(d.events).length,
    barangMasuk,
    barangTanpaTaksiran,
  };
}

/** Acara orang lain yang belum lewat, lengkap dengan saldo & saran bawaan. */
export function agenda(d, acuan = hariIni(), batas = 6) {
  const { peta } = hitungNeraca(d, acuan);
  return aktif(d.events)
    .filter((ev) => ev.pihak === 'orang_lain' && ev.tanggal && ev.tanggal >= acuan)
    .sort((a, b) => a.tanggal.localeCompare(b.tanggal))
    .slice(0, batas)
    .map((ev) => {
      const s = ev.person_id ? peta.get(ev.person_id) : null;
      const saldo = s ? s.saldo : 0;
      return {
        acara: ev,
        orang: s ? s.orang : null,
        saldo,
        saran: saranBalasan(saldo, d.settings, s ? s.tahunTunggu : 0),
        sisaHari: selisihHari(acuan, ev.tanggal),
      };
    });
}

/** Rekap satu acara: daftar entri + total, untuk halaman cetak. */
export function rekapAcara(d, eventId) {
  const acara = aktif(d.events).find((ev) => ev.id === eventId) || null;
  const orang = petaById(aktif(d.people));
  const baris = aktif(d.entries)
    .filter((e) => e.event_id === eventId)
    .map((e) => ({ entri: e, orang: orang.get(e.person_id) || null, nilai: nilaiEntri(e) }))
    .sort((a, b) => (a.orang?.nama || '').localeCompare(b.orang?.nama || '', 'id'));

  let uang = 0; let barang = 0; let nBarang = 0;
  for (const b of baris) {
    if (b.entri.jenis === JENIS.UANG) uang += b.nilai;
    else { barang += b.nilai; nBarang += 1; }
  }
  return { acara, baris, uang, barang, total: uang + barang, nTamu: baris.length, nBarang };
}

/** Status sebuah entri untuk ditampilkan sebagai badge. */
export function statusEntri(e, dibalas) {
  if (e.arah === ARAH.KELUAR) return e.balas_untuk_id ? 'balasan' : 'keluar';
  return dibalas.has(e.id) ? 'dibalas' : 'belum';
}

/**
 * Pencarian + filter + urutan untuk halaman Daftar.
 * opts: {q, arah, jenis, eventId, personId, status, urut}
 */
export function cariEntri(d, opts = {}) {
  const orang = petaById(aktif(d.people));
  const acara = petaById(aktif(d.events));
  const dibalas = idSudahDibalas(d.entries);
  const q = normalNama(opts.q || '');

  let baris = aktif(d.entries).map((e) => ({
    entri: e,
    orang: orang.get(e.person_id) || null,
    acara: e.event_id ? acara.get(e.event_id) || null : null,
    nilai: nilaiEntri(e),
    status: statusEntri(e, dibalas),
  }));

  if (opts.arah) baris = baris.filter((b) => b.entri.arah === opts.arah);
  if (opts.jenis) baris = baris.filter((b) => b.entri.jenis === opts.jenis);
  if (opts.eventId) baris = baris.filter((b) => b.entri.event_id === opts.eventId);
  if (opts.personId) baris = baris.filter((b) => b.entri.person_id === opts.personId);
  if (opts.status === 'belum') baris = baris.filter((b) => b.status === 'belum');
  if (opts.status === 'dibalas') baris = baris.filter((b) => b.status === 'dibalas');
  if (q) {
    baris = baris.filter((b) => {
      const hay = normalNama([
        b.orang?.nama, b.orang?.alias, b.acara?.nama,
        b.entri.catatan, b.entri.barang_nama, b.entri.alamat,
      ].filter(Boolean).join(' '));
      return hay.includes(q);
    });
  }

  const urut = opts.urut || 'tanggal-turun';
  const cmp = {
    'tanggal-turun': (a, b) => String(b.entri.tanggal || '').localeCompare(String(a.entri.tanggal || '')),
    'tanggal-naik': (a, b) => String(a.entri.tanggal || '').localeCompare(String(b.entri.tanggal || '')),
    'nilai-turun': (a, b) => b.nilai - a.nilai,
    'nilai-naik': (a, b) => a.nilai - b.nilai,
    'nama': (a, b) => (a.orang?.nama || '').localeCompare(b.orang?.nama || '', 'id'),
  }[urut] || ((a, b) => 0);

  baris.sort(cmp);
  const total = baris.reduce((t, b) => t + b.nilai, 0);
  return { baris, total };
}

/** Cari orang berdasarkan nama (untuk impor & autocomplete). */
export function cariOrangByNama(people, nama) {
  const n = normalNama(nama);
  if (!n) return null;
  return aktif(people).find((p) => normalNama(p.nama) === n)
    || aktif(people).find((p) => p.alias && normalNama(p.alias) === n)
    || null;
}

/** Validasi entri sebelum disimpan. Mengembalikan array pesan (kosong = valid). */
export function validasiEntri(e) {
  const salah = [];
  if (!e.person_id) salah.push('Nama pemberi/penerima wajib diisi.');
  if (e.arah !== ARAH.MASUK && e.arah !== ARAH.KELUAR) salah.push('Arah catatan tidak valid.');
  if (!e.tanggal || !/^\d{4}-\d{2}-\d{2}$/.test(e.tanggal)) salah.push('Tanggal wajib diisi.');
  if (e.jenis === JENIS.UANG) {
    if (!(Number(e.nominal) > 0)) salah.push('Nominal uang harus lebih dari 0.');
  } else if (e.jenis === JENIS.BARANG) {
    if (!String(e.barang_nama || '').trim()) salah.push('Nama barang wajib diisi.');
  } else {
    salah.push('Jenis catatan tidak valid.');
  }
  return salah;
}
