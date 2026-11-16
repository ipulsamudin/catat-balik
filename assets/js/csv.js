// Ekspor & impor berkas teks. Murni (tanpa DOM) supaya bisa diuji di Node.
// Ekspor memakai BOM UTF-8 agar Excel di Windows membaca karakter Indonesia
// dengan benar, dan pemisah bisa dipilih (Excel lokal id-ID umumnya pakai ";").

import { aktif, nilaiEntri, petaById, idSudahDibalas, ARAH, JENIS } from './model.js';
import { hariIni, LABEL_HUBUNGAN, LABEL_JENIS_ACARA } from './fmt.js';

const BOM = '﻿';

// ---------- tulis ----------

function sel(nilai, pemisah) {
  const s = nilai === null || nilai === undefined ? '' : String(nilai);
  return /["\r\n]/.test(s) || s.includes(pemisah)
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

/** rows: array objek; kolom: [[kunci, judul], ...] */
export function toCsv(rows, kolom, { pemisah = ';', bom = true } = {}) {
  const baris = [kolom.map(([, judul]) => sel(judul, pemisah)).join(pemisah)];
  for (const r of rows) {
    baris.push(kolom.map(([kunci]) => sel(r[kunci], pemisah)).join(pemisah));
  }
  return (bom ? BOM : '') + baris.join('\r\n') + '\r\n';
}

export function deteksiPemisah(teks) {
  // Pakai baris pertama yang berisi: tab menang (tempelan dari Excel), lalu ";", lalu ",".
  const barisPertama = String(teks || '').split(/\r?\n/).find((b) => b.trim()) || '';
  const kandidat = ['\t', ';', ','].map((c) => [c, barisPertama.split(c).length - 1]);
  kandidat.sort((a, b) => b[1] - a[1]);
  return kandidat[0][1] > 0 ? kandidat[0][0] : ';';
}

/** Parser CSV/TSV: menghormati tanda kutip, kutip ganda, dan CRLF. */
export function parseDelimited(teks, pemisah) {
  let s = String(teks || '');
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  const sep = pemisah || deteksiPemisah(s);

  const baris = [];
  let kolom = [];
  let buf = '';
  let dalamKutip = false;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (dalamKutip) {
      if (c === '"') {
        if (s[i + 1] === '"') { buf += '"'; i++; }
        else dalamKutip = false;
      } else buf += c;
      continue;
    }
    if (c === '"') { dalamKutip = true; continue; }
    if (c === sep) { kolom.push(buf); buf = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') { kolom.push(buf); baris.push(kolom); kolom = []; buf = ''; continue; }
    buf += c;
  }
  kolom.push(buf);
  baris.push(kolom);

  const isi = baris.filter((b) => b.some((x) => String(x).trim() !== ''));
  if (!isi.length) return { pemisah: sep, judul: [], baris: [] };

  const judul = isi[0].map((h) => String(h).trim());
  return { pemisah: sep, judul, baris: isi.slice(1).map((b) => b.map((x) => String(x).trim())) };
}

// ---------- bentuk baris ekspor ----------

export const KOLOM_ENTRI = [
  ['tanggal', 'Tanggal'],
  ['arah', 'Arah'],
  ['nama', 'Nama'],
  ['acara', 'Acara'],
  ['jenis', 'Jenis'],
  ['nominal', 'Nominal'],
  ['barang', 'Barang'],
  ['jumlah', 'Jumlah'],
  ['satuan', 'Satuan'],
  ['nilai_taksir', 'Taksiran nilai'],
  ['nilai', 'Nilai dihitung'],
  ['status', 'Status'],
  ['catatan', 'Catatan'],
];

export function barisEntri(d) {
  const orang = petaById(aktif(d.people));
  const acara = petaById(aktif(d.events));
  const dibalas = idSudahDibalas(d.entries);
  return aktif(d.entries)
    .slice()
    .sort((a, b) => String(a.tanggal || '').localeCompare(String(b.tanggal || '')))
    .map((e) => ({
      tanggal: e.tanggal || '',
      arah: e.arah === ARAH.MASUK ? 'Masuk' : 'Keluar',
      nama: orang.get(e.person_id)?.nama || '(tidak diketahui)',
      acara: e.event_id ? (acara.get(e.event_id)?.nama || '') : '',
      jenis: e.jenis === JENIS.UANG ? 'Uang' : 'Barang',
      nominal: e.jenis === JENIS.UANG ? (e.nominal || 0) : '',
      barang: e.barang_nama || '',
      jumlah: e.barang_jumlah ?? '',
      satuan: e.barang_satuan || '',
      nilai_taksir: e.jenis === JENIS.BARANG ? (e.nilai_taksir || 0) : '',
      nilai: nilaiEntri(e),
      status: e.arah === ARAH.MASUK
        ? (dibalas.has(e.id) ? 'Sudah dibalas' : 'Belum dibalas')
        : (e.balas_untuk_id ? 'Balasan' : 'Pemberian'),
      catatan: e.catatan || '',
    }));
}

export const KOLOM_ORANG = [
  ['nama', 'Nama'],
  ['hubungan', 'Hubungan'],
  ['telepon', 'Telepon'],
  ['alamat', 'Alamat'],
  ['masuk', 'Total masuk'],
  ['keluar', 'Total keluar'],
  ['saldo', 'Perlu dibalas'],
  ['catatan', 'Catatan'],
];

export function barisOrang(neraca) {
  return neraca.map((s) => ({
    nama: s.orang.nama,
    hubungan: LABEL_HUBUNGAN[s.orang.hubungan] || '',
    telepon: s.orang.telepon || '',
    alamat: s.orang.alamat || '',
    masuk: s.masuk,
    keluar: s.keluar,
    saldo: s.saldo > 0 ? s.saldo : 0,
    catatan: s.orang.catatan || '',
  }));
}

export const KOLOM_ACARA = [
  ['nama', 'Acara'],
  ['jenis', 'Jenis'],
  ['tanggal', 'Tanggal'],
  ['pihak', 'Tuan rumah'],
  ['lokasi', 'Lokasi'],
];

export function barisAcara(d) {
  const orang = petaById(aktif(d.people));
  return aktif(d.events).map((a) => ({
    nama: a.nama,
    jenis: LABEL_JENIS_ACARA[a.jenis] || '',
    tanggal: a.tanggal || '',
    pihak: a.pihak === 'saya' ? 'Saya' : (orang.get(a.person_id)?.nama || 'Orang lain'),
    lokasi: a.lokasi || '',
  }));
}

/** Contoh berkas impor, supaya pengguna tahu kolom yang diharapkan. */
export function templateImpor(pemisah = ';') {
  return toCsv([
    { tanggal: hariIni(), arah: 'Masuk', nama: 'Budi Santoso', acara: 'Pernikahan Dina', jenis: 'Uang', nominal: 200000, barang: '', jumlah: '', satuan: '', nilai_taksir: '', catatan: 'tetangga RT 03' },
    { tanggal: hariIni(), arah: 'Masuk', nama: 'Siti Aminah', acara: 'Pernikahan Dina', jenis: 'Barang', nominal: '', barang: 'Gula', jumlah: 5, satuan: 'kg', nilai_taksir: 90000, catatan: '' },
  ], KOLOM_ENTRI.filter(([k]) => k !== 'nilai' && k !== 'status'), { pemisah });
}

// ---------- backup ----------

export function backupObjek(state) {
  return {
    aplikasi: 'catat-balik',
    versi: 1,
    diekspor_pada: new Date().toISOString(),
    people: state.people,
    events: state.events,
    entries: state.entries,
    settings: { ...state.settings, supabaseUrl: undefined, anonKey: undefined },
  };
}

export function bacaBackup(teks) {
  const obj = JSON.parse(teks);
  if (!obj || typeof obj !== 'object') throw new Error('Berkas tidak dikenali.');
  if (obj.aplikasi && obj.aplikasi !== 'catat-balik') throw new Error('Berkas ini bukan backup Catat Balik.');
  for (const t of ['people', 'events', 'entries']) {
    if (obj[t] && !Array.isArray(obj[t])) throw new Error(`Bagian "${t}" pada berkas rusak.`);
  }
  return {
    people: obj.people || [],
    events: obj.events || [],
    entries: obj.entries || [],
    settings: obj.settings || {},
  };
}

export function namaFile(awalan, ext) {
  return `${awalan}-${hariIni()}.${ext}`;
}
