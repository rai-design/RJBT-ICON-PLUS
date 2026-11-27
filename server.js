const express = require('express');
const cors = require('cors');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const ExcelJS = require('exceljs');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ==========================================================
// KONFIGURASI EXPRESS SESSION (PROTEKSI SERVER-SIDE)
// ==========================================================
app.use(
  session({
    secret: 'pln_icon_plus_rjbt_secret_key_2026',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000, // Sesi berlaku 24 Jam
      httpOnly: true,
    },
  })
);

// Middleware Proteksi API (Auth Guard API)
function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  return res.status(401).json({ error: 'Akses ditolak! Silakan login terlebih dahulu.' });
}

// ==========================================================
// 1. ROUTE UTAMA & STATIC FILES CONFIGURATION
// ==========================================================

// Menyajikan berkas statis dari folder public tanpa index.html otomatis
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// Route Root (Selalu me-redirect pengguna ke login.html)
app.get('/', (req, res) => {
  res.redirect('/login.html');
});

// ==========================================================
// 2. KONEKSI DATABASE MYSQL (db_rjbt)
// ==========================================================
const db = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '', // Isi password phpMyAdmin jika ada
  database: 'db_rjbt',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

db.getConnection()
  .then((conn) => {
    console.log('✅ Terhubung ke Database MySQL (db_rjbt)');
    conn.release();
  })
  .catch((err) => {
    console.error('❌ Gagal terhubung ke Database MySQL:', err.message);
  });

// Helper Format Tanggal dari DB MySQL (YYYY-MM-DD)
function formatDate(dateVal) {
  if (!dateVal || dateVal === '-' || dateVal === '0000-00-00') return '';
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return String(dateVal);
  return d.toISOString().split('T')[0];
}

// Helper Hitung Progres & Status Dinamis Berdasarkan Kategori POP
function calculateProgressAndStatus(kategori, t1, t2, t3, t4) {
  const kat = String(kategori || '').trim().toUpperCase();
  const hasT1 = Boolean(t1 && t1 !== '-' && t1 !== '');
  const hasT2 = Boolean(t2 && t2 !== '-' && t2 !== '');
  const hasT3 = Boolean(t3 && t3 !== '-' && t3 !== '');
  const hasT4 = Boolean(t4 && t4 !== '-' && t4 !== '');

  let target = 1;
  let filledCount = 0;

  if (kat === 'POP-SB') {
    target = 4;
    filledCount = (hasT1 ? 1 : 0) + (hasT2 ? 1 : 0) + (hasT3 ? 1 : 0) + (hasT4 ? 1 : 0);
  } else if (kat === 'POP-B') {
    target = 2;
    filledCount = (hasT1 ? 1 : 0) + (hasT2 ? 1 : 0);
  } else {
    target = 1;
    filledCount = hasT1 ? 1 : 0;
  }

  const persentase = Math.min(1.0, filledCount / target);
  const status = persentase >= 1.0 ? 'SELESAI' : 'BELUM';
  const done = persentase >= 1.0 ? 1 : 0;

  return { persentase, status, done };
}

// Helper Menentukan Resume Index Berdasarkan Health Index (0-59% = NEED CHECK)
function getResumeIndex(hi) {
  const numHi = Number(hi) || 0;
  if (numHi >= 80) return 'GOOD CONDITION';
  if (numHi >= 60) return 'WARNING';
  return 'NEED CHECK';
}

// ==========================================================
// 3. ENDPOINT AUTHENTICATION (LOGIN & LOGOUT MULTI-DEVICE)
// ==========================================================

// Kredensial tetap sesuai arahan
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = '1c0nplus';

// A. Endpoint Login (Mendukung banyak perangkat login bersamaan tanpa tabrakan)
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username dan password wajib diisi!' });
  }

  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    // Buat ID sesi baru yang unik untuk setiap browser/perangkat agar tidak saling menimpa
    return req.session.regenerate((err) => {
      if (err) {
        console.error('Session regenerate error:', err);
        return res.status(500).json({ error: 'Gagal membuat sesi login.' });
      }

      const userData = {
        username: ADMIN_USERNAME,
        nama: 'Administrator RJBT',
        role: 'Admin'
      };

      req.session.user = userData;

      req.session.save((saveErr) => {
        if (saveErr) {
          console.error('Session save error:', saveErr);
          return res.status(500).json({ error: 'Gagal menyimpan sesi login.' });
        }
        return res.json({ message: 'Login berhasil!', user: userData });
      });
    });
  }

  return res.status(401).json({ error: 'Username atau password salah!' });
});

// B. Endpoint Logout (Hanya menghapus sesi pada perangkat yang menekan logout)
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Gagal melakukan logout.' });
    }
    res.clearCookie('connect.sid');
    return res.json({ message: 'Logout berhasil.' });
  });
});

// ==========================================================
// 4. ENDPOINT READ & EXPORT: PM Power Supply
// ==========================================================

app.get('/api/power-supply', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM pm_powersupply WHERE id_pop IS NOT NULL AND id_pop != '' AND id_pop != '-'"
    );

    const formattedData = rows.map((row, index) => ({
      no: row.no || row.no_excel || row.excel_id || index + 1,
      idPop: row.id_pop ?? '-',
      lokasi: row.lokasi ?? '-',
      area: row.area ?? row.kp ?? 'LAINNYA',
      kategori: row.kategori ?? '-',
      model: row.model ?? '-',

      rectifierBrand1: row.rectifier_brand_1 ?? row.rectifier_brand ?? '-',
      tipeModulRecti1: row.tipe_modul_recti_1 ?? row.tipe_modul_recti ?? '-',
      modulRecti1Unit: row.modul_recti_1_unit ?? row.modul_recti_unit ?? 0,
      kapTiapModulRecti1: row.kap_tiap_modul_recti_1_a_dc ?? row.kap_tiap_modul_a ?? '-',
      kapTotalModulRecti1: row.kap_total_modul_recti_1_a ?? row.kap_total_modul_a ?? '-',
      statusModulRecti1: row.status_modul_recti_1 ?? row.status_modul_recti ?? '-',
      bebanRectiA: row.beban_recti_a ?? 0,

      merkBatt: row.merk_batt ?? '-',
      tipeBatt: row.tipe_batt ?? '-',
      jenisBatt: row.jenis_batt ?? '-',
      jmlBatt: row.jml_batt ?? '-',
      kapBattAh: row.kap_batt_ah ?? 0,
      kemampuanJam: row.kemampuan_jam ?? 0,
      statusKemampuan: row.status_kemampuan ?? '-',
      statusUmurBatt: row.status_umur_batt ?? '-',

      insertDate: formatDate(row.insert_date),
      butuhRecti: row.butuh_recti ?? '-',
      butuhBattAh: row.butuh_batt_ah ?? row.butuh_plus_batt_ah ?? '-',
      prioritasBatt: row.prioritas_batt ?? '-',
      status: row.status ?? '-',
      healthIndexPowerSupply: (row.health_index_power_supply !== null && row.health_index_power_supply !== undefined && row.health_index_power_supply !== '') 
        ? row.health_index_power_supply 
        : (row.health_index_ps ?? 100),

      butuhDummy2025: row.butuh_dummy_2025 ?? '-',
      lastDummy: row.last_dummy ?? '-',
      tanggalDummy2025: formatDate(row.tanggal_dummy_2025),
      doneDummy: row.done_dummy ?? '-',
      jumlahBattBank: row.jumlah_batt_bank ?? '-',
      kapBattAfterDummyAh: row.kap_batt_after_dummy_ah ?? '-',

      kapBank1Ah: row.kap_bank_1_ah ?? row.kap_bank_1 ?? 0,
      hasilDummyBank1: row.hasil_dummy_bank_1 ?? 0,
      kapBank2Ah: row.kap_bank_2_ah ?? row.kap_bank_2 ?? 0,
      hasilDummyBank2: row.hasil_dummy_bank_2 ?? 0,
      kapBank3Ah: row.kap_bank_3_ah ?? row.kap_bank_3 ?? 0,
      hasilDummyBank3: row.hasil_dummy_bank_3 ?? 0,

      teganganPln: row.tegangan_pln ?? 'NORMAL',
      teganganBattery: row.tegangan_battery ?? 'NORMAL',
      kondisiFisikBatteryRecti: row.kondisi_fisik_battery_recti ?? row.kondisi_fisik ?? 'NORMAL',
      externalAlarm: row.external_alarm ?? 'NORMAL'
    }));

    res.json({ total: formattedData.length, data: formattedData });
  } catch (error) {
    console.error('Error fetching data from MySQL (Power Supply):', error);
    res.status(500).json({ error: 'Gagal mengambil data dari database.' });
  }
});

