// Pengaturan: identitas, aturan hitung, sinkron cloud (Supabase), dan data.

import { st, data, setSetting, gantiData, kuota, gudangTersedia } from '../store.js';
import { antreSemua } from '../db.js';
import { backupObjek, bacaBackup, namaFile } from '../csv.js';
import { konfigurasi, terkonfigurasi, simpanKonfigurasi, masuk, daftar, keluar, sesi } from '../supabase.js';
import { sinkron, onStatus, resetCursor, STATUS } from '../sync.js';
import { esc, ribuan, parseNominal, waktuSingkat } from '../fmt.js';
import { judul, pada, sukses, galat, banner, tanya, unduhFile, pilihFile, bacaTeks, opsi, nilaiForm } from '../ui.js';
import { ke } from '../router.js';

export const judulHalaman = 'Pengaturan';
export const autoReload = false;

let lepasStatus = null;

export async function render(host, ctx) {
  const s = data().settings;
  const cfg = konfigurasi();
  const k = kuota();
  const sesiAktif = terkonfigurasi() ? await sesi() : null;

  host.innerHTML = `
    ${judul('Pengaturan')}

    <div class="card">
      <h2>Sinkron cloud</h2>
      <p class="small muted">
        Tanpa cloud, data hanya ada di perangkat ini &mdash; hilang bila HP rusak atau data situs dibersihkan.
        Dengan Supabase, data aman dan bisa dibuka dari perangkat lain. Langkah lengkap ada di README repo.
      </p>

      <div class="row-between small" style="margin-bottom:.6rem">
        <span class="muted">Status</span>
        <span id="status-sinkron"><strong>…</strong></span>
      </div>

      <form id="form-cloud">
        <label class="field">
          <span class="lbl">Supabase Project URL</span>
          <input name="supabaseUrl" value="${esc(s.supabaseUrl)}" placeholder="https://xxxxxxxx.supabase.co"
                 inputmode="url" autocomplete="off" spellcheck="false">
        </label>
        <label class="field">
          <span class="lbl">Anon public key</span>
          <textarea name="anonKey" rows="3" placeholder="eyJhbGciOi…" spellcheck="false" autocomplete="off">${esc(s.anonKey)}</textarea>
          <span class="hint">Anon key memang boleh publik: yang menjaga data adalah Row Level Security di Supabase.</span>
        </label>
        <div class="btn-row">
          <button class="btn btn-primary" type="submit">Simpan koneksi</button>
          ${cfg.url ? '<button class="btn" type="button" id="uji">Uji koneksi</button>' : ''}
        </div>
      </form>

      ${cfg.url && cfg.key ? blokAuth(sesiAktif) : ''}
    </div>

    <div class="card">
      <h2>Aturan hitung</h2>
      <form id="form-hitung">
        <label class="field">
          <span class="lbl">Nama saya / keluarga</span>
          <input name="namaSaya" value="${esc(s.namaSaya)}" placeholder="mis. Keluarga Samudin" autocomplete="off">
          <span class="hint">Dicetak sebagai kepala laporan.</span>
        </label>
        <div class="fields-2">
          <label class="field">
            <span class="lbl">Pembulatan saran balasan</span>
            <input name="pembulatan" inputmode="numeric" value="${esc(ribuan(s.pembulatan))}">
          </label>
          <label class="field">
            <span class="lbl">Penyesuaian / tahun (%)</span>
            <input name="penyesuaian" inputmode="decimal" value="${esc(String(s.penyesuaian))}">
          </label>
        </div>
        <p class="small muted">Contoh: sisa Rp 120.000, pembulatan 50.000, penyesuaian 0% &rarr; saran balasan Rp 150.000.
        Penyesuaian dihitung dari lama menunggu sejak sumbangan diterima.</p>
        <label class="field">
          <span class="lbl">Pemisah kolom CSV</span>
          <select name="pemisahCsv">${opsi([[';', 'Titik koma (;) — Excel Indonesia'], [',', 'Koma (,) — standar internasional']], s.pemisahCsv)}</select>
        </label>
        <button class="btn btn-primary" type="submit">Simpan</button>
      </form>
    </div>

    <div class="card">
      <h2>Data di perangkat ini</h2>
      ${!gudangTersedia()
        ? '<p class="small" style="color:var(--danger)"><strong>Penyimpanan browser diblokir.</strong> Data hanya bertahan selama tab ini terbuka. Matikan mode privat atau izinkan data situs.</p>'
        : `<div class="row-between small"><span class="muted">Pemakaian penyimpanan</span><strong>${esc(ribuan(Math.round(k.bytes / 1024)))} KB (${k.persen}%)</strong></div>
           ${k.persen >= 80 ? '<p class="small" style="color:var(--danger)">Penyimpanan hampir penuh. Unduh backup lalu aktifkan sinkron cloud.</p>' : ''}`}
      <div class="btn-row mt">
        <button class="btn" type="button" id="unduh-backup">Unduh backup JSON</button>
        <button class="btn" type="button" id="pulihkan">Pulihkan dari backup</button>
      </div>
      <div class="btn-row mt">
        <button class="btn btn-danger" type="button" id="hapus-semua">Hapus semua data lokal</button>
      </div>
    </div>

    <p class="small muted" style="text-align:center">
      Catat Balik <span id="versi-app">v1</span> &middot;
      <a href="#/lainnya">Menu lainnya</a>
    </p>`;

  // --- status sinkron hidup ---
  if (lepasStatus) lepasStatus();
  const elStatus = host.querySelector('#status-sinkron');
  lepasStatus = onStatus((s2) => {
    if (!elStatus.isConnected) { lepasStatus?.(); lepasStatus = null; return; }
    const detail = [];
    if (s2.tertunda) detail.push(`${s2.tertunda} perubahan tertunda`);
    if (s2.lastSyncAt) detail.push(`terakhir ${waktuSingkat(s2.lastSyncAt)}`);
    elStatus.innerHTML = `<strong>${esc(STATUS[s2.state] || s2.state)}</strong>${detail.length ? `<br><span class="muted">${esc(detail.join(' · '))}</span>` : ''}`;
  });

  ikat(host, ctx);
}

