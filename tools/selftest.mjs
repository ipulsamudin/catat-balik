// Self-test tanpa dependensi untuk modul perhitungan.
// Jalankan: node tools/selftest.mjs   (dipakai juga oleh GitHub Actions)

import {
  parseNominal, rupiah, ribuan, rupiahSingkat, tanggal, hariIni, selisihHari,
  parseTanggalFleksibel, inisial, normalNama, esc, uuid, jarakWaktu,
} from '../assets/js/fmt.js';

import {
  hitungNeraca, prioritasBalas, ringkasan, saranBalasan, agenda, rekapAcara,
  cariEntri, idSudahDibalas, nilaiEntri, deskripsiEntri, validasiEntri,
  cariOrangByNama, statusEntri, aktif,
} from '../assets/js/model.js';

import {
  toCsv, parseDelimited, deteksiPemisah, barisEntri, barisOrang, KOLOM_ENTRI,
  backupObjek, bacaBackup, templateImpor,
} from '../assets/js/csv.js';

import { dataContoh, ORANG } from './data-contoh.mjs';

let lulus = 0;
const gagal = [];

function cek(nama, benar, detail = '') {
  if (benar) { lulus++; return; }
  gagal.push(`${nama}${detail ? ` — ${detail}` : ''}`);
}

function sama(nama, dapat, harap) {
  const a = JSON.stringify(dapat);
  const b = JSON.stringify(harap);
  cek(nama, a === b, `dapat ${a}, diharapkan ${b}`);
}

// ---------------------------------------------------------------- data uji --
// Skenario lengkap ada di tools/data-contoh.mjs (dipakai juga oleh smoke test).

const d = dataContoh();

const HARI_INI = '2026-11-16';

// ------------------------------------------------------------------- fmt ----

sama('parseNominal titik ribuan', parseNominal('150.000'), 150000);
sama('parseNominal dengan Rp', parseNominal('Rp 2.500'), 2500);
sama('parseNominal singkatan rb', parseNominal('100rb'), 100000);
sama('parseNominal singkatan jt koma', parseNominal('1,5jt'), 1500000);
sama('parseNominal angka polos', parseNominal('75000'), 75000);
sama('parseNominal kosong', parseNominal(''), 0);
sama('parseNominal angka', parseNominal(45000), 45000);
cek('rupiah memberi prefix', rupiah(150000) === 'Rp 150.000', rupiah(150000));
cek('rupiah negatif', rupiah(-5000) === '-Rp 5.000', rupiah(-5000));
sama('ribuan', ribuan(1234567), '1.234.567');
cek('rupiahSingkat juta', rupiahSingkat(1250000) === 'Rp 1,25 jt', rupiahSingkat(1250000));
cek('rupiahSingkat ribu', rupiahSingkat(150000) === 'Rp 150 rb', rupiahSingkat(150000));
sama('tanggal tampil', tanggal('2026-11-16'), '16 Nov 2026');
sama('tanggal kosong', tanggal(''), '-');
sama('hariIni berformat ISO', /^\d{4}-\d{2}-\d{2}$/.test(hariIni()), true);
sama('selisihHari', selisihHari('2026-11-16', '2026-11-20'), 4);
sama('selisihHari mundur', selisihHari('2026-11-20', '2026-11-16'), -4);
sama('parseTanggal ISO', parseTanggalFleksibel('2026-11-16'), '2026-11-16');
sama('parseTanggal d/m/Y', parseTanggalFleksibel('16/11/2026'), '2026-11-16');
sama('parseTanggal d-m-Y pendek', parseTanggalFleksibel('5-1-26'), '2026-01-05');
sama('parseTanggal nama bulan id', parseTanggalFleksibel('16 Nov 2026'), '2026-11-16');
sama('parseTanggal nama bulan en', parseTanggalFleksibel('3 Aug 2025'), '2025-08-03');
sama('parseTanggal serial excel', parseTanggalFleksibel('45000'), '2023-03-15');
sama('parseTanggal sampah', parseTanggalFleksibel('entah'), null);
sama('inisial dua kata', inisial('Budi Santoso'), 'BS');
sama('inisial satu kata', inisial('Budi'), 'BU');
sama('normalNama', normalNama('  Budi   SANTOSO!! '), 'budi santoso');
sama('esc', esc('<b>&"</b>'), '&lt;b&gt;&amp;&quot;&lt;/b&gt;');
cek('uuid berformat', /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(uuid()), uuid());
cek('jarakWaktu lampau', jarakWaktu('2026-11-15', HARI_INI) === 'kemarin', jarakWaktu('2026-11-15', HARI_INI));
cek('jarakWaktu depan', jarakWaktu('2026-12-20', HARI_INI).endsWith('lagi'), jarakWaktu('2026-12-20', HARI_INI));

// ----------------------------------------------------------------- model ----