app.put('/api/power-supply/:idPop', requireAuth, async (req, res) => {
  const { idPop } = req.params;
  const data = req.body;

  try {
    const query = `
      UPDATE pm_powersupply 
      SET 
        rectifier_brand_1 = ?, kap_total_modul_recti_1_a = ?, tipe_modul_recti_1 = ?, status_modul_recti_1 = ?,
        modul_recti_1_unit = ?, beban_recti_a = ?, kap_tiap_modul_recti_1_a_dc = ?, merk_batt = ?,
        jml_batt = ?, tipe_batt = ?, kap_batt_ah = ?, jenis_batt = ?, kemampuan_jam = ?, status_umur_batt = ?,
        status_kemampuan = ?, insert_date = ?, prioritas_batt = ?, butuh_recti = ?, status = ?,
        butuh_batt_ah = ?, health_index_power_supply = ?, butuh_dummy_2025 = ?, done_dummy = ?,
        last_dummy = ?, jumlah_batt_bank = ?, tanggal_dummy_2025 = ?, kap_batt_after_dummy_ah = ?,
        tegangan_pln = ?, kondisi_fisik_battery_recti = ?, tegangan_battery = ?, external_alarm = ?
      WHERE id_pop = ?
    `;

    const values = [
      data.rectifierBrand1, data.kapTotalModulRecti1, data.tipeModulRecti1, data.statusModulRecti1,
      data.modulRecti1Unit, data.bebanRectiA, data.kapTiapModulRecti1, data.merkBatt,
      data.jmlBatt, data.tipeBatt, data.kapBattAh, data.jenisBatt, data.kemampuanJam, data.statusUmurBatt,
      data.statusKemampuan, data.insertDate || null, data.prioritasBatt, data.butuhRecti, data.status,
      data.butuhBattAh, data.healthIndexPowerSupply, data.butuhDummy2025, data.doneDummy,
      data.lastDummy, data.jumlahBattBank, data.tanggalDummy2025 || null, data.kapBattAfterDummyAh,
      data.teganganPln, data.kondisiFisikBatteryRecti, data.teganganBattery, data.externalAlarm,
      idPop
    ];

    const [result] = await db.query(query, values);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'ID POP tidak ditemukan.' });
    }
    res.json({ message: 'Data Power Supply berhasil diperbarui!' });
  } catch (error) {
    console.error('Error updating Power Supply:', error);
    res.status(500).json({ error: 'Gagal memperbarui data di database.' });
  }
});

app.get('/api/export/power-supply', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM pm_powersupply WHERE id_pop IS NOT NULL AND id_pop != '' AND id_pop != '-'"
    );

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('PM POWERSUPPLY RJBT1');

    const headers = [
      'No', 'ID POP', 'Lokasi', 'AREA', 'Kategori', 'Model',
      'Rectifier Brand 1', 'Tipe Modul Recti 1', 'Modul Recti 1(unit)', 'Kap. Tiap Modul Recti 1(A DC)',
      'Kap. Total Modul Recti 1 (A)', 'Status Modul Recti 1', 'Beban Recti (A)', 'Merk Batt',
      'tipe batt', 'Jenis Batt', 'Jml Batt', 'Kap. Batt (AH)', 'Kemampuan (jam)', 'Status Kemampuan',
      'Insert Date', 'Status Umur Batt', 'Butuh Recti', 'Butuh +Batt (AH)', 'prioritas batt',
      'Butuh Dummy (2025)', 'Last Dummy', 'Tanggal Dummy 2025', 'DONE DUMMY', 'STATUS',
      'Jumlah Batt (Bank)', 'Kap. Batt After Dummy (AH)',
      'Kap. Bank 1 (AH)', 'Hasil Dummy Bank 1', 'Kap. Bank 2 (AH)', 'Hasil Dummy Bank 2',
      'Kap. Bank 3 (AH)', 'Hasil Dummy Bank 3', 'Kap. Bank 4 (AH)', 'Hasil Dummy Bank 4',
      'Kap. Bank 5 (AH)', 'Hasil Dummy Bank 5', 'Kap. Bank 6 (AH)', 'Hasil Dummy Bank 6',
      'Kap. Bank 7 (AH)', 'Hasil Dummy Bank 7', 'Kap. Bank 8 (AH)', 'Hasil Dummy Bank 8',
      'Kap. Bank 9 (AH)', 'Hasil Dummy Bank 9',
      'TEGANGAN PLN', 'TEGANGAN BATTERY', 'KONDISI FISIK BATTERY/RECTI', 'EXTERNAL ALARM', 'HEALTH INDEX POWER SUPPLY'
    ];

    worksheet.columns = headers.map(header => ({ header, key: header, width: Math.max(header.length + 5, 12) }));

    rows.forEach((row, index) => {
      worksheet.addRow({
        'No': row.no || row.no_excel || (index + 1),
        'ID POP': row.id_pop || '-',
        'Lokasi': row.lokasi || '-',
        'AREA': row.area || row.kp || '-',
        'Kategori': row.kategori || '-',
        'Model': row.model || '-',
        'Rectifier Brand 1': row.rectifier_brand_1 || row.rectifier_brand || '-',
        'Tipe Modul Recti 1': row.tipe_modul_recti_1 || row.tipe_modul_recti || '-',
        'Modul Recti 1(unit)': row.modul_recti_1_unit ?? 0,
        'Kap. Tiap Modul Recti 1(A DC)': row.kap_tiap_modul_recti_1_a_dc ?? 0,
        'Kap. Total Modul Recti 1 (A)': row.kap_total_modul_recti_1_a ?? 0,
        'Status Modul Recti 1': row.status_modul_recti_1 || '-',
        'Beban Recti (A)': row.beban_recti_a ?? 0,
        'Merk Batt': row.merk_batt || '-',
        'tipe batt': row.tipe_batt || '-',
        'Jenis Batt': row.jenis_batt || '-',
        'Jml Batt': row.jml_batt || '-',
        'Kap. Batt (AH)': row.kap_batt_ah ?? 0,
        'Kemampuan (jam)': row.kemampuan_jam ? Number(Number(row.kemampuan_jam).toFixed(2)) : 0,
        'Status Kemampuan': row.status_kemampuan || '-',
        'Insert Date': formatDate(row.insert_date) || '-',
        'Status Umur Batt': row.status_umur_batt || '-',
        'Butuh Recti': row.butuh_recti || '-',
        'Butuh +Batt (AH)': row.butuh_batt_ah || row.butuh_plus_batt_ah || '-',
        'prioritas batt': row.prioritas_batt || '-',
        'Butuh Dummy (2025)': row.butuh_dummy_2025 || '-',
        'Last Dummy': row.last_dummy || '-',
        'Tanggal Dummy 2025': formatDate(row.tanggal_dummy_2025) || '-',
        'DONE DUMMY': row.done_dummy || '-',
        'STATUS': row.status || '-',
        'Jumlah Batt (Bank)': row.jumlah_batt_bank ?? 0,
        'Kap. Batt After Dummy (AH)': row.kap_batt_after_dummy_ah ?? 0,
        'Kap. Bank 1 (AH)': row.kap_bank_1_ah ?? row.kap_bank_1 ?? 0,
        'Hasil Dummy Bank 1': row.hasil_dummy_bank_1 ?? 0,
        'Kap. Bank 2 (AH)': row.kap_bank_2_ah ?? row.kap_bank_2 ?? 0,
        'Hasil Dummy Bank 2': row.hasil_dummy_bank_2 ?? 0,
        'Kap. Bank 3 (AH)': row.kap_bank_3_ah ?? row.kap_bank_3 ?? 0,
        'Hasil Dummy Bank 3': row.hasil_dummy_bank_3 ?? 0,
        'Kap. Bank 4 (AH)': row.kap_bank_4_ah ?? row.kap_bank_4 ?? 0,
        'Hasil Dummy Bank 4': row.hasil_dummy_bank_4 ?? 0,
        'Kap. Bank 5 (AH)': row.kap_bank_5_ah ?? row.kap_bank_5 ?? 0,
        'Hasil Dummy Bank 5': row.hasil_dummy_bank_5 ?? 0,
        'Kap. Bank 6 (AH)': row.kap_bank_6_ah ?? row.kap_bank_6 ?? 0,
        'Hasil Dummy Bank 6': row.hasil_dummy_bank_6 ?? 0,
        'Kap. Bank 7 (AH)': row.kap_bank_7_ah ?? row.kap_bank_7 ?? 0,
        'Hasil Dummy Bank 7': row.hasil_dummy_bank_7 ?? 0,
        'Kap. Bank 8 (AH)': row.kap_bank_8_ah ?? row.kap_bank_8 ?? 0,
        'Hasil Dummy Bank 8': row.hasil_dummy_bank_8 ?? 0,
        'Kap. Bank 9 (AH)': row.kap_bank_9_ah ?? row.kap_bank_9 ?? 0,
        'Hasil Dummy Bank 9': row.hasil_dummy_bank_9 ?? 0,
        'TEGANGAN PLN': row.tegangan_pln || 'NORMAL',
        'TEGANGAN BATTERY': row.tegangan_battery || 'NORMAL',
        'KONDISI FISIK BATTERY/RECTI': row.kondisi_fisik_battery_recti || row.kondisi_fisik || 'NORMAL',
        'EXTERNAL ALARM': row.external_alarm || 'NORMAL',
        'HEALTH INDEX POWER SUPPLY': row.health_index_power_supply ?? row.health_index_ps ?? 100
      });
    });

    const headerRow = worksheet.getRow(1);
    headerRow.height = 26;
    headerRow.eachCell((cell) => {
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '005B94' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="PM_Power_Supply_RJBT.xlsx"');

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error exporting Power Supply:', error);
    res.status(500).json({ error: 'Gagal mengeksport data Power Supply.' });
  }
});

