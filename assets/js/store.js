// Penyimpanan lokal: sumber kebenaran untuk UI.
// Semua tulisan masuk ke localStorage dulu, lalu diantre di outbox untuk disinkron.
// Aplikasi harus tetap jalan walau localStorage diblokir (mode privat) - di situ
// state hanya hidup di memori dan pengguna diberi peringatan.

const KEY = 'catat-balik:v1';

export const SETTINGS_DEFAULT = {
  namaSaya: '',
  pembulatan: 50000,
  penyesuaian: 0,
  pemisahCsv: ';',
  supabaseUrl: '',
  anonKey: '',
};

const TABEL = ['people', 'events', 'entries'];

function stateAwal() {
  return {
    versi: 1,
    people: [],
    events: [],
    entries: [],
    settings: { ...SETTINGS_DEFAULT },
    outbox: [],
    cursors: {},
    lastSyncAt: null,
  };
}

let gudangAda = true;
try {
  const uji = '__cb__';
  localStorage.setItem(uji, '1');
  localStorage.removeItem(uji);
} catch {
  gudangAda = false;
}

let state = muat();
let kuotaPenuh = false;
const pendengar = new Set();

function muat() {
  if (!gudangAda) return stateAwal();
  try {
    const mentah = localStorage.getItem(KEY);
    if (!mentah) return stateAwal();
    const d = JSON.parse(mentah);
    const awal = stateAwal();
    return {
      ...awal,
      ...d,
      settings: { ...awal.settings, ...(d.settings || {}) },
      people: Array.isArray(d.people) ? d.people : [],
      events: Array.isArray(d.events) ? d.events : [],
      entries: Array.isArray(d.entries) ? d.entries : [],
      outbox: Array.isArray(d.outbox) ? d.outbox : [],
      cursors: d.cursors && typeof d.cursors === 'object' ? d.cursors : {},
    };
  } catch (err) {
    console.error('Gagal membaca data lokal, memulai dari kosong:', err);
    return stateAwal();
  }
}

export function simpan() {
  if (!gudangAda) return false;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    kuotaPenuh = false;
    return true;
  } catch (err) {
    kuotaPenuh = true;
    console.error('Gagal menyimpan ke localStorage:', err);
    return false;
  }
}

/** State penuh (termasuk outbox & cursor). */
export function st() { return state; }

/** Potongan yang dipakai modul hitungan. */
export function data() {
  return { people: state.people, events: state.events, entries: state.entries, settings: state.settings };
}

export function subscribe(fn) {
  pendengar.add(fn);
  return () => pendengar.delete(fn);
}

export function kabari() {
  for (const fn of pendengar) {
    try { fn(state); } catch (err) { console.error(err); }
  }
}

/** Ubah state, simpan, lalu kabari semua view. */
export function ubah(fn) {
  const hasil = fn(state);
  simpan();
  kabari();
  return hasil;
}

/** Ganti seluruh isi data (restore backup / reset). settings cloud dipertahankan. */
export function gantiData(baru, { pertahankanCloud = true } = {}) {
  const awal = stateAwal();
  const cloud = pertahankanCloud
    ? { supabaseUrl: state.settings.supabaseUrl, anonKey: state.settings.anonKey }
    : {};
  state = {
    ...awal,
    ...baru,
    settings: { ...awal.settings, ...(baru.settings || {}), ...cloud },
    outbox: Array.isArray(baru.outbox) ? baru.outbox : [],
    cursors: {},
    lastSyncAt: null,
  };
  for (const t of TABEL) if (!Array.isArray(state[t])) state[t] = [];
  simpan();
  kabari();
}

export function setSetting(kunci, nilai) {
  ubah((s) => { s.settings[kunci] = nilai; });
}

/** Perkiraan pemakaian localStorage untuk peringatan kuota (~5 MB). */
export function kuota() {
  const bytes = gudangAda ? (localStorage.getItem(KEY) || '').length * 2 : 0;
  const batas = 5 * 1024 * 1024;
  return { bytes, batas, persen: Math.min(100, Math.round((bytes / batas) * 100)), penuh: kuotaPenuh };
}

export function gudangTersedia() { return gudangAda; }

export { TABEL };