sama('aktif membuang yang terhapus', aktif(d.entries).length, 7);
sama('nilaiEntri uang', nilaiEntri({ jenis: 'uang', nominal: 50000 }), 50000);
sama('nilaiEntri barang pakai taksiran', nilaiEntri({ jenis: 'barang', nilai_taksir: 90000 }), 90000);
sama('nilaiEntri barang tanpa taksiran', nilaiEntri({ jenis: 'barang' }), 0);
sama('deskripsiEntri barang', deskripsiEntri({ jenis: 'barang', barang_nama: 'Gula', barang_jumlah: 5, barang_satuan: 'kg' }), '5 kg Gula');
sama('deskripsiEntri uang', deskripsiEntri({ jenis: 'uang' }), 'Uang');

const neraca = hitungNeraca(d, HARI_INI);
const budi = neraca.peta.get(ORANG.budi);
const siti = neraca.peta.get(ORANG.siti);
const agus = neraca.peta.get(ORANG.agus);

sama('Budi masuk (entri terhapus diabaikan)', budi.masuk, 200000);
sama('Budi keluar', budi.keluar, 200000);
sama('Budi lunas', budi.saldo, 0);
sama('Budi tidak punya masuk belum dibalas', budi.masukBelumDibalas.length, 0);
sama('Siti masuk uang + barang taksir', siti.masuk, 390000);
sama('Siti saldo', siti.saldo, 290000);
sama('Siti dua entri masuk belum dibalas', siti.masukBelumDibalas.length, 2);
sama('Agus masuk (barang tanpa taksiran = 0)', agus.masuk, 120000);
sama('Agus saldo', agus.saldo, 120000);

const dibalas = idSudahDibalas(d.entries);
sama('x1 ditandai sudah dibalas', dibalas.has('x1'), true);
sama('x3 belum dibalas', dibalas.has('x3'), false);
sama('status entri masuk dibalas', statusEntri({ id: 'x1', arah: 'masuk' }, dibalas), 'dibalas');
sama('status entri keluar balasan', statusEntri({ id: 'x2', arah: 'keluar', balas_untuk_id: 'x1' }, dibalas), 'balasan');

sama('saranBalasan membulatkan ke atas', saranBalasan(290000, { pembulatan: 50000 }), 300000);
sama('saranBalasan tepat kelipatan', saranBalasan(200000, { pembulatan: 50000 }), 200000);
sama('saranBalasan saldo nol', saranBalasan(0, { pembulatan: 50000 }), 0);
sama('saranBalasan dengan inflasi 10%/tahun selama 2 tahun',
  saranBalasan(100000, { pembulatan: 1000, penyesuaian: 10 }, 2), 121000);

const prio = prioritasBalas(d, HARI_INI);
sama('prioritas hanya yang berutang', prio.length, 2);
sama('prioritas terbesar di atas', prio[0].orang.id, ORANG.siti);
sama('prioritas kedua', prio[1].orang.id, ORANG.agus);
sama('prioritas Budi tidak muncul', prio.some((p) => p.orang.id === ORANG.budi), false);
sama('saran untuk Siti', prio[0].saran, 300000);
sama('saran untuk Agus', prio[1].saran, 150000);

const r = ringkasan(d, HARI_INI);
sama('total masuk', r.totalMasuk, 710000);
sama('total keluar', r.totalKeluar, 300000);
sama('perlu dibalas = jumlah saldo positif', r.perluDibalas, 410000);
sama('jumlah orang perlu dibalas', r.nPerluDibalas, 2);
sama('orang aktif saja yang dihitung', r.nOrang, 3);
sama('acara aktif saja', r.nAcara, 2);
sama('barang tanpa taksiran terdeteksi', r.barangTanpaTaksiran, 1);

const jadwal = agenda(d, HARI_INI);
sama('agenda hanya acara orang lain yang belum lewat', jadwal.length, 1);
sama('agenda menunjuk acara Agus', jadwal[0].acara.id, 'e-khitan');
sama('agenda membawa saldo orangnya', jadwal[0].saldo, 120000);
sama('agenda memberi saran bawaan', jadwal[0].saran, 150000);
sama('agenda menghitung sisa hari', jadwal[0].sisaHari, 34);

const rekap = rekapAcara(d, 'e-nikah');
sama('rekap jumlah baris', rekap.nTamu, 5);
sama('rekap total uang', rekap.uang, 620000);
sama('rekap total barang', rekap.barang, 90000);
sama('rekap total', rekap.total, 710000);

sama('cariEntri tanpa filter', cariEntri(d, {}).baris.length, 7);
sama('cariEntri filter masuk', cariEntri(d, { arah: 'masuk' }).baris.length, 5);
sama('cariEntri filter barang', cariEntri(d, { jenis: 'barang' }).baris.length, 2);
sama('cariEntri filter belum dibalas', cariEntri(d, { status: 'belum' }).baris.length, 4);
sama('cariEntri filter acara', cariEntri(d, { eventId: 'e-nikah' }).baris.length, 5);
sama('cariEntri pencarian nama', cariEntri(d, { q: 'siti' }).baris.length, 3);
sama('cariEntri pencarian barang', cariEntri(d, { q: 'kipas' }).baris.length, 1);
sama('cariEntri total nilai', cariEntri(d, { arah: 'keluar' }).total, 300000);
sama('cariEntri urut nilai terbesar', cariEntri(d, { urut: 'nilai-turun' }).baris[0].nilai, 300000);