// ==========================================================
// 5. ENDPOINT READ & EXPORT: PM POP
// ==========================================================

app.get('/api/pm-pop', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM pm_pop WHERE pop_id IS NOT NULL AND pop_id != '' AND pop_id != '-'"
    );

    const formattedData = rows.map((row, index) => ({
      no: row.no || index + 1,
      popId: row.pop_id ?? '-',
      popName: row.pop_name ?? '-',
      kategori: row.kategori ?? '-',
      wilayah: row.wilayah ?? '-',
      kp: row.kp ?? row.wilayah ?? '-',
      tikor: row.tikor ?? '-',
      servo: row.servo ?? '-',
      ptServo: row.pt_servo ?? row.mitra ?? '-',
      tahap1: formatDate(row.tahap_1),
      tahap2: formatDate(row.tahap_2),
      tahap3: formatDate(row.tahap_3),
      tahap4: formatDate(row.tahap_4),
      persentase: row.persentase ?? 0,
      status: row.status ?? 'BELUM',
      catatanHasilPm: row.catatan_hasil_pm ?? '-',
      done: row.done ?? 0,
      mitra: row.mitra ?? row.pt_servo ?? '-',
      picPmServo: row.pic_pm_servo ?? '-',
      wo: row.wo ?? '-',
      laporan: row.laporan ?? '-',

      linkBaTahap1: row.link_ba_tahap_1 ?? '-',
      linkBaTahap2: row.link_ba_tahap_2 ?? '-',
      linkBaTahap3: row.link_ba_tahap_3 ?? '-',
      linkBaTahap4: row.link_ba_tahap_4 ?? '-'
    }));

    res.json({ total: formattedData.length, data: formattedData });
  } catch (error) {
    console.error('Error fetching PM POP data:', error);
    res.status(500).json({ error: 'Gagal mengambil data PM POP dari database.' });
  }
});

app.put('/api/pm-pop/:popId', requireAuth, async (req, res) => {
  const { popId } = req.params;
  const data = req.body;

  try {
    const [rows] = await db.query("SELECT kategori FROM pm_pop WHERE pop_id = ?", [popId]);
    const kategori = rows.length > 0 ? rows[0].kategori : (data.kategori || 'POP-A');

    const { persentase, status, done } = calculateProgressAndStatus(
      kategori, data.tahap1, data.tahap2, data.tahap3, data.tahap4
    );

    const updateQuery = `
      UPDATE pm_pop 
      SET 
        tahap_1 = ?, tahap_2 = ?, tahap_3 = ?, tahap_4 = ?, persentase = ?, status = ?, done = ?,
        pt_servo = ?, mitra = ?, wo = ?, catatan_hasil_pm = ?, link_ba_tahap_1 = ?, link_ba_tahap_2 = ?,
        link_ba_tahap_3 = ?, link_ba_tahap_4 = ?
      WHERE pop_id = ?
    `;

    const values = [
      data.tahap1 || null, data.tahap2 || null, data.tahap3 || null, data.tahap4 || null,
      persentase, status, done, data.mitra || '-', data.mitra || '-', data.wo || '-',
      data.catatanHasilPm || '-', data.linkBaTahap1 || '-', data.linkBaTahap2 || '-',
      data.linkBaTahap3 || '-', data.linkBaTahap4 || '-', popId
    ];

    const [result] = await db.query(updateQuery, values);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'POP ID tidak ditemukan.' });

    res.json({ message: 'Data PM POP berhasil diperbarui!', persentase, status, done });
  } catch (error) {
    console.error('Error updating PM POP:', error);
    res.status(500).json({ error: 'Gagal memperbarui data PM POP.' });
  }
});

