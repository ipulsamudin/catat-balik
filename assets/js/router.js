// Router berbasis hash. GitHub Pages tidak punya URL rewrite, jadi path biasa
// akan 404 saat halaman di-refresh - hash aman di Pages maupun XAMPP.

export function parseHash(hash) {
  const mentah = String(hash || '').replace(/^#/, '') || '/';
  const [jalur, qs] = mentah.split('?');
  const query = {};
  for (const [k, v] of new URLSearchParams(qs || '')) query[k] = v;
  return { jalur: jalur || '/', query };
}

/** Cocokkan pola seperti "/orang/:id" dengan jalur nyata. */
export function cocok(pola, jalur) {
  const a = pola.split('/').filter(Boolean);
  const b = jalur.split('/').filter(Boolean);
  if (a.length !== b.length) return null;
  const params = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(':')) params[a[i].slice(1)] = decodeURIComponent(b[i]);
    else if (a[i] !== b[i]) return null;
  }
  return params;
}

export function ke(jalur) {
  const target = jalur.startsWith('#') ? jalur : `#${jalur}`;
  if (location.hash === target) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = target;
}

export function gantiTanpaRiwayat(jalur) {
  const target = jalur.startsWith('#') ? jalur : `#${jalur}`;
  history.replaceState(null, '', target);
}

export function querystring(obj) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) if (v !== null && v !== undefined && v !== '') p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
}
