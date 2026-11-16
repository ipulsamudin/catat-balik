// Membuat ikon PNG untuk PWA tanpa dependensi apa pun.
// Jalankan dari akar proyek:  node tools/make-icons.mjs
//
// Bentuknya dibuat dengan menggambar langsung ke buffer piksel (kotak membulat,
// lingkaran, segitiga) lalu dikemas sebagai PNG memakai zlib bawaan Node, jadi
// tidak perlu Canvas/sharp/puppeteer. Geometrinya mengikuti assets/icons/icon.svg.

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEAL = [15, 118, 110];
const PUTIH = [255, 255, 255];
const AMBER = [245, 158, 11];

function kanvas(n) {
  return { n, px: new Uint8Array(n * n * 4) };
}

function set(c, x, y, warna, alpha = 1) {
  if (x < 0 || y < 0 || x >= c.n || y >= c.n) return;
  const i = (y * c.n + x) * 4;
  const a0 = c.px[i + 3] / 255;
  const a1 = alpha;
  const aOut = a1 + a0 * (1 - a1);
  for (let k = 0; k < 3; k++) {
    const lama = c.px[i + k];
    c.px[i + k] = aOut ? Math.round((warna[k] * a1 + lama * a0 * (1 - a1)) / aOut) : 0;
  }
  c.px[i + 3] = Math.round(aOut * 255);
}

/** Cakupan piksel dihitung dari 3x3 sub-sampel supaya tepinya tidak bergerigi. */
function isi(c, warna, di) {
  const s = 3;
  for (let y = 0; y < c.n; y++) {
    for (let x = 0; x < c.n; x++) {
      let kena = 0;
      for (let sy = 0; sy < s; sy++) {
        for (let sx = 0; sx < s; sx++) {
          if (di(x + (sx + 0.5) / s, y + (sy + 0.5) / s)) kena++;
        }
      }
      if (kena) set(c, x, y, warna, kena / (s * s));
    }
  }
}

const kotakBulat = (x0, y0, w, h, r) => (x, y) => {
  const x1 = x0 + w; const y1 = y0 + h;
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  const dx = x - cx; const dy = y - cy;
  return dx * dx + dy * dy <= r * r + 1e-9;
};

const lingkaran = (cx, cy, r) => (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;

/** Panah ke atas: batang + kepala segitiga. */
const panahAtas = (cx, cy, lebar, tinggi) => (x, y) => {
  const setengah = lebar / 2;
  const atas = cy - tinggi / 2;
  const bawah = cy + tinggi / 2;
  const tengah = cy - tinggi / 10;
  if (y < atas || y > bawah) return false;
  if (y <= tengah) {
    // kepala: melebar dari ujung atas ke bawah
    const t = (y - atas) / (tengah - atas);
    const w = setengah * t;
    return Math.abs(x - cx) <= w;
  }
  return Math.abs(x - cx) <= setengah * 0.34;
};

function gambar(n, { maskable = false } = {}) {
  const c = kanvas(n);
  const u = (v) => (v / 512) * n; // koordinat mengikuti viewBox 512

  const padding = maskable ? u(44) : 0; // zona aman ikon maskable
  const sisi = n - padding * 2;

  isi(c, TEAL, kotakBulat(0, 0, n, n, maskable ? 0 : u(96)));
  if (maskable) isi(c, TEAL, kotakBulat(0, 0, n, n, 0));

  const sk = (v) => padding + (v / 512) * sisi;
  const sv = (v) => (v / 512) * sisi;

  isi(c, PUTIH, kotakBulat(sk(112), sk(102), sv(288), sv(308), sv(40)));
  isi(c, TEAL, kotakBulat(sk(156), sk(168), sv(200), sv(22), sv(11)));
  isi(c, TEAL, kotakBulat(sk(156), sk(230), sv(200), sv(22), sv(11)));
  isi(c, TEAL, kotakBulat(sk(156), sk(292), sv(120), sv(22), sv(11)));
  isi(c, AMBER, lingkaran(sk(366), sk(366), sv(76)));
  isi(c, PUTIH, panahAtas(sk(366), sk(364), sv(88), sv(84)));

  return c;
}

// ---------- PNG ----------

const TABEL_CRC = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = TABEL_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function potongan(tipe, data) {
  const panjang = Buffer.alloc(4);
  panjang.writeUInt32BE(data.length);
  const isiPotongan = Buffer.concat([Buffer.from(tipe, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(isiPotongan));
  return Buffer.concat([panjang, isiPotongan, crc]);
}

function png(c) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(c.n, 0);
  ihdr.writeUInt32BE(c.n, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  const baris = Buffer.alloc((c.n * 4 + 1) * c.n);
  for (let y = 0; y < c.n; y++) {
    const awal = y * (c.n * 4 + 1);
    baris[awal] = 0; // filter none
    Buffer.from(c.px.buffer, y * c.n * 4, c.n * 4).copy(baris, awal + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    potongan('IHDR', ihdr),
    potongan('IDAT', deflateSync(baris, { level: 9 })),
    potongan('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- tulis ----------

const keluaran = join(AKAR, 'assets', 'icons');
mkdirSync(keluaran, { recursive: true });

const berkas = [
  ['icon-192.png', gambar(192)],
  ['icon-512.png', gambar(512)],
  ['maskable-512.png', gambar(512, { maskable: true })],
];

for (const [nama, c] of berkas) {
  const buf = png(c);
  writeFileSync(join(keluaran, nama), buf);
  console.log(`${nama}  ${c.n}x${c.n}  ${(buf.length / 1024).toFixed(1)} KB`);
}
