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

// Matikan fitur otomatis menyajikan index.html saat membuka URL root /
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

// ==========================================================
// 3. ENDPOINT AUTHENTICATION (LOGIN, REGISTER, LOGOUT)
// ==========================================================

// A. Endpoint Registrasi Akun
app.post('/api/auth/register', async (req, res) => {
  const { nama, username, email, password } = req.body;

  if (!nama || !username || !email || !password) {
    return res.status(400).json({ error: 'Semua field wajib diisi!' });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'Password minimal harus 8 karakter!' });
  }

  try {
    const [existing] = await db.query(
      'SELECT id FROM users WHERE username = ? OR email = ?',
      [username, email]
    );

    if (existing.length > 0) {
      return res.status(400).json({ error: 'Username atau email sudah terdaftar!' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await db.query(
      'INSERT INTO users (nama, username, email, password) VALUES (?, ?, ?, ?)',
      [nama, username, email, hashedPassword]
    );

    res.json({ message: 'Registrasi berhasil! Silakan login.' });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Terjadi kesalahan pada server saat registrasi.' });
  }
});

// B. Endpoint Login
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username dan password wajib diisi!' });
  }

  try {
    const [users] = await db.query(
      'SELECT * FROM users WHERE BINARY username = ? OR email = ?',
      [username, username]
    );

    if (users.length === 0) {
      return res.status(400).json({ error: 'Username atau password salah!' });
    }

    const user = users[0];

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Username atau password salah!' });
    }

    const { password: _, ...userData } = user;

    // Simpan sesi user ke server
    req.session.user = userData;

    res.json({ message: 'Login berhasil!', user: userData });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Terjadi kesalahan pada server saat login.' });
  }
});

// C. Endpoint Logout
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Gagal melakukan logout.' });
    }
    res.clearCookie('connect.sid');
    res.json({ message: 'Logout berhasil.' });
  });
});

