// Uji asap di browser sungguhan (Edge/Chrome headless), tanpa dependensi npm.
//
// Alasannya: proyek ini tidak punya build step, jadi kesalahan yang hanya muncul
// saat runtime browser (modul gagal dimuat, template rusak, hitungan tidak
// tampil) tidak akan ketahuan dari uji Node biasa. Skrip ini menyalakan server
// statis, mengisi localStorage dengan data contoh, lalu membuka setiap rute dan
// memeriksa isi DOM-nya.
//
// Jalankan: node tools/smoke.mjs

import { spawn, execFile } from 'node:child_process';
import { writeFileSync, copyFileSync, rmSync, existsSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { stateContoh } from './data-contoh.mjs';

const jalankan = promisify(execFile);
const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT_SMOKE) || 8771;
const ALAMAT = `http://localhost:${PORT}`;
const SEED = join(AKAR, '__smoke-seed.html');
const AKSI = join(AKAR, '__smoke-aksi.html');

const KANDIDAT_BROWSER = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

// rute, penanda yang HARUS ada
const RUTE = [
  ['#/', ['Masih harus dibalas', 'Rp 410.000', 'Siti Aminah', 'Khitanan Anak Agus', 'saran Rp 300 rb']],
  ['#/daftar', ['Daftar catatan', '7 catatan', 'belum dibalas', 'Kipas angin']],
  ['#/daftar?arah=keluar', ['Daftar catatan', '2 catatan']],
  ['#/daftar?status=belum', ['4 catatan']],
  ['#/catat', ['Catat sumbangan', 'Diterima dari', 'Simpan &amp; catat lagi', 'Pernikahan Dina']],
  ['#/catat?arah=keluar&orang=p-agus', ['Diberikan kepada', 'Agus Wijaya', 'Balasan untuk']],
  ['#/orang', ['Orang', 'Siti Aminah', 'lunas', '2 masih perlu dibalas']],
  ['#/orang/p-siti', ['Siti Aminah', 'Masih harus dibalas', 'Rp 290.000', 'Catat balasan', 'Riwayat']],
  ['#/orang/p-budi', ['Budi Santoso', 'Lunas']],
  ['#/orang?tambah=1', ['Tambah orang']],
  ['#/acara', ['Acara saya', 'Pernikahan Dina', 'Khitanan Anak Agus', 'akan datang']],
  ['#/acara/e-nikah', ['Pernikahan Dina', 'Rp 710.000', 'Budi Santoso']],
  ['#/acara?tambah=1', ['Acara baru', 'Tuan rumah']],
  ['#/cetak', ['Daftar Utang Balas Budi', 'Rp 410.000', 'Keluarga Uji']],
  ['#/cetak?jenis=acara&acara=e-nikah', ['Rekap Pernikahan Dina', 'Rp 710.000']],
  ['#/cetak?jenis=semua', ['Semua Catatan', 'Sudah dibalas']],
  ['#/impor', ['Impor dari Excel', 'Tempel dari Excel', 'Pilih berkas']],
  ['#/lainnya', ['CSV catatan', 'Backup JSON', 'Total masuk']],
  ['#/pengaturan', ['Sinkron cloud', 'Supabase Project URL', 'Pembulatan saran balasan', 'Hapus semua data lokal']],
  ['#/rute-ngawur', ['Halaman tidak ditemukan']],
];

const LARANGAN = ['Terjadi kesalahan', 'undefined</', '[object Object]', 'NaN'];

function cariBrowser() {
  for (const p of KANDIDAT_BROWSER) if (existsSync(p)) return p;
  return null;
}

async function dom(browser, profil, url) {
  const { stdout } = await jalankan(browser, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    `--user-data-dir=${profil}`,
    '--virtual-time-budget=5000',
    '--dump-dom',
    url,
  ], { timeout: 45000, maxBuffer: 32 * 1024 * 1024, windowsHide: true });
  return stdout;
}

