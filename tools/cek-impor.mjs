// Pemeriksa statis untuk proyek tanpa bundler.
// Tanpa build step tidak ada yang memvalidasi jalur import — satu typo baru
// ketahuan saat halaman dibuka. Skrip ini memeriksanya lebih awal:
//
//   1. setiap import relatif menunjuk berkas yang benar-benar ada;
//   2. setiap nama yang diimpor memang diekspor oleh berkas tujuan;
//   3. daftar precache di sw.js cocok dengan berkas yang ada;
//   4. berkas yang dirujuk index.html ada.
//
// Jalankan: node tools/cek-impor.mjs

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const AKAR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const galat = [];
const peringatan = [];

function berkasJs(dir) {
  const out = [];
  for (const nama of readdirSync(dir)) {
    const p = join(dir, nama);
    if (statSync(p).isDirectory()) out.push(...berkasJs(p));
    else if (nama.endsWith('.js')) out.push(p);
  }
  return out;
}

function ekspor(isi) {
  const nama = new Set();
  for (const m of isi.matchAll(/export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z0-9_$]+)/g)) nama.add(m[1]);
  for (const m of isi.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const bagian of m[1].split(',')) {
      const t = bagian.trim();
      if (!t) continue;
      const cocok = t.match(/(?:\S+)\s+as\s+([A-Za-z0-9_$]+)$/);
      nama.add(cocok ? cocok[1] : t);
    }
  }
  if (/export\s+default/.test(isi)) nama.add('default');
  return nama;
}

function impor(isi) {
  const hasil = [];
  const pola = /import\s+([^'"]*?)\s*from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const m of isi.matchAll(pola)) {
    const sumber = m[2] || m[3];
    const klausa = m[1] || '';
    const nama = [];
    const kurung = klausa.match(/\{([^}]*)\}/);
    if (kurung) {
      for (const bagian of kurung[1].split(',')) {
        const t = bagian.trim();
        if (!t) continue;
        nama.push(t.split(/\s+as\s+/)[0].trim());
      }
    }
    const bintang = /\*\s+as\s+[A-Za-z0-9_$]+/.test(klausa);
    hasil.push({ sumber, nama, bintang, klausa });
  }
  return hasil;
}

// ---------- 1 & 2: import antar modul ----------

const semua = berkasJs(join(AKAR, 'assets', 'js'));
const cacheEkspor = new Map();

const ambilEkspor = (p) => {
  if (!cacheEkspor.has(p)) cacheEkspor.set(p, ekspor(readFileSync(p, 'utf8')));
  return cacheEkspor.get(p);
};

for (const berkas of semua) {
  const isi = readFileSync(berkas, 'utf8');
  const rel = relative(AKAR, berkas).replace(/\\/g, '/');
  const dipakai = new Set();
  for (const m of isi.matchAll(/[A-Za-z0-9_$]+/g)) dipakai.add(m[0]);

  for (const imp of impor(isi)) {
    if (!imp.sumber.startsWith('.')) continue;
    const target = resolve(dirname(berkas), imp.sumber);
    if (!existsSync(target)) {
      galat.push(`${rel}: import "${imp.sumber}" tidak ditemukan`);
      continue;
    }
    const tersedia = ambilEkspor(target);
    for (const nama of imp.nama) {
      if (!tersedia.has(nama)) {
        galat.push(`${rel}: "${nama}" tidak diekspor oleh ${relative(AKAR, target).replace(/\\/g, '/')}`);
      }
      // Hitung pemakaian: muncul lebih dari sekali berarti dipakai di luar baris import.
      const kemunculan = (isi.match(new RegExp(`\\b${nama.replace(/\$/g, '\\$')}\\b`, 'g')) || []).length;
      if (kemunculan <= 1) peringatan.push(`${rel}: "${nama}" diimpor tapi tidak dipakai`);
    }
  }
}

// ---------- 3: daftar precache service worker ----------

const sw = readFileSync(join(AKAR, 'sw.js'), 'utf8');
const daftar = sw.match(/const ASET = \[([\s\S]*?)\];/);
if (!daftar) {
  galat.push('sw.js: daftar ASET tidak terbaca');
} else {
  const jalur = [...daftar[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  for (const j of jalur) {
    if (j === './' ) continue;
    if (!existsSync(join(AKAR, j))) galat.push(`sw.js: aset precache "${j}" tidak ada`);
  }
  // Modul aplikasi yang belum masuk precache akan gagal saat offline.
  for (const berkas of semua) {
    const rel = './' + relative(AKAR, berkas).replace(/\\/g, '/');
    if (!jalur.includes(rel)) galat.push(`sw.js: ${rel} belum masuk daftar precache`);
  }
}

// ---------- 4: rujukan di index.html ----------

const html = readFileSync(join(AKAR, 'index.html'), 'utf8');
for (const m of html.matchAll(/(?:href|src)="(\.\/[^"]+)"/g)) {
  if (!existsSync(join(AKAR, m[1]))) galat.push(`index.html: berkas "${m[1]}" tidak ada`);
}

// ---------- laporan ----------

for (const p of peringatan) console.warn(`  peringatan: ${p}`);
if (galat.length) {
  console.error(`\n  ${galat.length} MASALAH:\n`);
  for (const g of galat) console.error(`   - ${g}`);
  process.exit(1);
}
console.log(`\n  ${semua.length} modul diperiksa — semua import, aset precache, dan rujukan HTML valid.${peringatan.length ? ` (${peringatan.length} peringatan)` : ''}\n`);
