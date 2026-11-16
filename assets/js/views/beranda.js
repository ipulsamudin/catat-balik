// Beranda: berapa yang masih harus dibalas, ke siapa, dan acara siapa yang segera datang.

import { data } from '../store.js';
import { ringkasan, prioritasBalas, agenda } from '../model.js';
import { rupiah, rupiahSingkat, esc, inisial, tanggal, jarakWaktu, hariIni, LABEL_JENIS_ACARA } from '../fmt.js';
import { judul } from '../ui.js';

export const judulHalaman = 'Beranda';

export function render(host) {
  const d = data();
  const r = ringkasan(d);

  if (!r.nEntri) {
    host.innerHTML = judul('Catat Balik', 'Buku neraca balas budi hajatan') + onboarding();
    return;
  }

  const prio = prioritasBalas(d);
  const jadwal = agenda(d, hariIni());

  host.innerHTML = [
    judul('Beranda', r.nPerluDibalas
      ? `${r.nPerluDibalas} orang masih menunggu dibalas`
      : 'Semua sumbangan sudah terbalas'),

    `<div class="stats">
      <div class="stat span-2">
        <div class="label">Masih harus dibalas</div>
        <div class="value ${r.perluDibalas > 0 ? 'danger' : ''}">${esc(rupiah(r.perluDibalas))}</div>
        <div class="note">${r.nPerluDibalas} orang &middot; dari ${r.nOrang} orang tercatat</div>
      </div>
      <div class="stat">
        <div class="label">Masuk</div>
        <div class="value masuk">${esc(rupiahSingkat(r.totalMasuk))}</div>
        <div class="note">${r.nMasuk} catatan</div>
      </div>
      <div class="stat">
        <div class="label">Keluar</div>
        <div class="value keluar">${esc(rupiahSingkat(r.totalKeluar))}</div>
        <div class="note">${r.nKeluar} catatan</div>
      </div>
    </div>`,

    `<div class="btn-row no-print">
      <a class="btn btn-primary" href="#/catat?arah=masuk">+ Catat masuk</a>
      <a class="btn" href="#/catat?arah=keluar">+ Catat keluar</a>
    </div>`,

    r.barangTanpaTaksiran
      ? `<div class="card flat small"><strong>${r.barangTanpaTaksiran} barang belum ditaksir nilainya.</strong>
         Barang tanpa taksiran dihitung Rp 0 di neraca, jadi saldonya bisa tampak lebih kecil dari kenyataan.
         <a href="#/daftar?jenis=barang">Lihat barang</a></div>`
      : '',

    jadwal.length ? bagianAgenda(jadwal) : '',
    bagianPrioritas(prio),
  ].join('');
}

function bagianAgenda(jadwal) {
  return `
  <div class="section-head"><h2>Acara yang akan datang</h2><a href="#/acara">Semua acara</a></div>
  <div class="list">
    ${jadwal.map((a) => `
      <a class="item" href="${a.orang ? `#/orang/${esc(a.acara.person_id)}` : '#/acara'}">
        <div class="avatar">${esc(inisial(a.orang ? a.orang.nama : a.acara.nama))}</div>
        <div class="grow">
          <div class="ttl">${esc(a.acara.nama)}</div>
          <div class="meta">${esc(LABEL_JENIS_ACARA[a.acara.jenis] || 'Acara')} &middot; ${esc(tanggal(a.acara.tanggal))} (${esc(jarakWaktu(a.acara.tanggal))})</div>
        </div>
        <div class="amt">
          ${a.saran > 0 ? `${esc(rupiah(a.saran))}<span class="sub">saran bawa</span>` : '<span class="sub">tak ada utang balas</span>'}
        </div>
      </a>`).join('')}
  </div>`;
}

function bagianPrioritas(prio) {
  if (!prio.length) {
    return `
    <div class="section-head"><h2>Perlu dibalas</h2></div>
    <div class="card"><div class="empty"><p>Tidak ada utang balas budi yang tersisa. 🎉</p></div></div>`;
  }
  const atas = prio.slice(0, 8);
  return `
  <div class="section-head">
    <h2>Perlu dibalas</h2>
    ${prio.length > atas.length ? `<a href="#/orang?urut=saldo">Lihat ${prio.length} orang</a>` : ''}
  </div>
  <div class="list">
    ${atas.map((s) => `
      <a class="item" href="#/orang/${esc(s.orang.id)}">
        <div class="avatar">${esc(inisial(s.orang.nama))}</div>
        <div class="grow">
          <div class="ttl">${esc(s.orang.nama)}</div>
          <div class="meta">
            Masuk ${esc(rupiahSingkat(s.masuk))}${s.keluar ? ` &middot; sudah dibalas ${esc(rupiahSingkat(s.keluar))}` : ''}
            ${s.masukBelumDibalas[0]?.tanggal ? ` &middot; ${esc(jarakWaktu(s.masukBelumDibalas[0].tanggal))}` : ''}
          </div>
        </div>
        <div class="amt">${esc(rupiah(s.saldo))}<span class="sub">saran ${esc(rupiahSingkat(s.saran))}</span></div>
      </a>`).join('')}
  </div>`;
}

function onboarding() {
  return `
  <div class="card">
    <h2>Belum ada catatan</h2>
    <p class="small muted">Aplikasi ini mencatat dua arah: sumbangan yang <strong>masuk</strong> ke acara Anda,
    dan yang <strong>Anda berikan</strong> ke acara orang lain. Dari keduanya dihitung siapa yang masih
    harus Anda balas dan berapa.</p>
    <div class="btn-row">
      <a class="btn btn-primary" href="#/catat?arah=masuk">Catat sumbangan masuk</a>
      <a class="btn" href="#/impor">Impor dari Excel</a>
    </div>
  </div>
  <div class="card flat small">
    <h3>Alur singkat</h3>
    <ol style="margin:0;padding-left:1.1rem">
      <li>Buat acara Anda di menu <a href="#/acara">Acara</a> (opsional, boleh langsung mencatat).</li>
      <li>Catat tamu beserta uang/barangnya lewat tab <a href="#/catat">Catat</a>.</li>
      <li>Saat orang itu hajatan, buka namanya di <a href="#/orang">Orang</a> lalu tekan
          <em>Catat balasan</em> &mdash; saldonya otomatis lunas.</li>
      <li>Aktifkan sinkron cloud di <a href="#/pengaturan">Pengaturan</a> agar data tidak hilang bila HP rusak.</li>
    </ol>
  </div>`;
}
