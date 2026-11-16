// Server statis mungil untuk mencoba aplikasi secara lokal tanpa XAMPP.
// Jalankan: node tools/serve.mjs [port]      lalu buka http://localhost:8765/
//
// ES module tidak bisa dimuat lewat file://, jadi aplikasi memang harus
// disajikan lewat http - entah dengan skrip ini, XAMPP, atau GitHub Pages.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2]) || 8765;

const TIPE = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.csv': 'text/csv; charset=utf-8',
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    let jalur = decodeURIComponent(url.pathname);
    if (jalur.endsWith('/')) jalur += 'index.html';

    const berkas = join(AKAR, normalize(jalur).replace(/^(\.\.[/\\])+/, ''));
    if (!berkas.startsWith(AKAR)) { res.writeHead(403).end('Terlarang'); return; }

    const info = await stat(berkas);
    if (info.isDirectory()) { res.writeHead(404).end('Tidak ditemukan'); return; }

    const isi = await readFile(berkas);
    res.writeHead(200, {
      'content-type': TIPE[extname(berkas).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-cache',
      'service-worker-allowed': '/',
    });
    res.end(isi);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Tidak ditemukan');
  }
}).listen(PORT, () => {
  console.log(`Catat Balik berjalan di http://localhost:${PORT}/`);
});