function blokAuth(sesiAktif) {
  if (sesiAktif) {
    return `
    <hr style="border:0;border-top:1px solid var(--line);margin:.9rem 0">
    <div class="row-between small">
      <span class="muted">Masuk sebagai</span>
      <strong>${esc(sesiAktif.user.email || sesiAktif.user.id)}</strong>
    </div>
    <div class="btn-row mt">
      <button class="btn btn-primary" type="button" id="sinkron-now">Sinkron sekarang</button>
      <button class="btn" type="button" id="tarik-ulang">Tarik ulang semua</button>
      <button class="btn" type="button" id="logout">Keluar</button>
    </div>`;
  }
  return `
  <hr style="border:0;border-top:1px solid var(--line);margin:.9rem 0">
  <form id="form-auth">
    <div class="fields-2">
      <label class="field">
        <span class="lbl">Email</span>
        <input type="email" name="email" autocomplete="username" required>
      </label>
      <label class="field">
        <span class="lbl">Sandi</span>
        <input type="password" name="sandi" autocomplete="current-password" required minlength="6">
      </label>
    </div>
    <div class="btn-row">
      <button class="btn btn-primary" type="submit" data-mode="masuk">Masuk</button>
      <button class="btn" type="submit" data-mode="daftar">Daftar baru</button>
    </div>
  </form>`;
}

