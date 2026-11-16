// CRUD domain: menulis ke state lokal + mengantre baris ke outbox.
// Outbox menyimpan referensi {tabel, id}, bukan salinan baris, sehingga push
// selalu mengirim versi terbaru dan replay tidak pernah menggandakan data
// (primary key dibuat di client, jadi upsert bersifat idempoten).

import { st, ubah, data } from './store.js';
import { uuid, hariIni, normalNama } from './fmt.js';
import { aktif, ARAH, JENIS, cariOrangByNama } from './model.js';

const TABEL_VALID = new Set(['people', 'events', 'entries']);

function antre(s, tabel, id) {
  if (!s.outbox.some((o) => o.tabel === tabel && o.id === id)) {
    s.outbox.push({ tabel, id, pada: new Date().toISOString() });
  }
}

/**
 * Upsert satu baris. `patch.id` kosong = baris baru.
 * updated_at lokal hanya sementara; server (trigger Postgres) yang menentukan
 * nilai final saat push, supaya cursor sinkron tidak bergantung jam HP.
 */
export function simpanBaris(tabel, patch) {
  if (!TABEL_VALID.has(tabel)) throw new Error(`Tabel tidak dikenal: ${tabel}`);
  const stamp = new Date().toISOString();
  return ubah((s) => {
    const arr = s[tabel];
    const idx = patch.id ? arr.findIndex((r) => r.id === patch.id) : -1;
    let baris;
    if (idx >= 0) {
      baris = { ...arr[idx], ...patch, updated_at: stamp };
      arr[idx] = baris;
    } else {
      baris = {
        id: patch.id || uuid(),
        ...patch,
        created_at: patch.created_at || stamp,
        updated_at: stamp,
        deleted_at: null,
      };
      arr.push(baris);
    }
    antre(s, tabel, baris.id);
    return baris;
  });
}

/** Soft delete - wajib supaya penghapusan ikut tersinkron ke perangkat lain. */
export function hapusBaris(tabel, id) {
  const stamp = new Date().toISOString();
  return ubah((s) => {
    const baris = s[tabel].find((r) => r.id === id);
    if (!baris) return null;
    baris.deleted_at = stamp;
    baris.updated_at = stamp;
    antre(s, tabel, id);
    return baris;
  });
}

export function pulihkanBaris(tabel, id) {
  const stamp = new Date().toISOString();
  return ubah((s) => {
    const baris = s[tabel].find((r) => r.id === id);
    if (!baris) return null;
    baris.deleted_at = null;
    baris.updated_at = stamp;
    antre(s, tabel, id);
    return baris;
  });
}

// ---------- pembacaan ringkas ----------

export const orangAktif = () => aktif(st().people);
export const acaraAktif = () => aktif(st().events);
export const entriAktif = () => aktif(st().entries);

export const cariOrang = (id) => st().people.find((p) => p.id === id) || null;
export const cariAcara = (id) => st().events.find((e) => e.id === id) || null;
export const cariEntriById = (id) => st().entries.find((e) => e.id === id) || null;

// ---------- orang ----------

export function simpanOrang(patch) {
  const nama = String(patch.nama || '').trim();
  if (!nama) throw new Error('Nama orang wajib diisi.');
  return simpanBaris('people', {
    hubungan: 'lainnya',
    ...patch,
    nama,
  });
}

/** Ambil orang dengan nama ini, buat baru kalau belum ada (dipakai form & impor). */
export function pastikanOrang(nama, tambahan = {}) {
  const bersih = String(nama || '').trim();
  if (!bersih) return null;
  const ada = cariOrangByNama(st().people, bersih);
  if (ada) {
    const isi = {};
    for (const [k, v] of Object.entries(tambahan)) {
      if (v && !ada[k]) isi[k] = v;
    }
    return Object.keys(isi).length ? simpanBaris('people', { id: ada.id, ...isi }) : ada;
  }
  return simpanOrang({ nama: bersih, ...tambahan });
}

/** Hapus orang; entri terkait ikut dihapus bila diminta. */
export function hapusOrang(id, { ikutEntri = true } = {}) {
  const terkait = entriAktif().filter((e) => e.person_id === id);
  if (ikutEntri) for (const e of terkait) hapusBaris('entries', e.id);
  for (const ev of acaraAktif().filter((a) => a.person_id === id)) {
    simpanBaris('events', { id: ev.id, person_id: null });
  }
  return hapusBaris('people', id);
}

export function jumlahEntriOrang(id) {
  return entriAktif().filter((e) => e.person_id === id).length;
}