app.post('/api/pm-pop/reset', requireAuth, async (req, res) => {
  try {
    await db.query(`UPDATE pm_pop SET tahap_1 = NULL, tahap_2 = NULL, tahap_3 = NULL, tahap_4 = NULL, persentase = 0, status = 'BELUM', done = 0`);
    res.json({ message: 'Jadwal & Realisasi Pelaksanaan PM berhasil di-reset!' });
  } catch (error) {
    console.error('Error resetting PM POP schedule:', error);
    res.status(500).json({ error: 'Gagal melakukan reset jadwal PM POP.' });
  }
});

app.get('/api/export/pm-pop', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM pm_pop WHERE pop_id IS NOT NULL AND pop_id != '' AND pop_id != '-'");
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('PM POP RJBT');

    const headers = [
      'NO', 'KATEGORI', 'POP NAME', 'POP ID', 'WILAYAH', 'KP', 'TIKOR', 'SERVO', 'PT.SERVO',
      'Tahap 1', 'Tahap 2', 'Tahap 3', 'Tahap 4', 'Persentase', 'STATUS',
      'HEALTH INDEX', 'Catatan Hasil PM', 'DONE', 'MITRA', 'PIC PM SERVO', 'WO', 'LAPORAN',
      'LINK BA TAHAP 1', 'TAHAP 2', 'TAHAP 3', 'TAHAP 4'
    ];

    worksheet.columns = headers.map(header => ({ header, key: header, width: Math.max(header.length + 5, 12) }));

    rows.forEach((row, index) => {
      worksheet.addRow({
        'NO': row.no || (index + 1),
        'KATEGORI': row.kategori || '-',
        'POP NAME': row.pop_name || '-',
        'POP ID': row.pop_id || '-',
        'WILAYAH': row.wilayah || '-',
        'KP': row.kp || row.wilayah || '-',
        'TIKOR': row.tikor || '-',
        'SERVO': row.servo || '-',
        'PT.SERVO': row.pt_servo || row.mitra || '-',
        'Tahap 1': formatDate(row.tahap_1) || '-',
        'Tahap 2': formatDate(row.tahap_2) || '-',
        'Tahap 3': formatDate(row.tahap_3) || '-',
        'Tahap 4': formatDate(row.tahap_4) || '-',
        'Persentase': (row.persentase !== null && row.persentase !== undefined) ? `${(Number(row.persentase) * 100).toFixed(0)}%` : '0%',
        'STATUS': row.status || 'BELUM',
        'HEALTH INDEX': row.health_index ?? '-',
        'Catatan Hasil PM': row.catatan_hasil_pm || '-',
        'DONE': row.done ? 'TRUE' : 'FALSE',
        'MITRA': row.mitra || row.pt_servo || '-',
        'PIC PM SERVO': row.pic_pm_servo || '-',
        'WO': row.wo || '-',
        'LAPORAN': row.laporan || '-',
        'LINK BA TAHAP 1': row.link_ba_tahap_1 || '-',
        'TAHAP 2': row.link_ba_tahap_2 || '-',
        'TAHAP 3': row.link_ba_tahap_3 || '-',
        'TAHAP 4': row.link_ba_tahap_4 || '-'
      });
    });

    const headerRow = worksheet.getRow(1);
    headerRow.height = 26;
    headerRow.eachCell((cell) => {
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '005B94' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="PM_POP_RJBT.xlsx"');

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error exporting PM POP:', error);
    res.status(500).json({ error: 'Gagal mengeksport data PM POP.' });
  }
});

// ==========================================================
// 6. ENDPOINT READ, EDIT, RESET & EXPORT: PM AC (ac_projek)
// ==========================================================

app.get('/api/ac', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM ac_projek');
    
    const formattedData = rows.map((row, idx) => ({
      no: idx + 1,
      id_row: row.id_row || idx + 1,
      id_pop: row.id_pop || '',
      lokasi: row.lokasi || '',
      kategori: row.kategori || '',
      model: row.model || '',
      pemilik: row.pemilik || 'ICON+',
      note: row.note || '',
      suhu_ruangan: row.suhu_ruangan || 'NORMAL',
      kondisi_ac: row.kondisi_ac || 'NORMAL',
      preventive_maintenance: row.preventive_maintenance || 'NORMAL',
      health_index_ac: row.health_index_ac !== null && row.health_index_ac !== undefined ? row.health_index_ac : 100,
      last_pm: formatDate(row.last_pm),
      tgl_pm_no1: formatDate(row.tgl_pm_no1),
      tgl_pm_no2: formatDate(row.tgl_pm_no2),
      tgl_pm_no3: formatDate(row.tgl_pm_no3),
      tgl_pm_no4: formatDate(row.tgl_pm_no4),
      temuan: row.temuan || '',
      status_temuan: row.status_temuan || '',
      area_servpo: row.area_servpo || '',
      jadwal_next_pm: formatDate(row.jadwal_next_pm),
      selisih: row.selisih || '',
      alarm: row.alarm || '',
      need_new_ac: row.need_new_ac || '',
      ada_prgkt_besar: row.ada_prgkt_besar || '',
      thn_install: row.thn_install || '',
      jml_ac: row.jml_ac || '',
      biaya_service_ac: row.biaya_service_ac || ''
    }));

    res.json({ success: true, total: formattedData.length, data: formattedData });
  } catch (err) {
    console.error('Error fetching AC:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/ac/:id', requireAuth, async (req, res) => {
  try {
    const idParam = req.params.id;
    const data = req.body;

    const query = `
      UPDATE ac_projek SET 
        id_pop = ?, lokasi = ?, kategori = ?, model = ?, pemilik = ?, 
        note = ?, suhu_ruangan = ?, kondisi_ac = ?, preventive_maintenance = ?, 
        health_index_ac = ?, last_pm = ?, tgl_pm_no1 = ?, tgl_pm_no2 = ?, 
        tgl_pm_no3 = ?, tgl_pm_no4 = ?, temuan = ?, status_temuan = ?, 
        area_servpo = ?, jadwal_next_pm = ?, selisih = ?, alarm = ?, 
        need_new_ac = ?, ada_prgkt_besar = ?, thn_install = ?, jml_ac = ?, 
        biaya_service_ac = ?
      WHERE id_row = ? OR id_pop = ?
    `;

    const values = [
      data.id_pop || data.idPop, data.lokasi, data.kategori, data.model, data.pemilik || 'ICON+',
      data.note || data.catatan_ac, data.suhu_ruangan || data.suhuRuangan, data.kondisi_ac || data.kondisiAc, data.preventive_maintenance || data.preventiveMaintenance,
      data.health_index_ac ?? data.healthIndexAc ?? 100, data.last_pm || null, data.tgl_pm_no1 || null, data.tgl_pm_no2 || null,
      data.tgl_pm_no3 || null, data.tgl_pm_no4 || null, data.temuan, data.status_temuan,
      data.area_servpo || data.areaServpo, data.jadwal_next_pm || null, data.selisih, data.alarm,
      data.need_new_ac, data.ada_prgkt_besar, data.thn_install, data.jml_ac,
      data.biaya_service_ac, idParam, idParam
    ];

    const [result] = await db.query(query, values);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, error: 'Data AC tidak ditemukan.' });
    }
    res.json({ success: true, message: 'Semua data AC berhasil diperbarui!' });
  } catch (err) {
    console.error('Error updating AC:', err);
    res.status(500).json({ success: false, error: `Gagal memperbarui data AC: ${err.message}` });
  }
});

