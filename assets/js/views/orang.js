// Daftar orang + halaman detail per orang (neraca, riwayat, aksi balas).

import { data } from '../store.js';
import { simpanOrang, hapusOrang, cariOrang, jumlahEntriOrang } from '../db.js';
import { hitungNeraca, saranBalasan, deskripsiEntri, nilaiEntri, idSudahDibalas, ARAH } from '../model.js';
import { rupiah, rupiahSingkat, esc, inisial, tanggal, jarakWaktu, normalNama, LABEL_HUBUNGAN } from '../fmt.js';
import { judul, kosong, opsi, pada, sukses, galat, tanya, nilaiForm } from '../ui.js';
import { ke, gantiTanpaRiwayat, querystring } from '../router.js';

export const judulHalaman = 'Orang';

export function render(host, ctx) {
  if (ctx.params?.id) return detail(host, ctx);
  return daftar(host, ctx);
}

// ---------- daftar ----------

function daftar(host, ctx) {
  const d = data();
  const { list } = hitungNeraca(d);
  const urut = ctx.query.urut || 'saldo';

  const PENGURUT = {
    saldo: (a, b) => b.saldo - a.saldo || a.orang.nama.localeCompare(b.orang.nama, 'id'),
    nama: (a, b) => a.orang.nama.localeCompare(b.orang.nama, 'id'),
    masuk: (a, b) => b.masuk - a.masuk,
    keluar: (a, b) => b.keluar - a.keluar,
  };

  // Disusun dari argumen, bukan dari ctx.query, supaya hasil filter bisa
  // digambar ulang sendiri tanpa membangun ulang seluruh view.
  const susun = (teks, urutan) => {
    const kunci = normalNama(teks || '');
    let baris = list.map((s) => ({ ...s, saran: saranBalasan(s.saldo, d.settings, s.tahunTunggu) }));
    if (kunci) baris = baris.filter((s) => normalNama(`${s.orang.nama} ${s.orang.alias || ''} ${s.orang.alamat || ''}`).includes(kunci));
    return baris.sort(PENGURUT[urutan] || (() => 0));
  };

  const perlu = susun(ctx.query.q, urut).filter((s) => s.saldo > 0).length;

  host.innerHTML = `
    ${judul('Orang', `${list.length} orang · ${perlu} masih perlu dibalas`)}
    <div class="toolbar no-print" id="filter">
      <input name="q" value="${esc(ctx.query.q || '')}" placeholder="Cari nama atau alamat…" autocomplete="off">
      <div class="filters">
        <select name="urut" aria-label="Urutan" style="grid-column:span 2">
          ${opsi([
            ['saldo', 'Perlu dibalas dulu'],
            ['nama', 'Nama A-Z'],
            ['masuk', 'Pemberi terbesar'],
            ['keluar', 'Paling banyak saya beri'],
          ], urut)}
        </select>
        <a class="btn btn-sm" href="#/orang?tambah=1">+ Orang</a>
      </div>
    </div>
    ${ctx.query.tambah ? formTambah() : ''}
    <div id="hasil"></div>`;

  const gambarHasil = () => {
    const teks = host.querySelector('[name="q"]').value.trim();
    const baris = susun(teks, host.querySelector('[name="urut"]').value);
    host.querySelector('#hasil').innerHTML = baris.length
      ? `<div class="list">${baris.map(kartuOrang).join('')}</div>`
      : kosong(teks ? 'Tidak ada orang yang cocok.' : 'Belum ada orang tercatat.',
        '<a class="btn btn-primary" href="#/catat">+ Catat sumbangan</a>');
    // Hitungan di subtitle dimutasi, bukan dirender ulang lewat judul() -
    // pola yang sama dipakai daftar.js.
    const sub = host.querySelector('.page-head .sub');
    if (sub) sub.textContent = `${list.length} orang · ${baris.filter((s) => s.saldo > 0).length} masih perlu dibalas`;
  };
  gambarHasil();

  const terapkan = () => {
    const baru = {
      q: host.querySelector('[name="q"]').value.trim(),
      urut: host.querySelector('[name="urut"]').value,
      tambah: ctx.query.tambah || '',
    };
    gantiTanpaRiwayat(`/orang${querystring(baru)}`);
    // Sengaja TIDAK ctx.gambarUlang(): membangun ulang view membuat input cari
    // dibuat ulang, kursor hilang, dan keyboard Android ikut tertutup.
    gambarHasil();
  };
  pada(host, '#filter select', 'change', terapkan);
  let timer = null;
  pada(host, '#filter [name="q"]', 'input', () => { clearTimeout(timer); timer = setTimeout(terapkan, 220); });

  pada(host, '#form-orang', 'submit', (ev) => {
    ev.preventDefault();
    const v = nilaiForm(ev.target);
    if (!v.nama) { galat('Nama wajib diisi.'); return; }
    const orang = simpanOrang(v);
    sukses(`${orang.nama} ditambahkan.`);
    ke(`/orang/${orang.id}`);
  });
}

