// Pemformat angka, tanggal, dan teks - dipakai di semua view.
// Modul ini murni (tidak menyentuh DOM) supaya bisa diuji lewat Node.

const NF = new Intl.NumberFormat('id-ID');

const BULAN = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
];

const BULAN_PANJANG = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

/** 150000 -> "Rp 150.000" */
export function rupiah(n) {
  const v = Number(n) || 0;
  return (v < 0 ? '-Rp ' : 'Rp ') + NF.format(Math.abs(Math.round(v)));
}

/** 150000 -> "150.000" (tanpa prefix, untuk isi input) */
export function ribuan(n) {
  const v = Number(n) || 0;
  return NF.format(Math.abs(Math.round(v)));
}

/** 1250000 -> "1,25 jt" - untuk kartu ringkasan yang sempit */
export function rupiahSingkat(n) {
  const v = Math.round(Number(n) || 0);
  const abs = Math.abs(v);
  const tanda = v < 0 ? '-' : '';
  if (abs >= 1e9) return tanda + 'Rp ' + potong(abs / 1e9) + ' M';
  if (abs >= 1e6) return tanda + 'Rp ' + potong(abs / 1e6) + ' jt';
  if (abs >= 1e4) return tanda + 'Rp ' + potong(abs / 1e3) + ' rb';
  return rupiah(v);
}

function potong(x) {
  const s = x < 10 ? x.toFixed(2) : x < 100 ? x.toFixed(1) : String(Math.round(x));
  // Buang nol di belakang HANYA bila ada koma desimal, supaya 150 tidak jadi 15.
  const rapi = s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
  return rapi.replace('.', ',');
}

/** "150.000", "Rp 150rb", "150000" -> 150000 */
export function parseNominal(teks) {
  if (teks === null || teks === undefined) return 0;
  if (typeof teks === 'number') return Math.round(teks) || 0;
  let s = String(teks).toLowerCase().trim().replace(/rp/g, '').replace(/\s+/g, '');
  if (!s) return 0;
  let pengali = 1;
  if (/(rb|ribu|k)$/.test(s)) { pengali = 1000; s = s.replace(/(rb|ribu|k)$/, ''); }
  else if (/(jt|juta|m)$/.test(s)) { pengali = /m$/.test(s) ? 1e9 : 1e6; s = s.replace(/(jt|juta|m)$/, ''); }
  // Titik = pemisah ribuan (gaya Indonesia), koma = desimal.
  s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? Math.round(n * pengali) : 0;
}

/** "2026-11-16" -> "16 Nov 2026" */
export function tanggal(iso) {
  const p = pecahTanggal(iso);
  if (!p) return '-';
  return `${p.d} ${BULAN[p.m - 1]} ${p.y}`;
}

/** "2026-11-16" -> "16 November 2026" */
export function tanggalPanjang(iso) {
  const p = pecahTanggal(iso);
  if (!p) return '-';
  return `${p.d} ${BULAN_PANJANG[p.m - 1]} ${p.y}`;
}

function pecahTanggal(iso) {
  if (!iso || typeof iso !== 'string') return null;
  const m = iso.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return { y: +m[1], m: +m[2], d: +m[3] };
}

/**
 * Baca tanggal dari berbagai gaya tulisan (impor Excel/CSV) menjadi "YYYY-MM-DD".
 * Didukung: 2026-11-16, 16/11/2026, 16-11-2026, 16/11/26, 16 Nov 2026,
 * serta angka serial Excel (hari sejak 1899-12-30). Gagal baca -> null.
 */
export function parseTanggalFleksibel(teks) {
  const s = String(teks === null || teks === undefined ? '' : teks).trim();
  if (!s) return null;

  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return rakitTanggal(+m[1], +m[2], +m[3]);

  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (m) {
    let th = +m[3];
    if (th < 100) th += th < 70 ? 2000 : 1900;
    return rakitTanggal(th, +m[2], +m[1]); // hari dulu: gaya Indonesia
  }

  m = s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{2,4})$/);
  if (m) {
    const nama = m[2].toLowerCase().slice(0, 3);
    const idx = ['jan', 'feb', 'mar', 'apr', 'mei', 'jun', 'jul', 'agu', 'sep', 'okt', 'nov', 'des'].indexOf(nama);
    const idxEn = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(nama);
    const bulan = idx >= 0 ? idx + 1 : (idxEn >= 0 ? idxEn + 1 : 0);
    let th = +m[3];
    if (th < 100) th += th < 70 ? 2000 : 1900;
    if (bulan) return rakitTanggal(th, bulan, +m[1]);
  }

  if (/^\d{5}$/.test(s)) {
    const d = new Date(Date.UTC(1899, 11, 30) + Number(s) * 86400000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }

  return null;
}

function rakitTanggal(y, m, d) {
  if (!(y >= 1900 && y <= 2200) || !(m >= 1 && m <= 12) || !(d >= 1 && d <= 31)) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Tanggal lokal hari ini sebagai "YYYY-MM-DD" (bukan UTC, supaya tidak geser sehari). */
export function hariIni(d = new Date()) {
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Selisih hari antara dua tanggal "YYYY-MM-DD" (b - a). */
export function selisihHari(a, b) {
  const pa = pecahTanggal(a); const pb = pecahTanggal(b);
  if (!pa || !pb) return 0;
  const ms = Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d);
  return Math.round(ms / 86400000);
}

/** "3 hari lagi", "kemarin", "2 bulan lalu" */
export function jarakWaktu(iso, acuan = hariIni()) {
  const hari = selisihHari(acuan, iso);
  if (hari === 0) return 'hari ini';
  if (hari === 1) return 'besok';
  if (hari === -1) return 'kemarin';
  const abs = Math.abs(hari);
  const lagi = hari > 0;
  let teks;
  if (abs < 30) teks = `${abs} hari`;
  else if (abs < 365) teks = `${Math.round(abs / 30)} bulan`;
  else teks = `${(abs / 365).toFixed(1).replace('.0', '').replace('.', ',')} tahun`;
  return lagi ? `${teks} lagi` : `${teks} lalu`;
}

/** Jam sinkron terakhir: "14:05" atau "16 Nov 14:05" */
export function waktuSingkat(isoStamp) {
  if (!isoStamp) return '-';
  const d = new Date(isoStamp);
  if (Number.isNaN(d.getTime())) return '-';
  const jam = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return hariIni(d) === hariIni() ? jam : `${d.getDate()} ${BULAN[d.getMonth()]} ${jam}`;
}

/** Escape untuk interpolasi ke innerHTML. */
export function esc(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** "Budi Santoso" -> "BS" */
export function inisial(nama) {
  const bagian = String(nama || '?').trim().split(/\s+/).filter(Boolean);
  if (!bagian.length) return '?';
  if (bagian.length === 1) return bagian[0].slice(0, 2).toUpperCase();
  return (bagian[0][0] + bagian[bagian.length - 1][0]).toUpperCase();
}

/** Normalisasi nama untuk pencarian & pencocokan duplikat. */
export function normalNama(nama) {
  return String(nama || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  // Fallback untuk browser/konteks tanpa randomUUID.
  const b = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const LABEL_JENIS_ACARA = {
  pernikahan: 'Pernikahan',
  khitanan: 'Khitanan',
  aqiqah: 'Aqiqah / Kelahiran',
  syukuran: 'Syukuran',
  lainnya: 'Lainnya',
};

export const LABEL_HUBUNGAN = {
  keluarga: 'Keluarga',
  tetangga: 'Tetangga',
  kerja: 'Rekan kerja',
  teman: 'Teman',
  lainnya: 'Lainnya',
};