sama('cariOrangByNama tidak peduli huruf besar', cariOrangByNama(d.people, 'budi SANTOSO')?.id, ORANG.budi);
sama('cariOrangByNama orang terhapus tidak ketemu', cariOrangByNama(d.people, 'Rina Lama'), null);

sama('validasi entri benar', validasiEntri({ person_id: 'p', arah: 'masuk', tanggal: '2026-01-01', jenis: 'uang', nominal: 1000 }), []);
sama('validasi nominal nol ditolak',
  validasiEntri({ person_id: 'p', arah: 'masuk', tanggal: '2026-01-01', jenis: 'uang', nominal: 0 }).length, 1);
sama('validasi tanpa nama ditolak',
  validasiEntri({ arah: 'masuk', tanggal: '2026-01-01', jenis: 'uang', nominal: 1000 }).length, 1);
sama('validasi tanggal salah ditolak',
  validasiEntri({ person_id: 'p', arah: 'masuk', tanggal: '16/11/2026', jenis: 'uang', nominal: 1000 }).length, 1);
sama('validasi barang tanpa nama ditolak',
  validasiEntri({ person_id: 'p', arah: 'masuk', tanggal: '2026-01-01', jenis: 'barang' }).length, 1);

// ------------------------------------------------------------------- csv ----

sama('deteksiPemisah titik koma', deteksiPemisah('a;b;c\n1;2;3'), ';');
sama('deteksiPemisah koma', deteksiPemisah('a,b,c\n1,2,3'), ',');
sama('deteksiPemisah tab', deteksiPemisah('a\tb\tc\n1\t2\t3'), '\t');

const csvUji = toCsv(
  [{ a: 'Budi; Santoso', b: 'baris\nbaru', c: 'kutip "ini"' }],
  [['a', 'Nama'], ['b', 'Catatan'], ['c', 'Lain']],
  { pemisah: ';', bom: false },
);
const balik = parseDelimited(csvUji, ';');
sama('csv judul', balik.judul, ['Nama', 'Catatan', 'Lain']);
sama('csv nilai dengan pemisah', balik.baris[0][0], 'Budi; Santoso');
sama('csv nilai dengan baris baru', balik.baris[0][1], 'baris\nbaru');
sama('csv nilai dengan kutip', balik.baris[0][2], 'kutip "ini"');

cek('toCsv menambah BOM untuk Excel', toCsv([], [['a', 'A']]).charCodeAt(0) === 0xfeff);
sama('parseDelimited membuang BOM', parseDelimited('﻿a;b\n1;2').judul, ['a', 'b']);
sama('parseDelimited baris kosong diabaikan', parseDelimited('a;b\n\n1;2\n\n').baris.length, 1);

const ekspor = barisEntri(d);
sama('ekspor jumlah baris', ekspor.length, 7);
sama('ekspor terurut tanggal naik', ekspor[0].tanggal, '2024-06-10');
sama('ekspor status belum dibalas', ekspor.find((x) => x.nama === 'Agus Wijaya').status, 'Belum dibalas');
sama('ekspor nama kolom lengkap', KOLOM_ENTRI.length, 13);
sama('ekspor per orang', barisOrang(neraca.list).length, 3);
sama('ekspor per orang saldo tidak negatif', barisOrang(neraca.list).every((x) => x.saldo >= 0), true);

const template = parseDelimited(templateImpor(';'), ';');
sama('template punya contoh baris', template.baris.length, 2);
cek('template memuat kolom Nama', template.judul.includes('Nama'), template.judul.join('|'));

const backup = backupObjek({ people: d.people, events: d.events, entries: d.entries, settings: d.settings });
sama('backup menyimpan entri', backup.entries.length, 8);
sama('backup tidak membawa anon key', backup.settings.anonKey, undefined);
sama('baca backup kembali', bacaBackup(JSON.stringify(backup)).entries.length, 8);
let tertangkap = '';
try { bacaBackup('{"aplikasi":"lain"}'); } catch (err) { tertangkap = err.message; }
cek('backup aplikasi lain ditolak', /bukan backup/i.test(tertangkap), tertangkap);

// ---------------------------------------------------------------- laporan ---

console.log(`\n  ${lulus} pemeriksaan lulus`);
if (gagal.length) {
  console.error(`  ${gagal.length} GAGAL:\n`);
  for (const g of gagal) console.error(`   - ${g}`);
  process.exit(1);
}
console.log('  Semua perhitungan sesuai harapan.\n');
