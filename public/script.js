// ==========================================================
// ELEMEN UTAMA DASHBOARD & EVENT LISTENERS
// ==========================================================
const monitoringToggle = document.getElementById("monitoringToggle");
const monitoringSubmenu = document.getElementById("monitoringSubmenu");
const monitoringChevron = document.getElementById("monitoringChevron");
const mobileMenu = document.getElementById("mobileMenu");
const sidebar = document.getElementById("sidebar");
const searchInput = document.getElementById("searchInput");

if (monitoringToggle) {
  monitoringToggle.addEventListener("click", () => {
    if (monitoringSubmenu) monitoringSubmenu.classList.toggle("open");
    if (monitoringChevron) monitoringChevron.classList.toggle("closed");
  });
}

// Navigasi Halaman Utama
const navLinks = document.querySelectorAll("[data-page]");
navLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    const pageName = link.dataset.page;
    navLinks.forEach((item) => item.classList.remove("active"));
    link.classList.add("active");

    document.querySelectorAll(".page").forEach((page) => {
      page.classList.remove("active-page");
    });

    const target = document.getElementById(`page-${pageName}`);
    if (target) target.classList.add("active-page");

    if (sidebar && window.innerWidth <= 900) {
      sidebar.classList.remove("mobile-open");
    }
  });
});

if (mobileMenu && sidebar) {
  mobileMenu.addEventListener("click", () => sidebar.classList.toggle("mobile-open"));
}

// Jam Realtime
function updateClock() {
  const now = new Date();
  const dateEl = document.getElementById("date");
  const timeEl = document.getElementById("time");

  if (dateEl) {
    dateEl.textContent = now.toLocaleDateString("id-ID", {
      day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Jakarta"
    }).toUpperCase();
  }
  if (timeEl) {
    timeEl.textContent = now.toLocaleTimeString("id-ID", {
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "Asia/Jakarta"
    });
  }
}
updateClock();
setInterval(updateClock, 1000);

// ==========================================================
// DATA KONSOLIDASI DATA MASTER SHEET EXCEL (874 POP SBU RJBT)
// ==========================================================
const summaryKpData = [
  { kp: 'SURABAYA', totalPop: 313, avgHi: 83.63, good: 192, warning: 111, check: 2, dangerous: 8 },
  { kp: 'MALANG', totalPop: 287, avgHi: 82.36, good: 158, warning: 125, check: 0, dangerous: 4 },
  { kp: 'MADIUN', totalPop: 157, avgHi: 77.01, good: 68, warning: 85, check: 0, dangerous: 4 },
  { kp: 'JEMBER', totalPop: 117, avgHi: 96.66, good: 103, warning: 14, check: 0, dangerous: 0 }
];