// ==========================================================
// 4. ENDPOINT READ & EXPORT: PM Power Supply (DIPROTEKSI requireAuth)
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

    worksheet.columns = headers.map(header => ({
      header: header,
      key: header,
      width: Math.max(header.length + 5, 12)
    }));

    rows.forEach((row, index) => {
      const kemampuanJam = row.kemampuan_jam ? Number(Number(row.kemampuan_jam).toFixed(2)) : 0;

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
        'Kemampuan (jam)': kemampuanJam,
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
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '005B94' }
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = {
        top: { style: 'thin', color: { argb: '003355' } },
        bottom: { style: 'medium', color: { argb: '003355' } },
        left: { style: 'thin', color: { argb: '003355' } },
        right: { style: 'thin', color: { argb: '003355' } }
      };
    });

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        row.height = 20;
        row.eachCell((cell) => {
          cell.font = { name: 'Calibri', size: 10 };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.border = {
            top: { style: 'thin', color: { argb: 'E2E8F0' } },
            bottom: { style: 'thin', color: { argb: 'E2E8F0' } },
            left: { style: 'thin', color: { argb: 'E2E8F0' } },
            right: { style: 'thin', color: { argb: 'E2E8F0' } }
          };
        });
      }
    });

    worksheet.columns.forEach(column => {
      let maxLen = column.header ? column.header.length : 10;
      column.eachCell({ includeEmpty: true }, cell => {
        const valStr = cell.value ? String(cell.value) : '';
        if (valStr.length > maxLen) {
          maxLen = valStr.length;
        }
      });

      if (column.header === 'Lokasi' || column.header === 'Rectifier Brand 1') {
        column.width = Math.min(Math.max(maxLen + 4, 25), 65);
      } else {
        column.width = Math.min(Math.max(maxLen + 4, 12), 45);
      }
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
// 5. ENDPOINT EDIT: Update Power Supply Auto-Save (DIPROTEKSI requireAuth)
// ==========================================================
app.put('/api/power-supply/:idPop', requireAuth, async (req, res) => {
  const { idPop } = req.params;
  const data = req.body;

  try {
    const query = `
      UPDATE pm_powersupply 
      SET 
        rectifier_brand_1 = ?,
        kap_total_modul_recti_1_a = ?,
        tipe_modul_recti_1 = ?,
        status_modul_recti_1 = ?,
        modul_recti_1_unit = ?,
        beban_recti_a = ?,
        kap_tiap_modul_recti_1_a_dc = ?,
        merk_batt = ?,
        jml_batt = ?,
        tipe_batt = ?,
        kap_batt_ah = ?,
        jenis_batt = ?,
        kemampuan_jam = ?,
        status_umur_batt = ?,
        status_kemampuan = ?,
        insert_date = ?,
        prioritas_batt = ?,
        butuh_recti = ?,
        status = ?,
        butuh_batt_ah = ?,
        health_index_power_supply = ?,
        butuh_dummy_2025 = ?,
        done_dummy = ?,
        last_dummy = ?,
        jumlah_batt_bank = ?,
        tanggal_dummy_2025 = ?,
        kap_batt_after_dummy_ah = ?,
        tegangan_pln = ?,
        kondisi_fisik_battery_recti = ?,
        tegangan_battery = ?,
        external_alarm = ?
      WHERE id_pop = ?
    `;

    const values = [
      data.rectifierBrand1,
      data.kapTotalModulRecti1,
      data.tipeModulRecti1,
      data.statusModulRecti1,
      data.modulRecti1Unit,
      data.bebanRectiA,
      data.kapTiapModulRecti1,
      data.merkBatt,
      data.jmlBatt,
      data.tipeBatt,
      data.kapBattAh,
      data.jenisBatt,
      data.kemampuanJam,
      data.statusUmurBatt,
      data.statusKemampuan,
      data.insertDate || null,
      data.prioritasBatt,
      data.butuhRecti,
      data.status,
      data.butuhBattAh,
      data.healthIndexPowerSupply,
      data.butuhDummy2025,
      data.doneDummy,
      data.lastDummy,
      data.jumlahBattBank,
      data.tanggalDummy2025 || null,
      data.kapBattAfterDummyAh,
      data.teganganPln,
      data.kondisiFisikBatteryRecti,
      data.teganganBattery,
      data.externalAlarm,
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

// ==========================================================
// 6. ENDPOINT READ & EXPORT: PM POP (DIPROTEKSI requireAuth)
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
    console.error('Error fetching PM POP data from MySQL:', error);
    res.status(500).json({ error: 'Gagal mengambil data PM POP dari database.' });
  }
});

// ==========================================================
// 7. ENDPOINT EDIT & RESET: Update & Reset PM POP (DIPROTEKSI requireAuth)
// ==========================================================
app.put('/api/pm-pop/:popId', requireAuth, async (req, res) => {
  const { popId } = req.params;
  const data = req.body;

  try {
    const [rows] = await db.query("SELECT kategori FROM pm_pop WHERE pop_id = ?", [popId]);
    const kategori = rows.length > 0 ? rows[0].kategori : (data.kategori || 'POP-A');

    const { persentase, status, done } = calculateProgressAndStatus(
      kategori,
      data.tahap1,
      data.tahap2,
      data.tahap3,
      data.tahap4
    );

    const updateQuery = `
      UPDATE pm_pop 
      SET 
        tahap_1 = ?,
        tahap_2 = ?,
        tahap_3 = ?,
        tahap_4 = ?,
        persentase = ?,
        status = ?,
        done = ?,
        pt_servo = ?,
        mitra = ?,
        wo = ?,
        catatan_hasil_pm = ?,
        link_ba_tahap_1 = ?,
        link_ba_tahap_2 = ?,
        link_ba_tahap_3 = ?,
        link_ba_tahap_4 = ?
      WHERE pop_id = ?
    `;

    const values = [
      data.tahap1 || null,
      data.tahap2 || null,
      data.tahap3 || null,
      data.tahap4 || null,
      persentase,
      status,
      done,
      data.mitra || '-',
      data.mitra || '-',
      data.wo || '-',
      data.catatanHasilPm || '-',
      data.linkBaTahap1 || '-',
      data.linkBaTahap2 || '-',
      data.linkBaTahap3 || '-',
      data.linkBaTahap4 || '-',
      popId
    ];

    const [result] = await db.query(updateQuery, values);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'POP ID tidak ditemukan.' });
    }

    res.json({ message: 'Data PM POP berhasil diperbarui!', persentase, status, done });
  } catch (error) {
    console.error('Error updating PM POP:', error);
    res.status(500).json({ error: 'Gagal memperbarui data PM POP di database.' });
  }
});

