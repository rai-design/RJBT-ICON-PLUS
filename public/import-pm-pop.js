const mysql = require('mysql2/promise');
const xlsx = require('xlsx');

async function importPmPop() {
  try {
    const db = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: '', // Sesuaikan password phpMyAdmin Anda jika ada
      database: 'db_rjbt',
    });

    console.log('✅ Terhubung ke database MySQL (db_rjbt)');

    // Hapus dan buat ulang tabel pm_pop
    await db.query('DROP TABLE IF EXISTS pm_pop');
    await db.query(`
      CREATE TABLE pm_pop (
        id INT AUTO_INCREMENT PRIMARY KEY,
        no INT,
        kategori VARCHAR(50),
        pop_name VARCHAR(255),
        pop_id VARCHAR(100),
        wilayah VARCHAR(100),
        kp VARCHAR(100),
        tikor VARCHAR(255),
        servo VARCHAR(100),
        pt_servo VARCHAR(255),
        tahap_1 DATE,
        tahap_2 DATE,
        tahap_3 DATE,
        tahap_4 DATE,
        tahap_5 DATE,
        tahap_6 DATE,
        persentase DECIMAL(5,2),
        status VARCHAR(50),
        health_index DECIMAL(5,2),
        catatan_hasil_pm TEXT,
        done TINYINT(1) DEFAULT 0,
        mitra VARCHAR(255),
        pic_pm_servo VARCHAR(255),
        wo VARCHAR(255),
        laporan VARCHAR(255),
        link_ba_tahap_1 TEXT,
        link_ba_tahap_2 TEXT,
        link_ba_tahap_3 TEXT,
        link_ba_tahap_4 TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('✅ Skema tabel pm_pop siap.');

    const fileName = 'PREVENTIVE MAINTENANCE RJBT 2026 (1).xlsx';
    console.log(`⏳ Membaca file ${fileName}...`);
    
    // Aktifkan Opsi Hyperlink pada XLSX Reader
    const workbook = xlsx.readFile(fileName, { cellDates: true, cellHTML: true });
    const sheet = workbook.Sheets['PM POP RJBT'];
    
    if (!sheet) {
      throw new Error("Sheet 'PM POP RJBT' tidak ditemukan.");
    }

    const rawData = xlsx.utils.sheet_to_json(sheet);
    console.log(`⏳ Memproses impor ${rawData.length} baris data beserta Hyperlink SharePoint...`);

    const parseDate = (val) => {
      if (!val || val === '-' || val === '') return null;
      if (val instanceof Date && !isNaN(val)) return val.toISOString().split('T')[0];
      const d = new Date(val);
      return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
    };

    // Helper Pembaca Hyperlink Target (URL SharePoint)
    const getHyperlink = (colLetter, rowIndex, fallbackVal) => {
      const cell = sheet[`${colLetter}${rowIndex}`];
      if (cell && cell.l && cell.l.Target) {
        return cell.l.Target; // Ambil URL SharePoint asli (https://...)
      }
      return fallbackVal && fallbackVal !== '-' ? String(fallbackVal).trim() : '-';
    };

    for (let index = 0; index < rawData.length; index++) {
      const row = rawData[index];
      const excelRowIndex = index + 2; // Baris data di Excel mulai dari baris 2 (setelah Header)

      const t1 = parseDate(row['Tahap 1']);
      const t2 = parseDate(row['Tahap 2']);
      const t3 = parseDate(row['Tahap 3']);
      const t4 = parseDate(row['Tahap 4']);
      const t5 = parseDate(row['Tahap 5']);
      const t6 = parseDate(row['Tahap 6']);

      // Ekstrak URL SharePoint asli dari cell Excel
      const linkBa1 = getHyperlink('Y', excelRowIndex, row['LINK BA TAHAP 1']);
      const linkBa2 = getHyperlink('Z', excelRowIndex, row['TAHAP 2']);
      const linkBa3 = getHyperlink('AA', excelRowIndex, row['TAHAP 3']);
      const linkBa4 = getHyperlink('AB', excelRowIndex, row['TAHAP 4']);

      const kategori = row['KATEGORI'] || '-';

      // Hitung persentase dinamis
      let target = 1;
      let count = 0;
      if (kategori === 'POP-SB') {
        target = 4;
        count = (t1 ? 1 : 0) + (t2 ? 1 : 0) + (t3 ? 1 : 0) + (t4 ? 1 : 0);
      } else if (kategori === 'POP-B') {
        target = 2;
        count = (t1 ? 1 : 0) + (t2 ? 1 : 0);
      } else {
        target = 1;
        count = t1 ? 1 : 0;
      }

      const persentase = Math.min(1.0, count / target);
      const status = persentase >= 1.0 ? 'SELESAI' : 'BELUM';

      await db.query(`
        INSERT INTO pm_pop (
          no, kategori, pop_name, pop_id, wilayah, kp, tikor, servo, pt_servo,
          tahap_1, tahap_2, tahap_3, tahap_4, tahap_5, tahap_6,
          persentase, status, health_index, catatan_hasil_pm, done, mitra, pic_pm_servo, wo, laporan,
          link_ba_tahap_1, link_ba_tahap_2, link_ba_tahap_3, link_ba_tahap_4
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        row['NO'] || null,
        kategori,
        row['POP NAME'] || '-',
        row['POP ID'] || '-',
        row['WILAYAH'] || '-',
        row['KP'] || '-',
        row['TIKOR'] || '-',
        row['SERVO'] || '-',
        row['PT.SERVO'] || '-',
        t1, t2, t3, t4, t5, t6,
        persentase,
        status,
        row['HEALTH INDEX'] ?? null,
        row['Catatan Hasil PM'] || '-',
        persentase >= 1.0 ? 1 : 0,
        row['MITRA'] || '-',
        row['PIC PM SERVO'] || '-',
        row['WO'] || '-',
        row['LAPORAN'] ? '1' : '0',
        linkBa1,
        linkBa2,
        linkBa3,
        linkBa4
      ]);
    }

    console.log(`🎉 Berhasil mengimpor ${rawData.length} data PM POP dengan URL SharePoint asli!`);
    await db.end();
  } catch (error) {
    console.error('❌ Gagal mengimpor data:', error.message);
  }
}

importPmPop();