const express = require('express');
const cors = require('cors');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs'); // Dipakai untuk hashing & verifikasi password

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ==========================================================
// 1. ROUTE UTAMA & STATIC FILES CONFIGURATION
// ==========================================================

// Route Root (Mengarahkan paksa langsung ke halaman login terlebih dahulu)
app.get('/', (req, res) => {
  res.redirect('/login.html');
});

// Route alternatif ke halaman login jika diakses via /login
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// ROUTE HALAMAN DASHBOARD (TAMBAHKAN INI)
app.get('/index.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Matikan fitur otomatis menyajikan index.html dari folder public
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

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
    // POP-A, POP-D, dan kategori lainnya
    target = 1;
    filledCount = hasT1 ? 1 : 0;
  }

  const persentase = Math.min(1.0, filledCount / target);
  const status = persentase >= 1.0 ? 'SELESAI' : 'BELUM';
  const done = persentase >= 1.0 ? 1 : 0;

  return { persentase, status, done };
}

// ==========================================================
// 3. ENDPOINT AUTHENTICATION (LOGIN & REGISTER)
// ==========================================================

// A. Endpoint Registrasi Akun
app.post('/api/auth/register', async (req, res) => {
  const { nama, username, email, password } = req.body;

  if (!nama || !username || !email || !password) {
    return res.status(400).json({ error: 'Semua field wajib diisi!' });
  }

  // Validasi Minimal 8 Karakter di Backend
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password minimal harus 8 karakter!' });
  }

  try {
    // Cek apakah username atau email sudah pernah digunakan
    const [existing] = await db.query(
      'SELECT id FROM users WHERE username = ? OR email = ?',
      [username, email]
    );

    if (existing.length > 0) {
      return res.status(400).json({ error: 'Username atau email sudah terdaftar!' });
    }

    // Hash password demi keamanan
    const hashedPassword = await bcrypt.hash(password, 10);

    // Simpan data user ke database
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
    // Cari user berdasarkan username atau email
    const [users] = await db.query(
      'SELECT * FROM users WHERE username = ? OR email = ?',
      [username, username]
    );

    if (users.length === 0) {
      return res.status(400).json({ error: 'Username atau password salah!' });
    }

    const user = users[0];

    // Verifikasi enkripsi password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Username atau password salah!' });
    }

    // Hilangkan hash password sebelum mengirimkan respon sesi
    const { password: _, ...userData } = user;
    res.json({ message: 'Login berhasil!', user: userData });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Terjadi kesalahan pada server saat login.' });
  }
});

// ==========================================================
// 4. ENDPOINT READ: Ambil Semua Data PM Power Supply
// ==========================================================
app.get('/api/power-supply', async (req, res) => {
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

      // Rectifier
      rectifierBrand1: row.rectifier_brand_1 ?? row.rectifier_brand ?? '-',
      tipeModulRecti1: row.tipe_modul_recti_1 ?? row.tipe_modul_recti ?? '-',
      modulRecti1Unit: row.modul_recti_1_unit ?? row.modul_recti_unit ?? 0,
      kapTiapModulRecti1: row.kap_tiap_modul_recti_1_a_dc ?? row.kap_tiap_modul_a ?? '-',
      kapTotalModulRecti1: row.kap_total_modul_recti_1_a ?? row.kap_total_modul_a ?? '-',
      statusModulRecti1: row.status_modul_recti_1 ?? row.status_modul_recti ?? '-',
      bebanRectiA: row.beban_recti_a ?? 0,

      // Baterai
      merkBatt: row.merk_batt ?? '-',
      tipeBatt: row.tipe_batt ?? '-',
      jenisBatt: row.jenis_batt ?? '-',
      jmlBatt: row.jml_batt ?? '-',
      kapBattAh: row.kap_batt_ah ?? 0,
      kemampuanJam: row.kemampuan_jam ?? 0,
      statusKemampuan: row.status_kemampuan ?? '-',
      statusUmurBatt: row.status_umur_batt ?? '-',

      // Maintenance & Evaluation
      insertDate: formatDate(row.insert_date),
      butuhRecti: row.butuh_recti ?? '-',
      butuhBattAh: row.butuh_batt_ah ?? row.butuh_plus_batt_ah ?? '-',
      prioritasBatt: row.prioritas_batt ?? '-',
      status: row.status ?? '-',
      healthIndexPowerSupply: (row.health_index_power_supply !== null && row.health_index_power_supply !== undefined && row.health_index_power_supply !== '') 
        ? row.health_index_power_supply 
        : (row.health_index_ps ?? 100),

      // Dummy Load Status & History
      butuhDummy2025: row.butuh_dummy_2025 ?? '-',
      lastDummy: row.last_dummy ?? '-',
      tanggalDummy2025: formatDate(row.tanggal_dummy_2025),
      doneDummy: row.done_dummy ?? '-',
      jumlahBattBank: row.jumlah_batt_bank ?? '-',
      kapBattAfterDummyAh: row.kap_batt_after_dummy_ah ?? '-',

      // Dummy Load Banks
      kapBank1Ah: row.kap_bank_1_ah ?? row.kap_bank_1 ?? 0,
      hasilDummyBank1: row.hasil_dummy_bank_1 ?? 0,
      kapBank2Ah: row.kap_bank_2_ah ?? row.kap_bank_2 ?? 0,
      hasilDummyBank2: row.hasil_dummy_bank_2 ?? 0,
      kapBank3Ah: row.kap_bank_3_ah ?? row.kap_bank_3 ?? 0,
      hasilDummyBank3: row.hasil_dummy_bank_3 ?? 0,

      // Tegangan, Kondisi Fisik & Alarm
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

// ==========================================================
// 5. ENDPOINT EDIT: Update Power Supply Auto-Save
// ==========================================================
app.put('/api/power-supply/:idPop', async (req, res) => {
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
// 6. ENDPOINT READ: Ambil Semua Data PM POP (Termasuk Link BA)
// ==========================================================
app.get('/api/pm-pop', async (req, res) => {
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
      tahap5: formatDate(row.tahap_5),
      tahap6: formatDate(row.tahap_6),
      persentase: row.persentase ?? 0,
      status: row.status ?? 'BELUM',
      catatanHasilPm: row.catatan_hasil_pm ?? '-',
      done: row.done ?? 0,
      mitra: row.mitra ?? row.pt_servo ?? '-',
      picPmServo: row.pic_pm_servo ?? '-',
      wo: row.wo ?? '-',
      laporan: row.laporan ?? '-',

      // DOKUMEN LINK BERITA ACARA (BA) TAHAP 1 - 4
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
// 7. ENDPOINT EDIT: Update PM POP Auto-Save (Termasuk Mitra/PT Servo)
// ==========================================================
app.put('/api/pm-pop/:popId', async (req, res) => {
  const { popId } = req.params;
  const data = req.body;

  try {
    // Ambil kategori POP dari DB untuk kalkulasi persentase & status otomatis
    const [rows] = await db.query("SELECT kategori FROM pm_pop WHERE pop_id = ?", [popId]);
    const kategori = rows.length > 0 ? rows[0].kategori : (data.kategori || 'POP-A');

    // Hitung persentase, status, dan indikator done secara presisi
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
        tahap_5 = ?,
        tahap_6 = ?,
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
      data.tahap5 || null,
      data.tahap6 || null,
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

// Jalankan Server Express
app.listen(PORT, () => {
  console.log(`🚀 Server OPA RJBT aktif di http://localhost:${PORT}`);
});