// Endpoint Reset Tahunan Tanggal PM AC
app.post('/api/ac/reset', requireAuth, async (req, res) => {
  try {
    const query = `
      UPDATE ac_projek SET 
        last_pm = NULL, 
        jadwal_next_pm = NULL, 
        tgl_pm_no1 = NULL, 
        tgl_pm_no2 = NULL, 
        tgl_pm_no3 = NULL, 
        tgl_pm_no4 = NULL
    `;

    await db.query(query);
    res.json({ success: true, message: 'Jadwal & Realisasi PM AC berhasil di-reset!' });
  } catch (err) {
    console.error('Error Reset Tahunan AC:', err);
    res.status(500).json({ success: false, error: 'Gagal melakukan reset jadwal PM AC.' });
  }
});

app.get('/api/export/ac', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM ac_projek');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('PM AC RJBT');

    const headers = [
      'NO', 'ID POP', 'LOKASI', 'KATEGORI', 'MODEL', 'PEMILIK',
      'SUHU RUANGAN', 'KONDISI AC', 'PREVENTIVE MAINTENANCE', 'HEALTH INDEX AC',
      'LAST PM', 'NEXT PM', 'TGL PM 1', 'TGL PM 2', 'TGL PM 3', 'TGL PM 4',
      'TEMUAN', 'STATUS TEMUAN', 'AREA SERVPO', 'SELISIH', 'ALARM',
      'NEED NEW AC', 'ADA PRGKT BESAR', 'THN INSTALL', 'JML AC', 'BIAYA SERVICE AC', 'NOTE'
    ];

    worksheet.columns = headers.map(header => ({ header, key: header, width: Math.max(header.length + 5, 12) }));

    rows.forEach((row, index) => {
      worksheet.addRow({
        'NO': row.id_row || (index + 1),
        'ID POP': row.id_pop || '-',
        'LOKASI': row.lokasi || '-',
        'KATEGORI': row.kategori || '-',
        'MODEL': row.model || '-',
        'PEMILIK': row.pemilik || 'ICON+',
        'SUHU RUANGAN': row.suhu_ruangan || '-',
        'KONDISI AC': row.kondisi_ac || '-',
        'PREVENTIVE MAINTENANCE': row.preventive_maintenance || '-',
        'HEALTH INDEX AC': (row.health_index_ac !== null && row.health_index_ac !== undefined) ? `${row.health_index_ac}%` : '100%',
        'LAST PM': formatDate(row.last_pm) || '-',
        'NEXT PM': formatDate(row.jadwal_next_pm) || '-',
        'TGL PM 1': formatDate(row.tgl_pm_no1) || '-',
        'TGL PM 2': formatDate(row.tgl_pm_no2) || '-',
        'TGL PM 3': formatDate(row.tgl_pm_no3) || '-',
        'TGL PM 4': formatDate(row.tgl_pm_no4) || '-',
        'TEMUAN': row.temuan || '-',
        'STATUS TEMUAN': row.status_temuan || '-',
        'AREA SERVPO': row.area_servpo || '-',
        'SELISIH': row.selisih || '-',
        'ALARM': row.alarm || '-',
        'NEED NEW AC': row.need_new_ac || '-',
        'ADA PRGKT BESAR': row.ada_prgkt_besar || '-',
        'THN INSTALL': row.thn_install || '-',
        'JML AC': row.jml_ac || '-',
        'BIAYA SERVICE AC': row.biaya_service_ac || '-',
        'NOTE': row.note || '-'
      });
    });

    const headerRow = worksheet.getRow(1);
    headerRow.height = 26;
    headerRow.eachCell((cell) => {
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '005B94' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="PM_AC_RJBT.xlsx"');

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error exporting AC:', error);
    res.status(500).json({ error: 'Gagal mengeksport data AC.' });
  }
});

// ==========================================================
// 7. ENDPOINT READ, EDIT & EXPORT: PM GENSET (genset_projek)
// ==========================================================

app.get('/api/genset', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM genset_projek');
    res.json({ success: true, total: rows.length, data: rows });
  } catch (err) {
    console.error('Error fetching Genset:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/genset/:popId', requireAuth, async (req, res) => {
  try {
    const { popId } = req.params;
    const data = req.body;

    const query = `
      UPDATE genset_projek SET 
        lokasi = ?, kategori = ?, kota_kab = ?, kp = ?, tgl_instalasi = ?,
        merk_genset = ?, tipe_genset = ?, sn_genset = ?, kapasitas_genset = ?, 
        jenis_bbm = ?, kapasitas_bbm = ?, jumlah_oli = ?, jenis_aki = ?, spesifikasi_aki = ?, 
        auto_start = ?, running_test = ?, bahan_bakar = ?, health_index_genset = ?, 
        temuan = ?, status_temuan = ?, \`real\` = ?, filter_bbm = ?, filter_udara = ?, 
        filter_oli = ?, tanggal_ganti_aki = ?, voltase_aki_v = ?, hertz = ?, bbm_l = ?, 
        ats = ?, krangkeng = ?, tanda_tanda_hewan_pengerat = ?, semester_1 = ?, semester_2 = ?
      WHERE pop_id = ?
    `;

    const values = [
      data.lokasi || null, data.kategori || null, data.kota_kab || null, data.kp || null, data.tgl_instalasi || null,
      data.merk_genset || null, data.tipe_genset || null, data.sn_genset || null, data.kapasitas_genset || null,
      data.jenis_bbm || null, data.kapasitas_bbm || null, data.jumlah_oli || null, data.jenis_aki || null, data.spesifikasi_aki || null,
      data.auto_start || null, data.running_test || null, data.bahan_bakar || null, data.health_index_genset || 100,
      data.temuan || null, data.status_temuan || null, data.real || null, data.filter_bbm || null, data.filter_udara || null,
      data.filter_oli || null, data.tanggal_ganti_aki || null, data.voltase_aki_v || null, data.hertz || null, data.bbm_l || null,
      data.ats || null, data.krangkeng || null, data.tanda_tanda_hewan_pengerat || null, data.semester_1 || null, data.semester_2 || null,
      popId
    ];

    const [result] = await db.query(query, values);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, error: 'ID POP Genset tidak ditemukan di database.' });
    }

    return res.json({ success: true, message: 'Data Genset berhasil diperbarui!' });
  } catch (err) {
    console.error('Error updating Genset:', err);
    return res.status(500).json({ success: false, error: `Gagal memperbarui data: ${err.message}` });
  }
});