// Endpoint Reset Tahunan Jadwal & Realisasi PM POP (DIPROTEKSI requireAuth)
app.post('/api/pm-pop/reset', requireAuth, async (req, res) => {
  try {
    const query = `
      UPDATE pm_pop 
      SET 
        tahap_1 = NULL,
        tahap_2 = NULL,
        tahap_3 = NULL,
        tahap_4 = NULL,
        persentase = 0,
        status = 'BELUM',
        done = 0
    `;

    await db.query(query);
    res.json({ message: 'Jadwal & Realisasi Pelaksanaan PM berhasil di-reset untuk tahun baru!' });
  } catch (error) {
    console.error('Error resetting PM POP schedule:', error);
    res.status(500).json({ error: 'Gagal melakukan reset jadwal PM POP di database.' });
  }
});

app.get('/api/export/pm-pop', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM pm_pop WHERE pop_id IS NOT NULL AND pop_id != '' AND pop_id != '-'"
    );

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('PM POP RJBT');

    const headers = [
      'NO', 'KATEGORI', 'POP NAME', 'POP ID', 'WILAYAH', 'KP', 'TIKOR', 'SERVO', 'PT.SERVO',
      'Tahap 1', 'Tahap 2', 'Tahap 3', 'Tahap 4', 'Persentase', 'STATUS',
      'HEALTH INDEX', 'Catatan Hasil PM', 'DONE', 'MITRA', 'PIC PM SERVO', 'WO', 'LAPORAN',
      'LINK BA TAHAP 1', 'TAHAP 2', 'TAHAP 3', 'TAHAP 4'
    ];

    worksheet.columns = headers.map(header => ({
      header: header,
      key: header,
      width: Math.max(header.length + 5, 12)
    }));

    rows.forEach((row, index) => {
      const persentaseVal = (row.persentase !== null && row.persentase !== undefined)
        ? `${(Number(row.persentase) * 100).toFixed(0)}%`
        : '0%';

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
        'Persentase': persentaseVal,
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
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '005B94' }
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = {
        top: { style: 'thin', color: { argb: '003355' } },
        bottom: { style: 'medium', color: { argb: '003355' } },
        left: { style: 'thin', color: { argb: '003355' } },
        right: { style: 'thin', color: { argb: '003355' } }
      };
    });

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        row.height = 20;
        row.eachCell((cell) => {
          cell.font = { name: 'Calibri', size: 10 };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.border = {
            top: { style: 'thin', color: { argb: 'E2E8F0' } },
            bottom: { style: 'thin', color: { argb: 'E2E8F0' } },
            left: { style: 'thin', color: { argb: 'E2E8F0' } },
            right: { style: 'thin', color: { argb: 'E2E8F0' } }
          };
        });
      }
    });

    worksheet.columns.forEach(column => {
      let maxLen = column.header ? column.header.length : 10;
      column.eachCell({ includeEmpty: true }, cell => {
        const valStr = cell.value ? String(cell.value) : '';
        if (valStr.length > maxLen) {
          maxLen = valStr.length;
        }
      });

      if (column.header === 'POP NAME' || column.header === 'Catatan Hasil PM' || column.header === 'LINK BA TAHAP 1' || column.header === 'TAHAP 2' || column.header === 'TAHAP 3' || column.header === 'TAHAP 4') {
        column.width = Math.min(Math.max(maxLen + 4, 25), 65);
      } else {
        column.width = Math.min(Math.max(maxLen + 4, 12), 45);
      }
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

// Jalankan Server Express
app.listen(PORT, () => {
  console.log(`🚀 Server OPA RJBT aktif di http://localhost:${PORT}`);
});