async function tungguServer(batasMs = 10000) {
  const sampai = Date.now() + batasMs;
  while (Date.now() < sampai) {
    try {
      const res = await fetch(`${ALAMAT}/index.html`);
      if (res.ok) return true;
    } catch { /* belum siap */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

// ---------------------------------------------------------------- jalan ----

const browser = cariBrowser();
if (!browser) {
  console.log('  Lewat: Edge/Chrome tidak ditemukan di mesin ini (uji asap dilewati).');
  process.exit(0);
}

const profil = mkdtempSync(join(tmpdir(), 'catat-balik-smoke-'));
const server = spawn(process.execPath, [join(AKAR, 'tools', 'serve.mjs'), String(PORT)], { stdio: 'ignore' });

const bersihkan = () => {
  try { server.kill(); } catch { /* sudah mati */ }
  try { rmSync(SEED, { force: true }); } catch { /* tidak ada */ }
  try { rmSync(AKSI, { force: true }); } catch { /* tidak ada */ }
  try { rmSync(profil, { recursive: true, force: true }); } catch { /* biarkan */ }
};
process.on('exit', bersihkan);
process.on('SIGINT', () => { bersihkan(); process.exit(1); });

let gagal = 0;
let lulus = 0;

try {
  if (!await tungguServer()) throw new Error(`Server lokal tidak mau menyala di ${ALAMAT}`);

  // Halaman penyemai: harus se-origin dengan aplikasi agar localStorage-nya sama.
  writeFileSync(SEED, `<!doctype html><meta charset="utf-8"><title>menyemai</title>
<script>
try {
  localStorage.setItem('catat-balik:v1', ${JSON.stringify(JSON.stringify(stateContoh()))});
  document.title = 'SEMAI OK';
} catch (e) { document.title = 'SEMAI GAGAL: ' + e.message; }
</script>`);

  const hasilSemai = await dom(browser, profil, `${ALAMAT}/__smoke-seed.html`);
  if (!hasilSemai.includes('SEMAI OK')) throw new Error('Gagal mengisi localStorage data contoh.');
  console.log('  data contoh tersemai di browser');

  // --- fase 2: jalur tulis (db + store + localStorage + model) ---
  copyFileSync(join(AKAR, 'tools', 'smoke-aksi.html'), AKSI);
  const hasilAksi = await dom(browser, profil, `${ALAMAT}/__smoke-aksi.html`);
  // Hanya isi <pre> yang dipercaya: teks skrip di DOM juga memuat kata "AKSI OK".
  const isiAksi = (hasilAksi.match(/<pre id="hasil">([\s\S]*?)<\/pre>/) || [, ''])[1];
  if (isiAksi.trim().endsWith('AKSI OK')) {
    lulus++;
    console.log(`  ok    uji aksi tulis (${(isiAksi.match(/^ok   /gm) || []).length} pemeriksaan)`);
  } else {
    gagal++;
    console.error('  GAGAL uji aksi tulis:');
    for (const b of isiAksi.split('\n').filter((x) => x.startsWith('GAGAL'))) console.error(`         ${b}`);
  }

  // Semai ulang: fase aksi sengaja mengosongkan data.
  await dom(browser, profil, `${ALAMAT}/__smoke-seed.html`);

  for (const [rute, penanda] of RUTE) {
    const html = await dom(browser, profil, `${ALAMAT}/${rute}`);
    const hilang = penanda.filter((p) => !html.includes(p));
    const terlarang = LARANGAN.filter((p) => html.includes(p) && !(rute === '#/rute-ngawur' && p === 'Terjadi kesalahan'));

    if (hilang.length || terlarang.length) {
      gagal++;
      console.error(`  GAGAL ${rute}`);
      if (hilang.length) console.error(`         tidak menemukan: ${hilang.join(' | ')}`);
      if (terlarang.length) console.error(`         muncul teks terlarang: ${terlarang.join(' | ')}`);
    } else {
      lulus++;
      console.log(`  ok    ${rute}`);
    }
  }
  // --- fase 3: cold start offline ---
  // Service worker didaftarkan pada pemuatan di atas. Server dimatikan, lalu
  // aplikasi dibuka lagi: kalau precache benar, halaman tetap utuh.
  await dom(browser, profil, `${ALAMAT}/#/`); // pastikan SW sempat aktif
  server.kill();
  await new Promise((r) => setTimeout(r, 600));

  const luring = await dom(browser, profil, `${ALAMAT}/#/`);
  const penandaLuring = ['Catat Balik', 'Masih harus dibalas', 'Siti Aminah'];
  const hilangLuring = penandaLuring.filter((p) => !luring.includes(p));
  if (hilangLuring.length) {
    gagal++;
    console.error(`  GAGAL cold start offline — tidak menemukan: ${hilangLuring.join(' | ')}`);
  } else {
    lulus++;
    console.log('  ok    cold start offline (server mati, dilayani service worker)');
  }
} catch (err) {
  console.error(`\n  Uji asap berhenti: ${err.message}`);
  bersihkan();
  process.exit(1);
}

bersihkan();
console.log(`\n  ${lulus} rute lolos${gagal ? `, ${gagal} GAGAL` : ''}\n`);
process.exit(gagal ? 1 : 0);