app.get('/api/export/genset', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM genset_projek');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('PM GENSET RJBT');

    const headers = [
      'NO', 'POP ID', 'LOKASI', 'KATEGORI', 'KOTA/KAB', 'KP', 'TGL INSTALASI',
      'MERK GENSET', 'TIPE GENSET', 'SN GENSET', 'KAPASITAS GENSET', 'JENIS BBM',
      'KAPASITAS BBM', 'JUMLAH OLI', 'JENIS AKI', 'SPESIFIKASI AKI', 'AUTO START',
      'RUNNING TEST', 'BAHAN BAKAR', 'HEALTH INDEX GENSET', 'TEMUAN', 'STATUS TEMUAN',
      'REAL', 'FILTER BBM', 'FILTER UDARA', 'FILTER OLI', 'TANGGAL GANTI AKI',
      'VOLTASE AKI (V)', 'HERTZ', 'BBM (L)', 'ATS', 'KRANGKENG', 'HEWAN PENGERAT',
      'SEMESTER 1', 'SEMESTER 2'
    ];

    worksheet.columns = headers.map(header => ({ header, key: header, width: Math.max(header.length + 5, 12) }));

    rows.forEach((row, index) => {
      worksheet.addRow({
        'NO': index + 1,
        'POP ID': row.pop_id || '-',
        'LOKASI': row.lokasi || '-',
        'KATEGORI': row.kategori || '-',
        'KOTA/KAB': row.kota_kab || '-',
        'KP': row.kp || '-',
        'TGL INSTALASI': formatDate(row.tgl_instalasi) || '-',
        'MERK GENSET': row.merk_genset || '-',
        'TIPE GENSET': row.tipe_genset || '-',
        'SN GENSET': row.sn_genset || '-',
        'KAPASITAS GENSET': row.kapasitas_genset || '-',
        'JENIS BBM': row.jenis_bbm || '-',
        'KAPASITAS BBM': row.kapasitas_bbm || '-',
        'JUMLAH OLI': row.jumlah_oli || '-',
        'JENIS AKI': row.jenis_aki || '-',
        'SPESIFIKASI AKI': row.spesifikasi_aki || '-',
        'AUTO START': row.auto_start || '-',
        'RUNNING TEST': row.running_test || '-',
        'BAHAN BAKAR': row.bahan_bakar || '-',
        'HEALTH INDEX GENSET': (row.health_index_genset !== null && row.health_index_genset !== undefined) ? `${row.health_index_genset}%` : '100%',
        'TEMUAN': row.temuan || '-',
        'STATUS TEMUAN': row.status_temuan || '-',
        'REAL': formatDate(row.real) || '-',
        'FILTER BBM': formatDate(row.filter_bbm) || '-',
        'FILTER UDARA': formatDate(row.filter_udara) || '-',
        'FILTER OLI': formatDate(row.filter_oli) || '-',
        'TANGGAL GANTI AKI': formatDate(row.tanggal_ganti_aki) || '-',
        'VOLTASE AKI (V)': row.voltase_aki_v || '-',
        'HERTZ': row.hertz || '-',
        'BBM (L)': row.bbm_l ?? '-',
        'ATS': row.ats || '-',
        'KRANGKENG': row.krangkeng || '-',
        'HEWAN PENGERAT': row.tanda_tanda_hewan_pengerat || '-',
        'SEMESTER 1': formatDate(row.semester_1) || '-',
        'SEMESTER 2': formatDate(row.semester_2) || '-'
      });
    });

    const headerRow = worksheet.getRow(1);
    headerRow.height = 26;
    headerRow.eachCell((cell) => {
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '005B94' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="PM_Genset_RJBT.xlsx"');

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error exporting Genset:', error);
    res.status(500).json({ error: 'Gagal mengeksport data Genset.' });
  }
});

// ==========================================================
// 8. ENDPOINT READ, UPDATE & EXPORT: EXECUTIVE DASHBOARD
// ==========================================================

// Helper Formatter Row Dashboard
function calculateDashboardRow(row, index) {
  // 1. Power Supply (30%)
  let psValStr = 'BELUM TERDATA';
  let psNum = 0;
  if (row.ps_hi !== null && row.ps_hi !== undefined && row.ps_hi !== '') {
    psNum = Number(row.ps_hi);
    psValStr = `${psNum}`;
  }

  // 2. AC (15%)
  let acValStr = 'TIDAK ADA AC';
  let acNum = 100;
  if (row.ac_kondisi && String(row.ac_kondisi).toUpperCase().includes('NON-AC')) {
    acValStr = 'NON-AC ICON';
    acNum = 100;
  } else if (row.ac_hi !== null && row.ac_hi !== undefined && row.ac_hi !== '') {
    acNum = Math.round(Number(row.ac_hi));
    acValStr = `${acNum}`;
  }

  // 3. Genset (15%)
  let gensetValStr = 'TIDAK ADA GENSET';
  let gensetNum = 100;
  if (row.genset_hi !== null && row.genset_hi !== undefined && row.genset_hi !== '') {
    gensetNum = Number(row.genset_hi);
    gensetValStr = `${gensetNum}`;
  }

  // 4. PM POP (40%)
  const pmPopNum = Math.round(Number(row.pm_pop_progress || 0) * 100);

  // 5. Rumus Health Index
  const healthIndex = Math.round(
    ((psNum * 30) + (acNum * 15) + (gensetNum * 15) + (pmPopNum * 40)) / 100
  );

  // 6. Penentuan Status Resume Index (0-59% digabung ke NEED CHECK)
  let resumeIndex = 'GOOD CONDITION';
  if (healthIndex >= 80) resumeIndex = 'GOOD CONDITION';
  else if (healthIndex >= 60) resumeIndex = 'WARNING';
  else resumeIndex = 'NEED CHECK';

  return {
    no: index + 1,
    regionalKp: row.regional_kp || 'SURABAYA',
    kategori: row.kategori || '-',
    idPop: row.id_pop || '-',
    namaPop: row.nama_pop || '-',
    hostnameOlt: row.hostname_olt || 'NON - OLT',
    powerSupply: psValStr,
    ac: acValStr,
    genset: gensetValStr,
    pmPop: pmPopNum,
    healthIndex: healthIndex,
    resumeIndex: resumeIndex,
    // 4 Kolom Baru Catatan & Action
    catatanPm: row.catatan_pm || '',
    gamasTerakhir: row.gamas_terakhir || '',
    rootCause: row.root_cause || '',
    action: row.action || ''
  };
}

// Kueri SQL Master Dashboard (Fix Column health_index_power_supply)
const MASTER_DASHBOARD_QUERY = `
  SELECT 
    p.pop_id AS id_pop,
    p.pop_name AS nama_pop,
    p.kategori AS kategori,
    COALESCE(p.kp, p.wilayah, 'SURABAYA') AS regional_kp,
    COALESCE(p.servo, 'NON - OLT') AS hostname_olt,
    p.persentase AS pm_pop_progress,
    p.catatan_pm,
    p.gamas_terakhir,
    p.root_cause,
    p.action,
    ps.ps_hi,
    ac.ac_hi,
    ac.ac_kondisi,
    g.genset_hi
  FROM pm_pop p
  LEFT JOIN (
    SELECT TRIM(UPPER(id_pop)) AS id_pop_clean, AVG(COALESCE(health_index_power_supply, 100)) AS ps_hi 
    FROM pm_powersupply WHERE id_pop IS NOT NULL AND id_pop != '' GROUP BY TRIM(UPPER(id_pop))
  ) ps ON TRIM(UPPER(p.pop_id)) = ps.id_pop_clean
  LEFT JOIN (
    SELECT TRIM(UPPER(id_pop)) AS id_pop_clean, AVG(COALESCE(health_index_ac, 100)) AS ac_hi, MAX(kondisi_ac) AS ac_kondisi 
    FROM ac_projek WHERE id_pop IS NOT NULL AND id_pop != '' GROUP BY TRIM(UPPER(id_pop))
  ) ac ON TRIM(UPPER(p.pop_id)) = ac.id_pop_clean
  LEFT JOIN (
    SELECT TRIM(UPPER(pop_id)) AS pop_id_clean, AVG(COALESCE(health_index_genset, 100)) AS genset_hi 
    FROM genset_projek WHERE pop_id IS NOT NULL AND pop_id != '' GROUP BY TRIM(UPPER(pop_id))
  ) g ON TRIM(UPPER(p.pop_id)) = g.pop_id_clean
  WHERE p.pop_id IS NOT NULL AND p.pop_id != '' AND p.pop_id != '-'
  GROUP BY p.pop_id
  ORDER BY p.id ASC
`;

