// Data contoh yang dipakai bersama oleh selftest.mjs dan smoke.mjs.
//
// Skenarionya: hajatan saya Juni 2024 dengan tiga tamu —
//  * Budi  : memberi 200rb, sudah saya balas penuh (lunas)
//  * Siti  : memberi 300rb + barang taksiran 90rb, baru saya balas 100rb (sisa 290rb)
//  * Agus  : memberi 120rb + barang tanpa taksiran, belum dibalas sama sekali,
//            dan punya acara khitanan yang akan datang
// Ditambah satu orang terhapus dan satu entri terhapus untuk menguji soft delete.

export const ORANG = {
  budi: 'p-budi',
  siti: 'p-siti',
  agus: 'p-agus',
  rina: 'p-rina',
};

export const SETTINGS = {
  namaSaya: 'Keluarga Uji',
  pembulatan: 50000,
  penyesuaian: 0,
  pemisahCsv: ';',
  supabaseUrl: '',
  anonKey: '',
};

export const dataContoh = () => ({
  settings: { ...SETTINGS },
  people: [
    { id: ORANG.budi, nama: 'Budi Santoso', hubungan: 'tetangga', alamat: 'RT 03' },
    { id: ORANG.siti, nama: 'Siti Aminah', hubungan: 'keluarga' },
    { id: ORANG.agus, nama: 'Agus Wijaya', hubungan: 'kerja' },
    { id: ORANG.rina, nama: 'Rina Lama', hubungan: 'teman', deleted_at: '2025-01-01T00:00:00Z' },
  ],
  events: [
    { id: 'e-nikah', nama: 'Pernikahan Dina', jenis: 'pernikahan', tanggal: '2024-06-10', pihak: 'saya' },
    { id: 'e-khitan', nama: 'Khitanan Anak Agus', jenis: 'khitanan', tanggal: '2026-12-20', pihak: 'orang_lain', person_id: ORANG.agus },
    { id: 'e-hapus', nama: 'Acara dihapus', jenis: 'lainnya', tanggal: '2024-01-01', pihak: 'saya', deleted_at: '2024-02-01T00:00:00Z' },
  ],
  entries: [
    { id: 'x1', arah: 'masuk', person_id: ORANG.budi, event_id: 'e-nikah', tanggal: '2024-06-10', jenis: 'uang', nominal: 200000 },
    { id: 'x2', arah: 'keluar', person_id: ORANG.budi, tanggal: '2025-03-01', jenis: 'uang', nominal: 200000, balas_untuk_id: 'x1' },
    { id: 'x3', arah: 'masuk', person_id: ORANG.siti, event_id: 'e-nikah', tanggal: '2024-06-10', jenis: 'uang', nominal: 300000 },
    { id: 'x4', arah: 'masuk', person_id: ORANG.siti, event_id: 'e-nikah', tanggal: '2024-06-10', jenis: 'barang', barang_nama: 'Gula', barang_jumlah: 5, barang_satuan: 'kg', nilai_taksir: 90000 },
    { id: 'x5', arah: 'keluar', person_id: ORANG.siti, tanggal: '2025-08-17', jenis: 'uang', nominal: 100000 },
    { id: 'x6', arah: 'masuk', person_id: ORANG.agus, event_id: 'e-nikah', tanggal: '2024-06-10', jenis: 'uang', nominal: 120000 },
    { id: 'x7', arah: 'masuk', person_id: ORANG.agus, event_id: 'e-nikah', tanggal: '2024-06-10', jenis: 'barang', barang_nama: 'Kipas angin' },
    { id: 'x8', arah: 'masuk', person_id: ORANG.budi, tanggal: '2024-06-10', jenis: 'uang', nominal: 999000, deleted_at: '2024-07-01T00:00:00Z' },
  ],
});

/** Bentuk yang persis sama dengan isi localStorage aplikasi. */
export const stateContoh = () => ({
  versi: 1,
  ...dataContoh(),
  outbox: [],
  cursors: {},
  lastSyncAt: null,
});