function formTambah() {
  return `
  <div class="card">
    <h2>Tambah orang</h2>
    <form id="form-orang">
      <label class="field">
        <span class="lbl">Nama *</span>
        <input name="nama" required autocomplete="off">
      </label>
      <div class="fields-2">
        <label class="field">
          <span class="lbl">Hubungan</span>
          <select name="hubungan">${opsi(Object.entries(LABEL_HUBUNGAN), 'tetangga')}</select>
        </label>
        <label class="field">
          <span class="lbl">Telepon</span>
          <input name="telepon" inputmode="tel" autocomplete="off">
        </label>
      </div>
      <label class="field">
        <span class="lbl">Alamat</span>
        <input name="alamat" autocomplete="off">
      </label>
      <div class="btn-row">
        <button class="btn btn-primary" type="submit">Simpan</button>
        <a class="btn" href="#/orang">Batal</a>
      </div>
    </form>
  </div>`;
}

function kartuOrang(s) {
  const lunas = s.saldo <= 0;
  return `
  <a class="item" href="#/orang/${esc(s.orang.id)}">
    <div class="avatar">${esc(inisial(s.orang.nama))}</div>
    <div class="grow">
      <div class="ttl">${esc(s.orang.nama)}</div>
      <div class="meta">
        ${s.nMasuk} masuk / ${s.nKeluar} keluar
        ${s.orang.alamat ? ` &middot; ${esc(s.orang.alamat)}` : ''}
      </div>
    </div>
    <div class="amt" ${lunas ? '' : 'style="color:var(--danger)"'}>
      ${lunas ? '<span class="badge ok">lunas</span>' : esc(rupiah(s.saldo))}
      <span class="sub">masuk ${esc(rupiahSingkat(s.masuk))}</span>
    </div>
  </a>`;
}

// ---------- detail ----------