// Sample dataset riil sesuai kolom DATA MASTER
const rawMasterData = [
  { kp: 'SURABAYA', kategori: 'POP-SB', idPop: 'POP_1SBY003', namaPop: 'POP_1SBY003_INTILAND LT.5', olt: 'NON - OLT', ps: '100', ac: '100', genset: 'TIDAK ADA', pmPop: 100, hi: 100, status: 'GOOD CONDITION' },
  { kp: 'SURABAYA', kategori: 'POP-SB', idPop: 'POP_1SDA002', namaPop: 'POP_1SDA002_WARU GI SHELTER-1 PLN', olt: 'NON - OLT', ps: '100', ac: '100', genset: '60', pmPop: 75, hi: 84, status: 'GOOD CONDITION' },
  { kp: 'MADIUN', kategori: 'POP-B', idPop: 'POP_1BJN001', namaPop: 'POP_1BJN001_BABAT GI SHELTER PLN', olt: 'NON - OLT', ps: '100', ac: '100', genset: '100', pmPop: 100, hi: 100, status: 'GOOD CONDITION' },
  { kp: 'MALANG', kategori: 'POP-B', idPop: 'POP_1KDR10048', namaPop: 'POP_1KDR10048_BANARAN GI 2 SHELTER PLN', olt: 'NON - OLT', ps: '100', ac: '100', genset: '20', pmPop: 100, hi: 88, status: 'GOOD CONDITION' },
  { kp: 'MALANG', kategori: 'POP-B', idPop: 'POP_1KDR002', namaPop: 'POP_1KDR002_BANARAN GI SHELTER PLN', olt: 'NON - OLT', ps: '100', ac: '100', genset: '20', pmPop: 100, hi: 88, status: 'GOOD CONDITION' },
  { kp: 'SURABAYA', kategori: 'POP-B', idPop: 'POP_1BKL002', namaPop: 'POP_1BKL002_BANGKALAN GI SHELTER PLN', olt: 'NON - OLT', ps: '100', ac: '100', genset: '60', pmPop: 100, hi: 94, status: 'GOOD CONDITION' },
  { kp: 'JEMBER', kategori: 'POP-B', idPop: 'POP_1BYW005', namaPop: 'POP_1BYW005_BANYUWANGI GI SHELTER PLN', olt: 'NON - OLT', ps: '100', ac: '100', genset: '100', pmPop: 100, hi: 100, status: 'GOOD CONDITION' },
  { kp: 'SURABAYA', kategori: 'POP-A', idPop: 'POP_1SBY012', namaPop: 'POP_1SBY012_DARMO GRAND GI SHELTER PLN', olt: 'OLT_SBY_DARMO', ps: '100', ac: 'NON-AC', genset: '100', pmPop: 100, hi: 100, status: 'GOOD CONDITION' },
  { kp: 'SURABAYA', kategori: 'POP-A', idPop: 'POP_1SBY011', namaPop: 'POP_1SBY011_DISJATIM PLN', olt: 'OLT_SBY_DISJATIM', ps: '100', ac: '100', genset: '100', pmPop: 100, hi: 100, status: 'GOOD CONDITION' },
  { kp: 'MALANG', kategori: 'POP-A', idPop: 'POP_1PSN003', namaPop: 'POP_1PSN003_GONDANGWETAN GI SHELTER PLN', olt: 'OLT_PSN_GONDANG', ps: '100', ac: '100', genset: '100', pmPop: 100, hi: 100, status: 'GOOD CONDITION' },
  { kp: 'MADIUN', kategori: 'POP-D', idPop: 'POP_1NGW004', namaPop: 'POP_1NGW004_NGAWI KOTA POP', olt: 'OLT_NGW_KOTA', ps: '80', ac: '60', genset: '0', pmPop: 70, hi: 68, status: 'WARNING' },
  { kp: 'SURABAYA', kategori: 'POP-D', idPop: 'POP_1SDA009', namaPop: 'POP_1SDA009_TANGGULANGIN POP', olt: 'OLT_SDA_TANGGUL', ps: '50', ac: '40', genset: '0', pmPop: 50, hi: 54, status: 'NEED CHECK' },
  { kp: 'SURABAYA', kategori: 'POP-D', idPop: 'POP_1MDN003', namaPop: 'POP_1MDN003_BANGKALAN UTARA', olt: 'OLT_BKL_UTARA', ps: '20', ac: '20', genset: '0', pmPop: 30, hi: 32, status: 'DANGEROUS' }
];

