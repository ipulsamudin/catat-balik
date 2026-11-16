// Dukungan berkas .xlsx lewat SheetJS yang dimuat saat dibutuhkan saja.
// Sengaja TIDAK di-precache service worker: pustakanya besar dan hanya perlu
// saat pengguna benar-benar memilih berkas Excel. Offline -> pakai CSV.

const CDN = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/package/dist/xlsx.full.min.js';
const PESAN_OFFLINE = 'Dukungan .xlsx perlu internet sekali untuk memuat pustakanya. Sedang offline — pakai format CSV dulu.';

let pemuat = null;

export function xlsxSiap() {
  return typeof window !== 'undefined' && !!window.XLSX;
}

export function muatSheetJS() {
  if (xlsxSiap()) return Promise.resolve(window.XLSX);
  if (!navigator.onLine) return Promise.reject(new Error(PESAN_OFFLINE));
  if (!pemuat) {
    pemuat = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = CDN;
      s.async = true;
      s.onload = () => (window.XLSX ? resolve(window.XLSX) : reject(new Error('Pustaka Excel gagal dimuat.')));
      s.onerror = () => { pemuat = null; reject(new Error('Pustaka Excel gagal diunduh. Coba lagi atau pakai CSV.')); };
      document.head.appendChild(s);
    });
  }
  return pemuat;
}

/** Baca lembar pertama .xlsx menjadi {judul, baris} seperti hasil parseDelimited. */
export async function bacaXlsx(file) {
  const XLSX = await muatSheetJS();
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: false });
  const lembar = wb.Sheets[wb.SheetNames[0]];
  if (!lembar) throw new Error('Berkas Excel tidak punya lembar data.');
  const matriks = XLSX.utils.sheet_to_json(lembar, { header: 1, raw: false, defval: '' });
  const isi = matriks.filter((b) => b.some((x) => String(x).trim() !== ''));
  if (!isi.length) return { judul: [], baris: [] };
  return {
    judul: isi[0].map((h) => String(h).trim()),
    baris: isi.slice(1).map((b) => b.map((x) => String(x).trim())),
  };
}

/** lembar: [{nama, kolom: [[kunci, judul]], rows: [obj]}] */
export async function unduhXlsx(namaFile, lembar) {
  const XLSX = await muatSheetJS();
  const wb = XLSX.utils.book_new();
  for (const l of lembar) {
    const aoa = [l.kolom.map(([, judul]) => judul)];
    for (const r of l.rows) aoa.push(l.kolom.map(([k]) => (r[k] === null || r[k] === undefined ? '' : r[k])));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), l.nama.slice(0, 31));
  }
  XLSX.writeFile(wb, namaFile);
}