function detail(host, ctx) {
  const id = ctx.params.id;
  const orang = cariOrang(id);
  if (!orang || orang.deleted_at) {
    host.innerHTML = judul('Orang tidak ditemukan') + kosong('Data orang ini sudah dihapus.', '<a class="btn" href="#/orang">Kembali ke daftar</a>');
    return;
  }

  const d = data();
  const s = hitungNeraca(d).peta.get(id) || null;
  const masuk = s ? s.masuk : 0;
  const keluar = s ? s.keluar : 0;
  const saldo = masuk - keluar;
  const saran = saranBalasan(saldo, d.settings, s ? s.tahunTunggu : 0);
  const belum = s ? s.masukBelumDibalas : [];
  const dibalas = idSudahDibalas(d.entries);
  const riwayat = s ? [...s.entriMasuk, ...s.entriKeluar].sort((a, b) => String(b.tanggal).localeCompare(String(a.tanggal))) : [];

  host.innerHTML = `
    ${judul(orang.nama, [LABEL_HUBUNGAN[orang.hubungan], orang.telepon, orang.alamat].filter(Boolean).join(' · ') || 'Tanpa keterangan')}

    <div class="stats">
      <div class="stat">
        <div class="label">Masuk</div>
        <div class="value masuk">${esc(rupiahSingkat(masuk))}</div>
        <div class="note">${s ? s.nMasuk : 0} catatan</div>
      </div>
      <div class="stat">
        <div class="label">Saya beri</div>
        <div class="value keluar">${esc(rupiahSingkat(keluar))}</div>
        <div class="note">${s ? s.nKeluar : 0} catatan</div>
      </div>
      <div class="stat span-2">
        <div class="label">${saldo > 0 ? 'Masih harus dibalas' : 'Status'}</div>
        <div class="value ${saldo > 0 ? 'danger' : ''}">${saldo > 0 ? esc(rupiah(saldo)) : 'Lunas'}</div>
        ${saldo > 0 ? `<div class="note">Saran balasan ${esc(rupiah(saran))}${s && s.tahunTunggu >= 1 ? ` · menunggu ${esc(jarakWaktu(belum[0]?.tanggal || ''))}` : ''}</div>` : ''}
      </div>
    </div>

    <div class="btn-row no-print">
      ${saldo > 0
        ? `<a class="btn btn-primary" href="#/catat?arah=keluar&orang=${esc(id)}${belum[0] ? `&balas=${esc(belum[0].id)}` : `&nominal=${saran}`}">Catat balasan</a>`
        : `<a class="btn btn-primary" href="#/catat?arah=keluar&orang=${esc(id)}">Catat pemberian</a>`}
      <a class="btn" href="#/catat?arah=masuk&orang=${esc(id)}">Catat masuk</a>
    </div>

    <details class="card no-print">
      <summary><strong>Ubah data orang</strong></summary>
      <form id="form-orang" style="margin-top:.7rem">
        <input type="hidden" name="id" value="${esc(orang.id)}">
        <label class="field">
          <span class="lbl">Nama *</span>
          <input name="nama" value="${esc(orang.nama)}" required>
        </label>
        <div class="fields-2">
          <label class="field">
            <span class="lbl">Hubungan</span>
            <select name="hubungan">${opsi(Object.entries(LABEL_HUBUNGAN), orang.hubungan || 'lainnya')}</select>
          </label>
          <label class="field">
            <span class="lbl">Telepon</span>
            <input name="telepon" inputmode="tel" value="${esc(orang.telepon || '')}">
          </label>
        </div>
        <label class="field">
          <span class="lbl">Alamat</span>
          <input name="alamat" value="${esc(orang.alamat || '')}">
        </label>
        <label class="field">
          <span class="lbl">Catatan</span>
          <textarea name="catatan" rows="2">${esc(orang.catatan || '')}</textarea>
        </label>
        <div class="btn-row">
          <button class="btn btn-primary" type="submit">Simpan</button>
          <button class="btn btn-danger" type="button" id="hapus-orang">Hapus orang</button>
        </div>
      </form>
    </details>

    <div class="section-head"><h2>Riwayat</h2><span class="small muted">${riwayat.length} catatan</span></div>
    ${riwayat.length
      ? `<div class="list">${riwayat.map((e) => kartuEntri(e, dibalas, d)).join('')}</div>`
      : kosong('Belum ada catatan untuk orang ini.')}
  `;

  pada(host, '#form-orang', 'submit', (ev) => {
    ev.preventDefault();
    const v = nilaiForm(ev.target);
    if (!v.nama) { galat('Nama wajib diisi.'); return; }
    simpanOrang({ ...v, id: orang.id });
    sukses('Data orang diperbarui.');
    ctx.gambarUlang();
  });

  pada(host, '#hapus-orang', 'click', async () => {
    const n = jumlahEntriOrang(orang.id);
    const pesan = n
      ? `Hapus ${orang.nama} beserta ${n} catatannya? Total masuk/keluar akan ikut berubah.`
      : `Hapus ${orang.nama}?`;
    if (!await tanya(pesan, { ya: 'Hapus orang', bahaya: true })) return;
    hapusOrang(orang.id, { ikutEntri: true });
    sukses(`${orang.nama} dihapus.`);
    ke('/orang');
  });
}

function kartuEntri(e, dibalas, d) {
  const masuk = e.arah === ARAH.MASUK;
  const acara = e.event_id ? d.events.find((a) => a.id === e.event_id) : null;
  const badge = masuk
    ? (dibalas.has(e.id) ? '<span class="badge ok">sudah dibalas</span>' : '<span class="badge warn">belum dibalas</span>')
    : (e.balas_untuk_id ? '<span class="badge masuk">balasan</span>' : '');
  return `
  <a class="item" href="#/catat?id=${esc(e.id)}&kembali=/orang/${esc(e.person_id)}">
    <div class="grow">
      <div class="ttl">${masuk ? 'Masuk' : 'Keluar'} ${badge}</div>
      <div class="meta">
        ${esc(tanggal(e.tanggal))} &middot; ${esc(deskripsiEntri(e))}
        ${acara ? ` &middot; ${esc(acara.nama)}` : ''}
        ${e.catatan ? ` &middot; ${esc(e.catatan)}` : ''}
      </div>
    </div>
    <div class="amt" style="color:var(--${masuk ? 'masuk' : 'keluar'})">${masuk ? '+' : '−'}${esc(rupiah(nilaiEntri(e)))}</div>
  </a>`;
}