// A. API Read Dashboard Data Master
app.get('/api/dashboard/master', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query(MASTER_DASHBOARD_QUERY);
    const formattedData = rows.map((row, index) => calculateDashboardRow(row, index));
    res.json({ success: true, total: formattedData.length, data: formattedData });
  } catch (error) {
    console.error('Error fetching Dashboard Master Data:', error);
    res.status(500).json({ success: false, error: 'Gagal merangkum data monitoring RJBT.' });
  }
});

// B. API Update Catatan & Action POP
app.put('/api/dashboard/master/:idPop', requireAuth, async (req, res) => {
  try {
    const { idPop } = req.params;
    const { catatanPm, gamasTerakhir, rootCause, action } = req.body;

    await db.query(
      `UPDATE pm_pop 
       SET catatan_pm = ?, gamas_terakhir = ?, root_cause = ?, action = ? 
       WHERE pop_id = ?`,
      [catatanPm || null, gamasTerakhir || null, rootCause || null, action || null, idPop]
    );

    res.json({ success: true, message: 'Catatan POP berhasil diperbarui.' });
  } catch (error) {
    console.error('Error updating POP Notes:', error);
    res.status(500).json({ success: false, error: 'Gagal memperbarui catatan POP.' });
  }
});

// C. API Export Excel Data Master POP (Format Identik Sheet DATA MASTER)
app.get('/api/export/master', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query(MASTER_DASHBOARD_QUERY);
    const formattedData = rows.map((row, index) => calculateDashboardRow(row, index));

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'RJBT ICON Plus Monitoring System';
    workbook.created = new Date();

    const ws = workbook.addWorksheet('DATA MASTER', {
      views: [{ state: 'frozen', ySplit: 1 }]
    });

    const parseMetricValue = (val, fallback) => {
      if (val === null || val === undefined || String(val).trim() === '') return fallback;
      const str = String(val).trim();
      if (!isNaN(str)) return Number(str);
      return str.toUpperCase();
    };

    const thinBorder = {
      top: { style: 'thin', color: { argb: 'FFD9D9D9' } },
      left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
      bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } },
      right: { style: 'thin', color: { argb: 'FFD9D9D9' } }
    };

    const summaryBorder = {
      top: { style: 'thin', color: { argb: 'FF8EA9DB' } },
      left: { style: 'thin', color: { argb: 'FF8EA9DB' } },
      bottom: { style: 'thin', color: { argb: 'FF8EA9DB' } },
      right: { style: 'thin', color: { argb: 'FF8EA9DB' } }
    };

    // Header Utama Tabel (Kolom A - P) sesuai sheet DATA MASTER
    const headers = [
      'REGIONAL KP',
      'KATEGORI',
      'NAMA POP',
      'HOSTNAME OLT',
      'ID POP',
      'TIPE POP',
      'POWER SUPPLY',
      'AC',
      'GENSET',
      'PM POP',
      'HEALTH INDEX (%)',
      'RESUME INDEX',
      'CATATAN PM',
      'GAMAS TERAKHIR',
      'ROOT CAUSE',
      'ACTION'
    ];

    const headerRow = ws.getRow(1);
    headerRow.height = 26;
    headers.forEach((title, idx) => {
      const cell = headerRow.getCell(idx + 1);
      cell.value = title;
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF1E293B' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE599' } };
      cell.alignment = {
        vertical: 'middle',
        horizontal: idx >= 6 && idx <= 11 ? 'center' : 'left',
        wrapText: true
      };
      cell.border = thinBorder;
    });

    ws.autoFilter = 'A1:P1';

    // Isi Data POP (Mulai Baris 2)
    formattedData.forEach((item, index) => {
      const r = index + 2;
      const row = ws.getRow(r);
      row.height = 20;

      const cleanKp = String(item.regionalKp || 'SURABAYA')
        .toUpperCase()
        .replace(/^KP\s+/, '')
        .trim();

      const hiNum = Number(item.healthIndex ?? 0);
      const statusText = getResumeIndex(hiNum);

      row.getCell(1).value = cleanKp;
      row.getCell(2).value = item.kategori || '-';
      row.getCell(3).value = item.namaPop || '-';
      row.getCell(4).value = item.hostnameOlt || 'NON - OLT';
      row.getCell(5).value = item.idPop || '-';
      row.getCell(6).value = rows[index].tipe_pop || '-';
      row.getCell(7).value = parseMetricValue(item.powerSupply, 'BELUM TERDATA');
      row.getCell(8).value = parseMetricValue(item.ac, 'NON-AC ICON');
      row.getCell(9).value = parseMetricValue(item.genset, 'TIDAK ADA GENSET');
      row.getCell(10).value = parseMetricValue(item.pmPop, 0);

      // Kolom K: Rumus Health Index (%)
      row.getCell(11).value = {
        formula: `ROUND(((IF(ISNUMBER(G${r}),G${r},0)*30)+(IF(H${r}="NON-AC ICON",100,IF(ISNUMBER(H${r}),H${r},0))*15)+(IF(I${r}="TIDAK ADA GENSET",100,IF(ISNUMBER(I${r}),I${r},0))*15)+(IF(J${r}="",100,IF(ISNUMBER(J${r}),J${r},0))*40))/100,0)`,
        result: hiNum
      };

      // Kolom L: Rumus Resume Index (80-100 GOOD, 60-79 WARNING, 0-59 NEED CHECK)
      row.getCell(12).value = {
        formula: `IF(K${r}>=80,"GOOD CONDITION",IF(K${r}>=60,"WARNING","NEED CHECK"))`,
        result: statusText
      };

      row.getCell(13).value = item.catatanPm || '';
      row.getCell(14).value = item.gamasTerakhir || '';
      row.getCell(15).value = item.rootCause || '';
      row.getCell(16).value = item.action || '';

      const rowBg = index % 2 === 1 ? 'FFF6F8F9' : 'FFFFFFFF';
      for (let c = 1; c <= 16; c++) {
        const cell = row.getCell(c);
        cell.font = {
          name: 'Calibri',
          size: 10,
          bold: c === 11 || c === 12,
          color: { argb: 'FF334155' }
        };
        cell.border = thinBorder;
        cell.alignment = {
          vertical: 'middle',
          horizontal: c >= 7 && c <= 12 ? 'center' : 'left'
        };

        if (c === 12) {
          let badgeBg = 'FF00FF00'; // GOOD CONDITION
          if (statusText === 'WARNING') badgeBg = 'FFFFFF00';
          else if (statusText === 'NEED CHECK') badgeBg = 'FFFF9900';

          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: badgeBg } };
          cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } };
        } else {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
        }
      }
    });

    const lastDataRow = Math.max(formattedData.length + 1, 2);

    // ==========================================================
    // TABEL REKAP SAMPING KANAN (KOLOM R-S & KOLOM U-V)
    // ==========================================================

    // 1. DESCRIPTION INDEX (R3:S6)
    ws.mergeCells('R3:S3');
    ws.getCell('R3').value = 'DESCRIPTION INDEX';
    ws.getCell('R3').font = { name: 'Calibri', size: 10, bold: true };
    ws.getCell('R3').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF9FC5E8' } };
    ws.getCell('R3').alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getCell('R3').border = summaryBorder;
    ws.getCell('S3').border = summaryBorder;

    const descRows = [
      { range: '80% - 100%', label: 'GOOD CONDITION', color: 'FF00FF00' },
      { range: '60% - 79%', label: 'WARNING', color: 'FFFFFF00' },
      { range: '0% - 59%', label: 'NEED CHECK', color: 'FFFF9900' }
    ];

    descRows.forEach((d, idx) => {
      const rNum = 4 + idx;
      const cRange = ws.getCell(`R${rNum}`);
      const cLabel = ws.getCell(`S${rNum}`);

      cRange.value = d.range;
      cRange.font = { name: 'Calibri', size: 10, bold: true };
      cRange.alignment = { horizontal: 'center', vertical: 'middle' };
      cRange.border = summaryBorder;

      cLabel.value = d.label;
      cLabel.font = { name: 'Calibri', size: 10, bold: true };
      cLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: d.color } };
      cLabel.alignment = { horizontal: 'center', vertical: 'middle' };
      cLabel.border = summaryBorder;
    });

    // 2. RESUME INDEX COUNT (R8:S12)
    ws.mergeCells('R8:S8');
    ws.getCell('R8').value = 'RESUME INDEX';
    ws.getCell('R8').font = { name: 'Calibri', size: 10, bold: true };
    ws.getCell('R8').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF9FC5E8' } };
    ws.getCell('R8').alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getCell('R8').border = summaryBorder;
    ws.getCell('S8').border = summaryBorder;

    const goodCount = formattedData.filter(x => x.healthIndex >= 80).length;
    const warnCount = formattedData.filter(x => x.healthIndex >= 60 && x.healthIndex < 80).length;
    const checkCount = formattedData.filter(x => x.healthIndex < 60).length;

    const resumeSummary = [
      { label: 'GOOD CONDITION', color: 'FF00FF00', count: goodCount },
      { label: 'WARNING', color: 'FFFFFF00', count: warnCount },
      { label: 'NEED CHECK', color: 'FFFF9900', count: checkCount }
    ];

    resumeSummary.forEach((item, idx) => {
      const rNum = 9 + idx;
      const cCount = ws.getCell(`R${rNum}`);
      const cStatus = ws.getCell(`S${rNum}`);

      cCount.value = {
        formula: `COUNTIF(L2:L${lastDataRow},"${item.label}")`,
        result: item.count
      };
      cCount.font = { name: 'Calibri', size: 10, bold: true };
      cCount.alignment = { horizontal: 'center', vertical: 'middle' };
      cCount.border = summaryBorder;

      cStatus.value = item.label;
      cStatus.font = { name: 'Calibri', size: 10, bold: true };
      cStatus.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: item.color } };
      cStatus.alignment = { horizontal: 'center', vertical: 'middle' };
      cStatus.border = summaryBorder;
    });

    ws.getCell('R12').value = { formula: 'SUM(R9:R11)', result: formattedData.length };
    ws.getCell('R12').font = { name: 'Calibri', size: 10, bold: true };
    ws.getCell('R12').alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getCell('R12').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    ws.getCell('R12').border = summaryBorder;

    ws.getCell('S12').value = 'TOTAL POP';
    ws.getCell('S12').font = { name: 'Calibri', size: 10, bold: true };
    ws.getCell('S12').alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getCell('S12').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    ws.getCell('S12').border = summaryBorder;

    // 3. AVERAGE INDEX HEALTH PER KP (U3:V8)
    ws.mergeCells('U3:V3');
    ws.getCell('U3').value = 'AVERAGE INDEX HEALTH PER KP';
    ws.getCell('U3').font = { name: 'Calibri', size: 10, bold: true };
    ws.getCell('U3').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFA4C2F4' } };
    ws.getCell('U3').alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getCell('U3').border = summaryBorder;
    ws.getCell('V3').border = summaryBorder;

    const avgHiByKp = (kpName) => {
      const subset = kpName === 'SBU'
        ? formattedData
        : formattedData.filter(r => String(r.regionalKp || '').toUpperCase().includes(kpName));
      if (subset.length === 0) return 0;
      const sum = subset.reduce((acc, cur) => acc + Number(cur.healthIndex ?? 0), 0);
      return Number(((sum / subset.length) / 100).toFixed(4));
    };

    const kpAvgRows = [
      { label: 'SBU', formula: `AVERAGE(K2:K${lastDataRow})/100`, val: avgHiByKp('SBU') },
      { label: 'KP MALANG', formula: `AVERAGEIF(A2:A${lastDataRow},"*MALANG*",K2:K${lastDataRow})/100`, val: avgHiByKp('MALANG') },
      { label: 'KP SURABAYA', formula: `AVERAGEIF(A2:A${lastDataRow},"*SURABAYA*",K2:K${lastDataRow})/100`, val: avgHiByKp('SURABAYA') },
      { label: 'KP MADIUN', formula: `AVERAGEIF(A2:A${lastDataRow},"*MADIUN*",K2:K${lastDataRow})/100`, val: avgHiByKp('MADIUN') },
      { label: 'KP JEMBER', formula: `AVERAGEIF(A2:A${lastDataRow},"*JEMBER*",K2:K${lastDataRow})/100`, val: avgHiByKp('JEMBER') }
    ];

    kpAvgRows.forEach((kpItem, idx) => {
      const rNum = 4 + idx;
      const cKp = ws.getCell(`U${rNum}`);
      const cAvg = ws.getCell(`V${rNum}`);

      cKp.value = kpItem.label;
      cKp.font = { name: 'Calibri', size: 10, bold: true };
      cKp.alignment = { horizontal: 'left', vertical: 'middle' };
      cKp.border = summaryBorder;
      if (idx === 0) {
        cKp.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F0FE' } };
      }

      cAvg.value = { formula: kpItem.formula, result: kpItem.val };
      cAvg.numFmt = '0.00%';
      cAvg.font = { name: 'Calibri', size: 10, bold: true };
      cAvg.alignment = { horizontal: 'center', vertical: 'middle' };
      cAvg.border = summaryBorder;
      if (idx === 0) {
        cAvg.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F0FE' } };
      }
    });

    // Atur Lebar Kolom
    const colWidths = {
      1: 15,  // A: REGIONAL KP
      2: 12,  // B: KATEGORI
      3: 44,  // C: NAMA POP
      4: 32,  // D: HOSTNAME OLT
      5: 18,  // E: ID POP
      6: 14,  // F: TIPE POP
      7: 16,  // G: POWER SUPPLY
      8: 15,  // H: AC
      9: 18,  // I: GENSET
      10: 12, // J: PM POP
      11: 18, // K: HEALTH INDEX (%)
      12: 20, // L: RESUME INDEX
      13: 28, // M: CATATAN PM
      14: 24, // N: GAMAS TERAKHIR
      15: 32, // O: ROOT CAUSE
      16: 38, // P: ACTION
      17: 3,  // Q: Spacer
      18: 16, // R: DESCRIPTION / COUNT
      19: 20, // S: STATUS LABEL
      20: 3,  // T: Spacer
      21: 18, // U: REGIONAL KP AVG
      22: 14  // V: AVG %
    };

    Object.entries(colWidths).forEach(([colIdx, width]) => {
      ws.getColumn(Number(colIdx)).width = width;
    });

    const dateStamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="DATA_MASTER_POP_RJBT_${dateStamp}.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error exporting Data Master:', error);
    res.status(500).json({ error: 'Gagal mengeksport Data Master POP.' });
  }
});

// ==========================================================
// 9. MENJALANKAN SERVER EXPRESS
// ==========================================================
app.listen(PORT, () => {
  console.log(`🚀 Server OPA RJBT aktif di http://localhost:${PORT}`);
});