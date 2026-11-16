// Potongan UI yang dipakai berulang: banner, konfirmasi, unduh/baca file,
// serta pembantu kecil untuk merakit HTML.

import { esc } from './fmt.js';

// ---------- banner ----------

let timerBanner = null;

export function banner(teks, { kind = 'info', aksi = null, durasi = 0 } = {}) {
  const el = document.getElementById('banner');
  const txt = document.getElementById('banner-text');
  const btn = document.getElementById('banner-action');
  if (!el || !txt || !btn) return;

  txt.textContent = teks;
  el.dataset.kind = kind;
  el.hidden = false;

  btn.hidden = !aksi;
  btn.onclick = null;
  if (aksi) {
    btn.textContent = aksi.label;
    btn.onclick = () => { tutupBanner(); aksi.onClick(); };
  }

  clearTimeout(timerBanner);
  if (durasi) timerBanner = setTimeout(tutupBanner, durasi);
}

export function tutupBanner() {
  const el = document.getElementById('banner');
  if (el) el.hidden = true;
}

export const sukses = (teks) => banner(teks, { durasi: 2600 });
export const galat = (teks) => banner(teks, { kind: 'galat', durasi: 6000 });

export function konfirmasi(teks) {
  return window.confirm(teks);
}

// ---------- file ----------

export function unduhFile(namaFile, isi, mime = 'text/plain;charset=utf-8') {
  const blob = isi instanceof Blob ? isi : new Blob([isi], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = namaFile;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function pilihFile(accept = '') {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    if (accept) input.accept = accept;
    input.onchange = () => resolve(input.files && input.files[0] ? input.files[0] : null);
    input.click();
  });
}

export function bacaTeks(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result || ''));
    fr.onerror = () => reject(fr.error || new Error('Gagal membaca file.'));
    fr.readAsText(file, 'utf-8');
  });
}

// ---------- perakit HTML ----------

export function judul(teks, sub = '') {
  return `<div class="page-head"><h1>${esc(teks)}</h1>${sub ? `<p class="sub">${esc(sub)}</p>` : ''}</div>`;
}

export function kosong(teks, aksiHtml = '') {
  return `<div class="card"><div class="empty"><p>${esc(teks)}</p>${aksiHtml}</div></div>`;
}

export function opsi(daftar, terpilih) {
  return daftar
    .map(([nilai, label]) => `<option value="${esc(nilai)}"${String(nilai) === String(terpilih ?? '') ? ' selected' : ''}>${esc(label)}</option>`)
    .join('');
}

/** Delegasi event: satu listener untuk banyak elemen hasil render. */
export function pada(host, selektor, event, fn) {
  host.addEventListener(event, (ev) => {
    const target = ev.target.closest(selektor);
    if (target && host.contains(target)) fn(ev, target);
  });
}

export function nilaiForm(form) {
  const out = {};
  for (const [k, v] of new FormData(form)) out[k] = typeof v === 'string' ? v.trim() : v;
  return out;
}