// ==========================================================
// RENDER TABEL & KPI
// ==========================================================
function renderKpSummaryTable() {
  const tbody = document.getElementById('tableKpSummaryBody');
  if (!tbody) return;

  tbody.innerHTML = '';
  let totPop = 0, totGood = 0, totWarn = 0, totCheck = 0, totDanger = 0;
  let weightedHiSum = 0;

  summaryKpData.forEach(item => {
    totPop += item.totalPop;
    totGood += item.good;
    totWarn += item.warning;
    totCheck += item.check;
    totDanger += item.dangerous;
    weightedHiSum += (item.avgHi * item.totalPop);

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight: 700; color: #0f172a;">KP ${item.kp}</td>
      <td style="text-align: center; font-weight: 700;">${item.totalPop} Site</td>
      <td style="text-align: center; font-weight: 800; color: ${item.avgHi >= 90 ? '#16a34a' : '#0284c7'};">${item.avgHi}%</td>
      <td style="text-align: center; font-weight: 700;" class="text-green">${item.good}</td>
      <td style="text-align: center; font-weight: 700;" class="text-amber">${item.warning}</td>
      <td style="text-align: center; font-weight: 700;" class="text-orange">${item.check}</td>
      <td style="text-align: center; font-weight: 700;" class="text-red">${item.dangerous}</td>
    `;
    tbody.appendChild(tr);
  });

  // Total Baris SBU
  const avgSbuHi = (weightedHiSum / totPop).toFixed(2);
  const trTotal = document.createElement('tr');
  trTotal.style.background = '#f8fafc';
  trTotal.style.borderTop = '2px solid #cbd5e1';
  trTotal.style.fontWeight = '800';
  trTotal.innerHTML = `
    <td style="color: #0284c7;">SBU REGIONAL JAWA TIMUR</td>
    <td style="text-align: center;">${totPop} Site</td>
    <td style="text-align: center; color: #16a34a;">${avgSbuHi}%</td>
    <td style="text-align: center;" class="text-green">${totGood}</td>
    <td style="text-align: center;" class="text-amber">${totWarn}</td>
    <td style="text-align: center;" class="text-orange">${totCheck}</td>
    <td style="text-align: center;" class="text-red">${totDanger}</td>
  `;
  tbody.appendChild(trTotal);
}

function renderMasterTable(data) {
  const tbody = document.getElementById('tableMasterBody');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="11" style="text-align: center; padding: 20px; color: #64748b;">Tidak ada data yang sesuai filter.</td></tr>`;
    return;
  }

  data.forEach(item => {
    let badgeClass = 'badge-good';
    if (item.status === 'WARNING') badgeClass = 'badge-warning';
    else if (item.status === 'NEED CHECK') badgeClass = 'badge-check';
    else if (item.status === 'DANGEROUS') badgeClass = 'badge-dangerous';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight: 700;">KP ${item.kp}</td>
      <td><span style="font-weight: 600; color: #475569;">${item.kategori}</span></td>
      <td style="font-weight: 700; color: #0284c7;">${item.idPop}</td>
      <td style="font-weight: 600;">${item.namaPop}</td>
      <td style="color: #64748b; font-size: 0.78rem;">${item.olt}</td>
      <td style="text-align: center;">${item.ps}%</td>
      <td style="text-align: center;">${item.ac}%</td>
      <td style="text-align: center;">${item.genset}</td>
      <td style="text-align: center; font-weight: 700;">${item.pmPop}%</td>
      <td style="text-align: center; font-weight: 800; color: ${item.hi >= 80 ? '#16a34a' : (item.hi >= 60 ? '#d97706' : '#dc2626')};">${item.hi}%</td>
      <td style="text-align: center;"><span class="badge-status ${badgeClass}">${item.status}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

function applyMasterFilters() {
  const kpVal = document.getElementById('filterKp') ? document.getElementById('filterKp').value : 'ALL';
  const statusVal = document.getElementById('filterStatus') ? document.getElementById('filterStatus').value : 'ALL';
  const searchVal = (document.getElementById('tableSearchMaster') ? document.getElementById('tableSearchMaster').value : '').toLowerCase();

  const filtered = rawMasterData.filter(item => {
    const matchKp = (kpVal === 'ALL') || (item.kp === kpVal);
    const matchStatus = (statusVal === 'ALL') || (item.status === statusVal);
    const matchSearch = item.namaPop.toLowerCase().includes(searchVal) ||
                        item.idPop.toLowerCase().includes(searchVal) ||
                        item.olt.toLowerCase().includes(searchVal);

    return matchKp && matchStatus && matchSearch;
  });

  renderMasterTable(filtered);
}

// Inisialisasi Saat Dokumen Siap
document.addEventListener('DOMContentLoaded', () => {
  renderKpSummaryTable();
  renderMasterTable(rawMasterData);
});