function ikat(host, ctx) {
  pada(host, '#form-cloud', 'submit', async (ev) => {
    ev.preventDefault();
    const v = nilaiForm(ev.target);
    if (v.supabaseUrl && !/^https:\/\/[^\s]+\.supabase\.(co|in)$/i.test(v.supabaseUrl.replace(/\/+$/, ''))) {
      if (!await tanya('URL tidak berbentuk https://xxxx.supabase.co. Simpan saja?')) return;
    }
    simpanKonfigurasi(v.supabaseUrl, v.anonKey);
    sukses('Koneksi disimpan.');
    ctx.gambarUlang();
  });

  pada(host, '#uji', 'click', async (ev, btn) => {
    btn.disabled = true;
    try {
      const s = await sinkron();
      if (s.state === 'perlu-login') banner('Koneksi terbaca. Sekarang masuk atau daftar akun.', { durasi: 4000 });
      else if (s.state === 'galat') galat(s.pesan || 'Gagal menghubungi Supabase.');
      else sukses('Koneksi berhasil.');
    } finally {
      btn.disabled = false;
    }
  });

  pada(host, '#form-auth', 'submit', async (ev) => {
    ev.preventDefault();
    const mode = ev.submitter?.dataset.mode || 'masuk';
    const v = nilaiForm(ev.target);
    if (!v.email || !v.sandi) { galat('Email dan sandi wajib diisi.'); return; }
    try {
      if (mode === 'daftar') {
        const hasil = await daftar(v.email, v.sandi);
        if (!hasil.session) {
          banner('Akun dibuat. Cek email untuk konfirmasi, lalu masuk.', { durasi: 7000 });
          return;
        }
      } else {
        await masuk(v.email, v.sandi);
      }
      // Data lokal yang sudah ada ikut didorong ke akun ini.
      antreSemua();
      banner('Berhasil masuk. Mengunggah data lokal…', { durasi: 3000 });
      await sinkron();
      sukses('Data tersinkron.');
      ctx.gambarUlang();
    } catch (err) {
      galat(err.message || 'Gagal masuk.');
    }
  });

  pada(host, '#sinkron-now', 'click', async (ev, btn) => {
    btn.disabled = true;
    const s = await sinkron();
    btn.disabled = false;
    if (s.state === 'galat') galat(s.pesan || 'Sinkron gagal.');
    else sukses(s.tertunda ? `${s.tertunda} perubahan masih tertunda.` : 'Semua data tersinkron.');
  });

  pada(host, '#tarik-ulang', 'click', async () => {
    if (!await tanya('Tarik ulang seluruh data dari server? Perubahan lokal yang belum terkirim tetap aman.')) return;
    resetCursor();
    const s = await sinkron();
    if (s.state === 'galat') galat(s.pesan || 'Gagal menarik data.');
    else sukses('Data ditarik ulang dari server.');
  });

  pada(host, '#logout', 'click', async () => {
    const tertunda = st().outbox.length;
    const pesan = tertunda
      ? `Masih ada ${tertunda} perubahan yang belum terkirim. Tetap keluar? (perubahan tetap tersimpan di perangkat ini)`
      : 'Keluar dari akun? Data lokal tidak dihapus.';
    if (!await tanya(pesan, { ya: 'Keluar' })) return;
    await keluar();
    sukses('Sudah keluar.');
    ctx.gambarUlang();
  });

  pada(host, '#form-hitung', 'submit', (ev) => {
    ev.preventDefault();
    const v = nilaiForm(ev.target);
    setSetting('namaSaya', v.namaSaya || '');
    setSetting('pembulatan', Math.max(1, parseNominal(v.pembulatan) || 1));
    setSetting('penyesuaian', Math.max(0, parseFloat(String(v.penyesuaian).replace(',', '.')) || 0));
    setSetting('pemisahCsv', v.pemisahCsv === ',' ? ',' : ';');
    sukses('Pengaturan disimpan.');
    ctx.gambarUlang();
  });

  pada(host, '#unduh-backup', 'click', () => {
    unduhFile(namaFile('catat-balik-backup', 'json'), JSON.stringify(backupObjek(st()), null, 2), 'application/json');
    sukses('Backup diunduh.');
  });

  pada(host, '#pulihkan', 'click', async () => {
    const file = await pilihFile('.json');
    if (!file) return;
    try {
      const isi = bacaBackup(await bacaTeks(file));
      const n = (isi.entries || []).length;
      const catatanCloud = terkonfigurasi()
        ? '\n\nCatatan: baris yang ada di Supabase tapi tidak ada di backup akan tertarik kembali saat sinkron. Untuk pemulihan bersih, kosongkan tabel di Supabase lebih dulu.'
        : '';
      if (!await tanya(`Ganti seluruh data di perangkat ini dengan backup (${n} catatan)? Data lokal saat ini akan hilang.${catatanCloud}`, { ya: 'Ganti data', bahaya: true })) return;
      gantiData(isi);
      if (terkonfigurasi()) antreSemua();
      sukses(`Backup dipulihkan: ${n} catatan.`);
      ke('/');
    } catch (err) {
      galat(err.message || 'Berkas backup tidak bisa dibaca.');
    }
  });

  pada(host, '#hapus-semua', 'click', async () => {
    const adaCloud = terkonfigurasi();
    const catatanCloud = adaCloud
      ? '\n\nCatatan: data di Supabase TIDAK dihapus dan akan tertarik kembali saat sinkron berikutnya. Untuk menghapus di server, kosongkan tabelnya dari dashboard Supabase.'
      : '';
    if (!await tanya(`HAPUS semua orang, acara, dan catatan di perangkat ini? Tindakan ini tidak bisa dibatalkan — unduh backup dulu.${catatanCloud}`, { ya: 'Hapus semua', bahaya: true })) return;
    if (!await tanya('Sekali lagi: benar-benar hapus semua data lokal?', { ya: 'Ya, hapus', bahaya: true })) return;
    gantiData({ people: [], events: [], entries: [], settings: data().settings });
    sukses('Data lokal dihapus.');
    ke('/');
  });
}
