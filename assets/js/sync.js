// Mesin sinkron offline-first.
//
// Aturan yang dipegang:
// - Lokal selalu boleh ditulis; perubahan diantre di outbox.
// - Push dulu, baru pull, supaya perubahan lokal tidak tertimpa hasil pull.
// - Primary key dibuat di client -> upsert idempoten, replay aman.
// - updated_at diisi trigger Postgres (jam server), jadi cursor tidak bergantung
//   jam perangkat. Pull memundurkan cursor 2 detik untuk menutup celah baris
//   yang sempat ditulis pada detik yang sama, dan duplikatnya aman karena merge
//   berbasis id.
// - Hapus = soft delete (deleted_at) supaya penghapusan ikut tersinkron.

import { st, ubah, subscribe } from './store.js';
import { bersihkanOutbox } from './db.js';
import { klien, sesi, terkonfigurasi } from './supabase.js';

const TABEL = ['people', 'events', 'entries'];
const BATAS_PUSH = 200;
const BATAS_PULL = 500;

// Kolom yang dikirim ke server; sisanya (mis. updated_at) ditentukan server.
const KOLOM = {
  people: ['id', 'owner_id', 'nama', 'alias', 'telepon', 'alamat', 'hubungan', 'catatan', 'created_at', 'deleted_at'],
  events: ['id', 'owner_id', 'nama', 'jenis', 'tanggal', 'pihak', 'person_id', 'lokasi', 'catatan', 'created_at', 'deleted_at'],
  entries: ['id', 'owner_id', 'arah', 'person_id', 'event_id', 'tanggal', 'jenis', 'nominal',
    'barang_nama', 'barang_jumlah', 'barang_satuan', 'nilai_taksir', 'balas_untuk_id', 'catatan',
    'created_at', 'deleted_at'],
};

export const STATUS = {
  lokal: 'Lokal',
  menyinkron: 'Menyinkron…',
  tersinkron: 'Tersinkron',
  tertunda: 'Tertunda',
  luring: 'Offline',
  'perlu-login': 'Perlu login',
  galat: 'Gagal sinkron',
};

let status = { state: 'lokal', tertunda: 0, lastSyncAt: null, pesan: '' };
const pendengar = new Set();
let berjalan = false;
let perluUlang = false;
let timerDebounce = null;

export function statusSekarang() {
  return { ...status, tertunda: st().outbox.length, lastSyncAt: st().lastSyncAt };
}

export function onStatus(fn) {
  pendengar.add(fn);
  fn(statusSekarang());
  return () => pendengar.delete(fn);
}

function setStatus(state, pesan = '') {
  status = { ...status, state, pesan };
  for (const fn of pendengar) {
    try { fn(statusSekarang()); } catch (err) { console.error(err); }
  }
}

function hitungStatusDiam() {
  if (!terkonfigurasi()) return setStatus('lokal');
  if (!navigator.onLine) return setStatus('luring');
  if (st().outbox.length) return setStatus('tertunda');
  return setStatus('tersinkron');
}

// ---------- sinkron ----------

export async function sinkron({ diam = false } = {}) {
  if (!terkonfigurasi()) { setStatus('lokal'); return statusSekarang(); }
  if (berjalan) { perluUlang = true; return statusSekarang(); }
  if (!navigator.onLine) { setStatus('luring'); return statusSekarang(); }

  berjalan = true;
  setStatus('menyinkron');
  try {
    const c = await klien();
    const s = await sesi();
    if (!s) { setStatus('perlu-login', 'Masuk dulu agar data bisa tersinkron.'); return statusSekarang(); }

    await push(c, s.user.id);
    await pull(c);

    ubah((x) => { x.lastSyncAt = new Date().toISOString(); });
    setStatus(st().outbox.length ? 'tertunda' : 'tersinkron');
  } catch (err) {
    const pesan = String(err?.message || err);
    if (/JWT|token|refresh|not authenticated|Unauthorized|401/i.test(pesan)) {
      setStatus('perlu-login', 'Sesi berakhir. Masuk lagi untuk melanjutkan sinkron.');
    } else {
      setStatus('galat', pesan);
      if (!diam) console.error('Sinkron gagal:', err);
    }
  } finally {
    berjalan = false;
    if (perluUlang) { perluUlang = false; setTimeout(() => sinkron({ diam: true }), 400); }
  }
  return statusSekarang();
}

