const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const mysql = require('mysql2/promise');

const DATABASE_NAME = 'db_rjbt'; // Sesuai database di screenshot Anda
const TABLE_NAME = 'pm_powersupply';
const SHEET_NAME = 'PM POWERSUPPLY RJBT1';

function sanitizeColumnName(header, index, usedNames) {
  let name = String(header ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (!name) {
    name = `kolom_${index + 1}`;
  }
  if (name === 'id') {
    name = 'excel_id';
  }

  const baseName = name;
  let suffix = 2;
  while (usedNames.has(name)) {
    name = `${baseName}_${suffix}`;
    suffix += 1;
  }
  usedNames.add(name);

  return name;
}

function formatCellValue(val) {
  if (val === null || val === undefined) return null;
  if (val instanceof Date) {
    return val.toISOString().split('T')[0]; // Format Tanggal YYYY-MM-DD
  }
  return String(val).trim();
}

async function importExcelToMySQL() {
  let db;

  try {
    const files = fs.readdirSync(__dirname);
    const excelFileName = files.find(file =>
      /\.(xlsx|xls)$/i.test(file) && !file.startsWith('~$')
    );

    if (!excelFileName) {
      throw new Error('Tidak ditemukan file Excel di dalam folder proyek.');
    }

    const excelPath = path.join(__dirname, excelFileName);
    console.log(`Membaca file Excel: ${excelFileName}`);

    const workbook = xlsx.readFile(excelPath, { cellDates: true });

    // Mencari sheet secara presisi maupun fleksibel
    const actualSheetName = workbook.SheetNames.find(
      s => s.trim().toLowerCase().replace(/\s+/g, '') === SHEET_NAME.trim().toLowerCase().replace(/\s+/g, '')
    ) || workbook.SheetNames.find(s => s.toLowerCase().includes('powersupply'));

    if (!actualSheetName) {
      throw new Error(`Sheet '${SHEET_NAME}' tidak ditemukan.`);
    }

    console.log(`Menggunakan Sheet: "${actualSheetName}"`);
    const sheet = workbook.Sheets[actualSheetName];

    const rows = xlsx.utils.sheet_to_json(sheet, {
      header: 1,
      defval: null,
      blankrows: false
    });

    if (rows.length < 2) {
      throw new Error(`Sheet '${actualSheetName}' kosong.`);
    }

    const headers = rows[0];
    const usedNames = new Set(['id']);
    const columns = headers.map((header, index) =>
      sanitizeColumnName(header, index, usedNames)
    );

    console.log(`Total kolom terdeteksi dari Excel: ${columns.length} kolom`);

    const dataRows = rows.slice(1).filter(row =>
      row.some(value => value !== null && value !== undefined && String(value).trim() !== '')
    );

    db = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: '' // Sesuaikan password MySQL/XAMPP Anda jika ada
    });

    await db.query(`CREATE DATABASE IF NOT EXISTS \`${DATABASE_NAME}\``);
    await db.query(`USE \`${DATABASE_NAME}\``);

    // Hapus tabel lama agar struktur 55 kolom dibuat ulang secara segar
    await db.query(`DROP TABLE IF EXISTS \`${TABLE_NAME}\``);

    // Buat definisi query tabel dinamik berdasarkan seluruh kolom dari Excel
    const columnDefinitions = columns
      .map(col => `\`${col}\` TEXT NULL`)
      .join(',\n  ');

    await db.query(`
      CREATE TABLE \`${TABLE_NAME}\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        ${columnDefinitions}
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    const columnList = columns.map(col => `\`${col}\``).join(', ');
    const values = dataRows.map(row =>
      columns.map((_, index) => formatCellValue(row[index]))
    );

    // Masukkan data secara bertahap (batch insert) per 100 baris
    const BATCH_SIZE = 100;
    for (let i = 0; i < values.length; i += BATCH_SIZE) {
      const batch = values.slice(i, i + BATCH_SIZE);
      await db.query(
        `INSERT INTO \`${TABLE_NAME}\` (${columnList}) VALUES ?`,
        [batch]
      );
    }

    console.log(
      ` Berhasil mengimpor ${values.length} baris dan ${columns.length} kolom ke ` +
      `database '${DATABASE_NAME}', tabel '${TABLE_NAME}'.`
    );

  } finally {
    if (db) {
      await db.end();
    }
  }
}

importExcelToMySQL().catch(error => {
  console.error('Gagal mengimpor data:', error.message);
  process.exitCode = 1;
});