// ---------- acara ----------

export function simpanAcara(patch) {
  const nama = String(patch.nama || '').trim();
  if (!nama) throw new Error('Nama acara wajib diisi.');
  const pihak = patch.pihak === 'orang_lain' ? 'orang_lain' : 'saya';
  return simpanBaris('events', {
    jenis: 'pernikahan',
    tanggal: hariIni(),
    ...patch,
    nama,
    pihak,
    person_id: pihak === 'orang_lain' ? (patch.person_id || null) : null,
  });
}

export function hapusAcara(id, { ikutEntri = false } = {}) {
  const terkait = entriAktif().filter((e) => e.event_id === id);
  for (const e of terkait) {
    if (ikutEntri) hapusBaris('entries', e.id);
    else simpanBaris('entries', { id: e.id, event_id: null });
  }
  return hapusBaris('events', id);
}

export function jumlahEntriAcara(id) {
  return entriAktif().filter((e) => e.event_id === id).length;
}

// ---------- entri ----------

/** "2,5" (gaya Indonesia) maupun "2.5" sama-sama diterima sebagai 2.5. */
function angkaDesimal(x) {
  if (x === null || x === undefined || x === '') return null;
  const n = typeof x === 'number' ? x : parseFloat(String(x).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) && n !== 0 ? n : null;
}

/** Bentuk baku sebuah entri; field yang tak relevan dikosongkan agar data bersih. */
export function normalkanEntri(patch) {
  const jenis = patch.jenis === JENIS.BARANG ? JENIS.BARANG : JENIS.UANG;
  const arah = patch.arah === ARAH.KELUAR ? ARAH.KELUAR : ARAH.MASUK;
  return {
    id: patch.id || undefined,
    arah,
    person_id: patch.person_id || null,
    event_id: patch.event_id || null,
    tanggal: patch.tanggal || hariIni(),
    jenis,
    nominal: jenis === JENIS.UANG ? Math.max(0, Math.round(Number(patch.nominal) || 0)) : 0,
    barang_nama: jenis === JENIS.BARANG ? String(patch.barang_nama || '').trim() : null,
    barang_jumlah: jenis === JENIS.BARANG ? angkaDesimal(patch.barang_jumlah) : null,
    barang_satuan: jenis === JENIS.BARANG ? (String(patch.barang_satuan || '').trim() || null) : null,
    nilai_taksir: jenis === JENIS.BARANG ? Math.max(0, Math.round(Number(patch.nilai_taksir) || 0)) : 0,
    balas_untuk_id: arah === ARAH.KELUAR ? (patch.balas_untuk_id || null) : null,
    catatan: String(patch.catatan || '').trim() || null,
  };
}

export function simpanEntri(patch) {
  const baris = normalkanEntri(patch);
  if (!baris.id) delete baris.id;
  return simpanBaris('entries', baris);
}

/**
 * Tandai entri masuk sebagai sudah dibalas dengan membuat entri keluar yang
 * menunjuk entri itu - jadi riwayatnya tetap jujur (ada catatan keluarnya),
 * bukan cuma status yang diubah.
 */
export function catatBalasan(entriMasukId, { nominal, tanggal, event_id = null, catatan = null } = {}) {
  const asal = cariEntriById(entriMasukId);
  if (!asal) throw new Error('Entri yang akan dibalas tidak ditemukan.');
  return simpanEntri({
    arah: ARAH.KELUAR,
    person_id: asal.person_id,
    event_id,
    tanggal: tanggal || hariIni(),
    jenis: JENIS.UANG,
    nominal,
    balas_untuk_id: asal.id,
    catatan,
  });
}

/** Lepas kaitan balasan tanpa menghapus entri keluarnya. */
export function lepasBalasan(entriKeluarId) {
  return simpanBaris('entries', { id: entriKeluarId, balas_untuk_id: null });
}

// ---------- outbox ----------

export const jumlahTertunda = () => st().outbox.length;

export function bersihkanOutbox(dipush) {
  const kunci = new Set(dipush.map((o) => `${o.tabel}:${o.id}`));
  ubah((s) => {
    s.outbox = s.outbox.filter((o) => !kunci.has(`${o.tabel}:${o.id}`));
  });
}

/** Antre ulang SEMUA baris lokal - dipakai saat pertama kali menyambung cloud. */
export function antreSemua() {
  ubah((s) => {
    for (const tabel of ['people', 'events', 'entries']) {
      for (const baris of s[tabel]) antre(s, tabel, baris.id);
    }
  });
}

export { data, normalNama };
