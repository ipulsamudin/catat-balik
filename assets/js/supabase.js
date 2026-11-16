// Klien Supabase + autentikasi.
// Pustakanya di-impor dinamis dari ./vendor (bukan CDN) supaya aplikasi tetap
// bisa dingin-start saat offline, dan hanya diunduh bila cloud dipakai.

import { st, setSetting } from './store.js';

let klienCache = null;
let kunciCache = '';
const pendengarAuth = new Set();

/** URL + anon key: dari Pengaturan (localStorage), atau config.js bila di-hardcode. */
export function konfigurasi() {
  const s = st().settings;
  const global = (typeof window !== 'undefined' && window.CATAT_BALIK) || {};
  return {
    url: (s.supabaseUrl || global.supabaseUrl || '').trim().replace(/\/+$/, ''),
    key: (s.anonKey || global.anonKey || '').trim(),
  };
}

export function terkonfigurasi() {
  const { url, key } = konfigurasi();
  return !!(url && key);
}

export function simpanKonfigurasi(url, key) {
  setSetting('supabaseUrl', String(url || '').trim().replace(/\/+$/, ''));
  setSetting('anonKey', String(key || '').trim());
  klienCache = null;
  kunciCache = '';
}

export async function klien() {
  const { url, key } = konfigurasi();
  if (!url || !key) return null;
  const kunci = `${url}|${key}`;
  if (klienCache && kunciCache === kunci) return klienCache;

  const { createClient } = await import('../../vendor/supabase-js-2.58.0.esm.js');
  klienCache = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: 'catat-balik-auth',
    },
    global: { headers: { 'x-application-name': 'catat-balik' } },
  });
  kunciCache = kunci;

  klienCache.auth.onAuthStateChange((event, session) => {
    for (const fn of pendengarAuth) {
      try { fn(event, session); } catch (err) { console.error(err); }
    }
  });

  return klienCache;
}

export function onAuth(fn) {
  pendengarAuth.add(fn);
  return () => pendengarAuth.delete(fn);
}

/**
 * Sesi tersimpan. getSession() membaca dari localStorage dulu, jadi tetap
 * mengembalikan sesi saat offline (token boleh kedaluwarsa - penolakan baru
 * terjadi di sisi server, dan itu ditangani sebagai status "perlu login").
 */
export async function sesi() {
  const c = await klien();
  if (!c) return null;
  try {
    const { data, error } = await c.auth.getSession();
    if (error) return null;
    return data.session || null;
  } catch {
    return null;
  }
}

export async function pengguna() {
  const s = await sesi();
  return s?.user || null;
}

export async function masuk(email, sandi) {
  const c = await klien();
  if (!c) throw new Error('Supabase belum dikonfigurasi.');
  const { data, error } = await c.auth.signInWithPassword({ email: email.trim(), password: sandi });
  if (error) throw new Error(terjemahkan(error.message));
  return data.session;
}

export async function daftar(email, sandi) {
  const c = await klien();
  if (!c) throw new Error('Supabase belum dikonfigurasi.');
  const { data, error } = await c.auth.signUp({ email: email.trim(), password: sandi });
  if (error) throw new Error(terjemahkan(error.message));
  return data;
}

export async function keluar() {
  const c = await klien();
  if (!c) return;
  try {
    await c.auth.signOut();
  } catch (err) {
    console.warn('Gagal signOut di server (mungkin offline):', err);
  }
}

/** Pesan galat Supabase yang paling sering muncul, dalam bahasa Indonesia. */
function terjemahkan(pesan) {
  const p = String(pesan || '');
  if (/Invalid login credentials/i.test(p)) return 'Email atau sandi salah.';
  if (/Email not confirmed/i.test(p)) return 'Email belum dikonfirmasi. Cek kotak masuk email Anda, atau matikan konfirmasi email di Supabase.';
  if (/User already registered/i.test(p)) return 'Email ini sudah terdaftar. Gunakan menu Masuk.';
  if (/Password should be at least/i.test(p)) return 'Sandi minimal 6 karakter.';
  if (/rate limit|too many/i.test(p)) return 'Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.';
  if (/Failed to fetch|NetworkError|fetch failed/i.test(p)) return 'Tidak bisa menghubungi Supabase. Periksa URL project dan koneksi internet.';
  if (/Invalid API key|JWT/i.test(p)) return 'Anon key tidak valid untuk project ini.';
  return p;
}

export { terjemahkan };