async function push(c, ownerId) {
  const antrean = [...st().outbox];
  if (!antrean.length) return;

  // Urutan tabel penting: people & events dulu karena entries menunjuk keduanya.
  for (const tabel of TABEL) {
    const item = antrean.filter((o) => o.tabel === tabel);
    if (!item.length) continue;

    const semua = st()[tabel];
    let baris = item
      .map((o) => semua.find((r) => r.id === o.id))
      .filter(Boolean)
      .map((r) => bersihkan(tabel, r, ownerId));

    // Entri masuk didahulukan: entri keluar bisa menunjuknya via balas_untuk_id.
    if (tabel === 'entries') {
      baris.sort((a, b) => (a.arah === b.arah ? 0 : a.arah === 'masuk' ? -1 : 1));
    }

    for (let i = 0; i < baris.length; i += BATAS_PUSH) {
      const potongan = baris.slice(i, i + BATAS_PUSH);
      const { error } = await c.from(tabel).upsert(potongan, { onConflict: 'id' });
      if (error) throw new Error(`Gagal mengirim ${tabel}: ${error.message}`);
      // Hanya potongan yang sukses dibuang dari outbox; sisanya tetap diantre.
      bersihkanOutbox(potongan.map((r) => ({ tabel, id: r.id })));
    }
  }
}

function bersihkan(tabel, baris, ownerId) {
  const out = {};
  for (const k of KOLOM[tabel]) {
    if (k === 'owner_id') { out.owner_id = ownerId; continue; }
    const v = baris[k];
    out[k] = v === undefined ? null : v;
  }
  return out;
}

async function pull(c) {
  for (const tabel of TABEL) {
    const cursor = st().cursors[tabel] || null;
    let offset = 0;
    let maksimum = cursor;
    const masuk = [];

    for (;;) {
      let q = c.from(tabel).select('*').order('updated_at', { ascending: true }).range(offset, offset + BATAS_PULL - 1);
      if (cursor) q = q.gt('updated_at', mundur(cursor, 2000));
      const { data, error } = await q;
      if (error) throw new Error(`Gagal mengambil ${tabel}: ${error.message}`);
      if (!data || !data.length) break;

      masuk.push(...data);
      for (const r of data) if (!maksimum || r.updated_at > maksimum) maksimum = r.updated_at;
      if (data.length < BATAS_PULL) break;
      offset += BATAS_PULL;
    }

    if (masuk.length) gabung(tabel, masuk);
    if (maksimum && maksimum !== cursor) {
      ubah((x) => { x.cursors[tabel] = maksimum; });
    }
  }
}

/** Gabungkan hasil pull: baris yang masih tertunda di outbox tidak ditimpa. */
function gabung(tabel, masuk) {
  ubah((x) => {
    const tertunda = new Set(x.outbox.filter((o) => o.tabel === tabel).map((o) => o.id));
    const indeks = new Map(x[tabel].map((r, i) => [r.id, i]));
    for (const baris of masuk) {
      if (tertunda.has(baris.id)) continue; // perubahan lokal belum terkirim -> menang
      const i = indeks.get(baris.id);
      if (i === undefined) {
        indeks.set(baris.id, x[tabel].push(baris) - 1);
      } else {
        x[tabel][i] = baris;
      }
    }
  });
}

function mundur(iso, ms) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  return new Date(t - ms).toISOString();
}

/** Lupakan cursor supaya pull berikutnya mengambil semuanya lagi. */
export function resetCursor() {
  ubah((x) => { x.cursors = {}; });
}

// ---------- otomatisasi ----------

export function mulaiOtomatis() {
  hitungStatusDiam();

  window.addEventListener('online', () => { setStatus('menyinkron'); sinkron({ diam: true }); });
  window.addEventListener('offline', () => hitungStatusDiam());

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && st().outbox.length) sinkron({ diam: true });
  });

  // Perubahan lokal -> dorong setelah jeda singkat (hemat permintaan saat
  // pengguna mencatat banyak tamu berturut-turut).
  subscribe(() => {
    const n = st().outbox.length;
    if (!n) { if (terkonfigurasi() && navigator.onLine) hitungStatusDiam(); return; }
    if (berjalan) return; // perubahan dari proses sinkron itu sendiri
    if (status.state !== 'menyinkron') setStatus(navigator.onLine ? 'tertunda' : 'luring');
    clearTimeout(timerDebounce);
    timerDebounce = setTimeout(() => sinkron({ diam: true }), 2500);
  });

  // Jaring pengaman: tiap 5 menit saat tab terlihat.
  setInterval(() => {
    if (document.visibilityState === 'visible') sinkron({ diam: true });
  }, 5 * 60 * 1000);

  if (terkonfigurasi() && navigator.onLine) sinkron({ diam: true });
}

export { TABEL };
