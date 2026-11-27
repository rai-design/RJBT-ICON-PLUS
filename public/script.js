// ==========================================================
// 0. GLOBAL FETCH HELPER & LOGOUT MODAL HANDLER
// ==========================================================
async function fetchWithAuth(url, options = {}) {
  try {
    const response = await fetch(url, options);

    if (response.status === 401) {
      localStorage.removeItem('user_session');
      alert('Sesi Anda telah berakhir. Silakan login kembali.');
      window.location.replace('/login.html');
      return null;
    }

    return response;
  } catch (error) {
    console.error('Fetch Error:', error);
    throw error;
  }
}

function handleLogout() {
  const modal = document.getElementById('logoutModal');
  if (modal) modal.classList.add('active');
}

function closeLogoutModal() {
  const modal = document.getElementById('logoutModal');
  if (modal) modal.classList.remove('active');
}

async function confirmLogout() {
  const btn = document.querySelector('.btn-confirm-logout');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Proses...';
  }

  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch (err) {
    console.error('Logout server error:', err);
  } finally {
    localStorage.removeItem('user_session');
    window.location.replace('/login.html');
  }
}

// ==========================================================
// 1. ELEMEN UTAMA DASHBOARD & EVENT LISTENERS
// ==========================================================
const monitoringToggle = document.getElementById("monitoringToggle");
const monitoringSubmenu = document.getElementById("monitoringSubmenu");
const monitoringChevron = document.getElementById("monitoringChevron");
const mobileMenu = document.getElementById("mobileMenu");
const sidebar = document.getElementById("sidebar");
const topbarSearchInput = document.getElementById("searchInput");

if (monitoringToggle) {
  monitoringToggle.addEventListener("click", () => {
    if (monitoringSubmenu) monitoringSubmenu.classList.toggle("open");
    if (monitoringChevron) monitoringChevron.classList.toggle("closed");
  });
}

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
    if (target) {
      void target.offsetWidth; // Paksa reflow agar animasi berulang saat menu yang sama diklik
      target.classList.add("active-page");
    }

    // Re-fetch data otomatis saat berpindah kembali ke tab Dashboard Data Master POP
    if (pageName === 'dashboard') {
      loadMasterDashboardData();
    }

    if (sidebar && window.innerWidth <= 900) {
      sidebar.classList.remove("mobile-open");
    }
  });
});

// Listener komunikasi antar-iframe (pemicu refresh otomatis dari child module)
window.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'REFRESH_DASHBOARD') {
    loadMasterDashboardData();
  }
});

if (mobileMenu && sidebar) {
  mobileMenu.addEventListener("click", () => sidebar.classList.toggle("mobile-open"));
}

document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    if (topbarSearchInput) {
      topbarSearchInput.focus();
      topbarSearchInput.select();
    }
  }
});

if (topbarSearchInput) {
  topbarSearchInput.addEventListener("keyup", () => {
    const tableSearchMaster = document.getElementById("tableSearchMaster");
    if (tableSearchMaster) {
      tableSearchMaster.value = topbarSearchInput.value;
    }
    applyMasterFilters();
  });
}

// ==========================================================
// 2. JAM REALTIME (WIB / ASIA/JAKARTA)
// ==========================================================
function updateClock() {
  const now = new Date();
  const dateEl = document.getElementById("date");
  const timeEl = document.getElementById("time");

  if (dateEl) {
    dateEl.textContent = now.toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "Asia/Jakarta"
    }).toUpperCase();
  }
  if (timeEl) {
    timeEl.textContent = now.toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZone: "Asia/Jakarta"
    });
  }
}
updateClock();
setInterval(updateClock, 1000);

// ==========================================================
// 3. STORAGE & VARIABEL PAGINASI
// ==========================================================
let rawMasterData = [];
let filteredMasterData = [];
let currentPage = 1;
let rowsPerPage = 10;

// Helper Penentuan Status Resume Index (0-59% masuk ke NEED CHECK)
function resolveResumeStatus(item) {
  const hi = Number(item.healthIndex ?? item.hi ?? 0);
  if (hi >= 80) return 'GOOD CONDITION';
  if (hi >= 60) return 'WARNING';
  return 'NEED CHECK';
}

// ==========================================================
// 4. LOGIKA HITUNG DINAMIS: KPI CARDS & MATRIKS REGIONAL KP
// ==========================================================
function updateDynamicKpiAndSummary(dataList) {
  const kpOrder = ['SURABAYA', 'MALANG', 'MADIUN', 'JEMBER'];
  const kpStats = {
    'SURABAYA': { total: 0, hiSum: 0, good: 0, warn: 0, check: 0 },
    'MALANG':   { total: 0, hiSum: 0, good: 0, warn: 0, check: 0 },
    'MADIUN':   { total: 0, hiSum: 0, good: 0, warn: 0, check: 0 },
    'JEMBER':   { total: 0, hiSum: 0, good: 0, warn: 0, check: 0 }
  };

  let totalSite = dataList.length;
  let totalHiSum = 0;
  let totGood = 0, totWarn = 0, totCheck = 0;

  dataList.forEach(item => {
    let rawKp = String(item.regionalKp || item.kp || '').toUpperCase().trim();
    rawKp = rawKp.replace(/^KP\s+/, '');

    let kpKey = 'SURABAYA';
    if (rawKp.includes('MALANG')) kpKey = 'MALANG';
    else if (rawKp.includes('MADIUN')) kpKey = 'MADIUN';
    else if (rawKp.includes('JEMBER')) kpKey = 'JEMBER';
    else if (rawKp.includes('SURABAYA')) kpKey = 'SURABAYA';

    const hi = Number(item.healthIndex ?? item.hi ?? 0);
    const status = resolveResumeStatus(item);

    if (!kpStats[kpKey]) {
      kpStats[kpKey] = { total: 0, hiSum: 0, good: 0, warn: 0, check: 0 };
    }

    kpStats[kpKey].total += 1;
    kpStats[kpKey].hiSum += hi;
    totalHiSum += hi;

    if (status === 'GOOD CONDITION') {
      kpStats[kpKey].good++;
      totGood++;
    } else if (status === 'WARNING') {
      kpStats[kpKey].warn++;
      totWarn++;
    } else {
      // 0% - 59% otomatis masuk ke NEED CHECK
      kpStats[kpKey].check++;
      totCheck++;
    }
  });

  const avgSbuHiFloat = totalSite > 0 ? (totalHiSum / totalSite) : 0;
  const avgSbuHi = avgSbuHiFloat.toFixed(2);
  const avgSbuHiRounded = Math.round(avgSbuHiFloat);

  // 1. Update 5 KPI Cards Utama (1 Hero Kiri + 2x2 Kanan)
  if (document.getElementById('kpiTotalPop')) document.getElementById('kpiTotalPop').textContent = totalSite;
  if (document.getElementById('kpiAvgHi')) document.getElementById('kpiAvgHi').textContent = `${avgSbuHi}%`;
  if (document.getElementById('kpiGoodCount')) document.getElementById('kpiGoodCount').textContent = totGood;
  if (document.getElementById('kpiWarningCount')) document.getElementById('kpiWarningCount').textContent = totWarn;
  if (document.getElementById('kpiNeedCheckCount')) document.getElementById('kpiNeedCheckCount').textContent = totCheck;

  const avgHiBar = document.getElementById('kpiAvgHiBar');
  if (avgHiBar) {
    avgHiBar.style.width = `${Math.min(100, Math.max(0, avgSbuHiFloat))}%`;
  }

  // 2. Render Baris Matriks Kesehatan per KP (6 Kolom)
  const tbody = document.getElementById('tableKpSummaryBody');
  if (tbody) {
    tbody.innerHTML = '';
    kpOrder.forEach(kpName => {
      const st = kpStats[kpName] || { total: 0, hiSum: 0, good: 0, warn: 0, check: 0 };
      const avgHiFloat = st.total > 0 ? (st.hiSum / st.total) : 0;
      const avgHiDecimal = avgHiFloat.toFixed(2);
      const avgHiRounded = Math.round(avgHiFloat);

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight: 700; color: #0f172a;">KP ${kpName}</td>
        <td style="text-align: center; font-weight: 700;">${st.total} Site</td>
        <td style="text-align: center; font-weight: 800; color: ${avgHiFloat >= 80 ? '#16a34a' : '#0284c7'};">
          ${avgHiDecimal}% <span style="font-weight: 500; font-size: 0.75rem; color: #64748b;">(${avgHiRounded}%)</span>
        </td>
        <td style="text-align: center; font-weight: 700;" class="text-green">${st.good}</td>
        <td style="text-align: center; font-weight: 700;" class="text-amber">${st.warn}</td>
        <td style="text-align: center; font-weight: 700;" class="text-orange">${st.check}</td>
      `;
      tbody.appendChild(tr);
    });

    // Baris Total SBU Regional Jawa Timur
    const trTotal = document.createElement('tr');
    trTotal.style.background = '#f8fafc';
    trTotal.style.borderTop = '2px solid #cbd5e1';
    trTotal.style.fontWeight = '800';
    trTotal.innerHTML = `
      <td style="color: #0284c7;">SBU REGIONAL JAWA TIMUR</td>
      <td style="text-align: center;">${totalSite} Site</td>
      <td style="text-align: center; color: #16a34a;">
        ${avgSbuHi}% <span style="font-weight: 500; font-size: 0.75rem; color: #64748b;">(${avgSbuHiRounded}%)</span>
      </td>
      <td style="text-align: center;" class="text-green">${totGood}</td>
      <td style="text-align: center;" class="text-amber">${totWarn}</td>
      <td style="text-align: center;" class="text-orange">${totCheck}</td>
    `;
    tbody.appendChild(trTotal);
  }
}

// ==========================================================
// 5. RENDER TABEL RINCIAN DENGAN EVENT KLIK BARIS & MODAL RJBT
// ==========================================================
function renderMasterTable() {
  const tbody = document.getElementById('tableMasterBody');
  if (!tbody) return;

  tbody.innerHTML = '';

  const totalItems = filteredMasterData.length;

  if (totalItems === 0) {
    tbody.innerHTML = `<tr><td colspan="12" style="text-align: center; padding: 20px; color: #64748b;">Tidak ada data yang sesuai filter.</td></tr>`;
    updatePaginationUI(0, 0, 0, 0);
    return;
  }

  const totalPages = Math.ceil(totalItems / rowsPerPage);
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;

  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = Math.min(startIndex + rowsPerPage, totalItems);
  const currentSlice = filteredMasterData.slice(startIndex, endIndex);

  const formatDisplay = (val) => {
    if (val === null || val === undefined || val === '') return '-';
    const str = String(val).trim();
    if (!isNaN(str) && str !== '') return `${str}%`;
    return str;
  };

  currentSlice.forEach((item, index) => {
    const statusVal = resolveResumeStatus(item);
    let badgeClass = 'badge-good';
    if (statusVal === 'WARNING') badgeClass = 'badge-warning';
    else if (statusVal === 'NEED CHECK') badgeClass = 'badge-check';

    const kp = item.regionalKp || item.kp || '-';
    const kategori = item.kategori || '-';
    const idPop = item.idPop || '-';
    const namaPop = item.namaPop || '-';
    const olt = item.hostnameOlt || item.olt || 'NON - OLT';
    const ps = item.powerSupply ?? item.ps;
    const ac = item.ac;
    const genset = item.genset;
    const pmPop = item.pmPop;
    const hi = item.healthIndex ?? item.hi ?? 100;

    const tr = document.createElement('tr');
    tr.title = `Klik untuk melihat & mengedit catatan ${idPop}`;
    
    // PEMICU POP-UP MODAL SAAT BARIS DATA DIKLIK
    tr.onclick = () => openNoteModal(item);

    tr.innerHTML = `
      <td style="text-align: center; font-weight: 600; color: #64748b;">${startIndex + index + 1}</td>
      <td style="font-weight: 700;">KP ${kp}</td>
      <td><span style="font-weight: 600; color: #475569;">${kategori}</span></td>
      <td style="font-weight: 700; color: #0284c7;" title="${idPop}">${idPop}</td>
      <td style="font-weight: 600;" title="${namaPop}">${namaPop}</td>
      <td style="color: #64748b; font-size: 0.76rem;" title="${olt}">${olt}</td>
      <td style="text-align: center;">${formatDisplay(ps)}</td>
      <td style="text-align: center;">${formatDisplay(ac)}</td>
      <td style="text-align: center;">${formatDisplay(genset)}</td>
      <td style="text-align: center; font-weight: 700;">${formatDisplay(pmPop)}</td>
      <td style="text-align: center; font-weight: 800; color: ${hi >= 80 ? '#16a34a' : (hi >= 60 ? '#d97706' : '#ea580c')};">${hi}%</td>
      <td style="text-align: center;"><span class="badge-status ${badgeClass}">${statusVal}</span></td>
    `;
    tbody.appendChild(tr);
  });

  updatePaginationUI(startIndex + 1, endIndex, totalItems, totalPages);
}

// BUKA MODAL CATATAN DATA MASTER POP (GAYA RJBT MODULE)
function openNoteModal(item) {
  const modal = document.getElementById('modalNoteMaster');
  if (!modal) return;

  document.getElementById('noteIdPop').value = item.idPop;
  document.getElementById('modalNoteTitle').textContent = item.idPop || 'POP DETAIL';
  document.getElementById('modalNoteSub').textContent = `${item.namaPop || '-'} {KP ${item.regionalKp || '-'}} - Kategori: ${item.kategori || '-'} | Hostname OLT: ${item.hostnameOlt || 'NON - OLT'}`;

  // Summary Section Health Index Site
  const hiVal = item.healthIndex ?? item.hi ?? 100;
  const hiBadge = document.getElementById('modalNoteHiBadge');
  if (hiBadge) {
    hiBadge.textContent = `HEALTH INDEX: ${hiVal}%`;
    hiBadge.style.color = hiVal >= 80 ? '#16a34a' : (hiVal >= 60 ? '#d97706' : '#ea580c');
  }

  const formatStr = (val) => (val !== null && val !== undefined && val !== '') ? (isNaN(val) ? val : `${val}%`) : '-';

  if (document.getElementById('modalNotePs')) document.getElementById('modalNotePs').textContent = formatStr(item.powerSupply);
  if (document.getElementById('modalNoteAc')) document.getElementById('modalNoteAc').textContent = formatStr(item.ac);
  if (document.getElementById('modalNoteGenset')) document.getElementById('modalNoteGenset').textContent = formatStr(item.genset);
  if (document.getElementById('modalNotePmPop')) document.getElementById('modalNotePmPop').textContent = formatStr(item.pmPop);

  // Populasi Input Form Catatan
  document.getElementById('noteCatatanPm').value = item.catatanPm || '';
  document.getElementById('noteGamasTerakhir').value = item.gamasTerakhir || '';
  document.getElementById('noteRootCause').value = item.rootCause || '';
  document.getElementById('noteAction').value = item.action || '';

  modal.classList.add('active');
}

// TUTUP MODAL CATATAN DATA MASTER POP
function closeNoteModal() {
  const modal = document.getElementById('modalNoteMaster');
  if (modal) modal.classList.remove('active');
}

// SIMPAN CATATAN VIA API PUT BACKEND
async function saveMasterNotes(event) {
  event.preventDefault();
  const idPop = document.getElementById('noteIdPop').value;
  const btnSave = document.getElementById('btnSaveNote');

  const payload = {
    catatanPm: document.getElementById('noteCatatanPm').value,
    gamasTerakhir: document.getElementById('noteGamasTerakhir').value,
    rootCause: document.getElementById('noteRootCause').value,
    action: document.getElementById('noteAction').value
  };

  try {
    if (btnSave) {
      btnSave.disabled = true;
      btnSave.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan...';
    }

    const res = await fetchWithAuth(`/api/dashboard/master/${encodeURIComponent(idPop)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res && res.ok) {
      const result = await res.json();
      if (result.success) {
        closeNoteModal();
        await loadMasterDashboardData(); // Refetch & update UI otomatis
      } else {
        alert(result.error || 'Gagal menyimpan catatan.');
      }
    }
  } catch (err) {
    console.error('Error saving notes:', err);
    alert('Terjadi kesalahan saat menyimpan catatan.');
  } finally {
    if (btnSave) {
      btnSave.disabled = false;
      btnSave.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Simpan Catatan';
    }
  }
}

// Generate Deret Angka Paginasi (1 2 3 ... 88)
function getPageNumbers(current, total) {
  const delta = 1;
  const range = [];
  const rangeWithDots = [];
  let l;

  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || (i >= current - delta && i <= current + delta)) {
      range.push(i);
    }
  }

  for (let i of range) {
    if (l) {
      if (i - l === 2) {
        rangeWithDots.push(l + 1);
      } else if (i - l !== 1) {
        rangeWithDots.push('...');
      }
    }
    rangeWithDots.push(i);
    l = i;
  }

  return rangeWithDots;
}

// Render UI Paginasi & Tombol
function updatePaginationUI(start, end, total, totalPages) {
  const infoEl = document.getElementById('paginationInfo');
  const controlsEl = document.getElementById('paginationControls');

  if (infoEl) {
    infoEl.textContent = total > 0 ? `${start} - ${end} dari ${total} data` : `0 - 0 dari 0 data`;
  }

  if (!controlsEl) return;
  controlsEl.innerHTML = '';

  if (total === 0 || totalPages <= 0) return;

  // 1. Tombol Previous
  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'btn-page-num';
  prevBtn.textContent = '« Previous';
  prevBtn.disabled = (currentPage <= 1);
  prevBtn.onclick = () => goToPage(currentPage - 1);
  controlsEl.appendChild(prevBtn);

  // 2. Tombol Angka Halaman
  const pageNumbers = getPageNumbers(currentPage, totalPages);
  pageNumbers.forEach(p => {
    if (p === '...') {
      const dots = document.createElement('span');
      dots.className = 'pagination-dots';
      dots.textContent = '...';
      controlsEl.appendChild(dots);
    } else {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `btn-page-num ${p === currentPage ? 'active' : ''}`;
      btn.textContent = p;
      btn.onclick = () => goToPage(p);
      controlsEl.appendChild(btn);
    }
  });

  // 3. Tombol Next
  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'btn-page-num';
  nextBtn.textContent = 'Next »';
  nextBtn.disabled = (currentPage >= totalPages);
  nextBtn.onclick = () => goToPage(currentPage + 1);
  controlsEl.appendChild(nextBtn);
}

function goToPage(page) {
  const totalPages = Math.ceil(filteredMasterData.length / rowsPerPage);
  if (page >= 1 && page <= totalPages) {
    currentPage = page;
    renderMasterTable();
  }
}

function changeRowsPerPage() {
  const select = document.getElementById('selectRowsPerPage');
  if (select) {
    rowsPerPage = parseInt(select.value, 10) || 10;
    currentPage = 1;
    renderMasterTable();
  }
}

// ==========================================================
// 6. FILTERING DATA DASHBOARD
// ==========================================================
function syncActiveKpiCard(activeStatus) {
  document.querySelectorAll('.kpi-clickable').forEach(card => {
    card.classList.toggle('active-kpi', card.dataset.kpi === activeStatus);
  });
}

function filterByKpiCard(status) {
  const statusSelect = document.getElementById('filterStatus');
  if (statusSelect) {
    // Jika kartu yang sedang aktif diklik ulang (selain ALL), kembalikan ke ALL
    const nextStatus = (statusSelect.value === status && status !== 'ALL') ? 'ALL' : status;
    statusSelect.value = nextStatus;
  }

  applyMasterFilters();

  // Scroll halus menuju tabel rincian Data Master POP
  const filterBar = document.querySelector('#page-dashboard .filter-bar');
  if (filterBar) {
    filterBar.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function applyMasterFilters() {
  const kpVal = document.getElementById('filterKp') ? document.getElementById('filterKp').value : 'ALL';
  const statusVal = document.getElementById('filterStatus') ? document.getElementById('filterStatus').value : 'ALL';

  syncActiveKpiCard(statusVal);

  const searchInputMaster = document.getElementById('tableSearchMaster');
  const searchValMaster = searchInputMaster ? searchInputMaster.value.trim().toLowerCase() : '';
  const topbarVal = topbarSearchInput ? topbarSearchInput.value.trim().toLowerCase() : '';
  const searchVal = searchValMaster || topbarVal;

  filteredMasterData = rawMasterData.filter(item => {
    const itemKp = (item.regionalKp || item.kp || '').toUpperCase();
    const itemStatus = resolveResumeStatus(item);

    const matchKp = (kpVal === 'ALL') || itemKp.includes(kpVal);
    const matchStatus = (statusVal === 'ALL') || (itemStatus === statusVal);
    
    const namaPop = (item.namaPop || '').toLowerCase();
    const idPop = (item.idPop || '').toLowerCase();
    const olt = (item.hostnameOlt || item.olt || '').toLowerCase();

    const matchSearch = namaPop.includes(searchVal) ||
                        idPop.includes(searchVal) ||
                        olt.includes(searchVal);

    return matchKp && matchStatus && matchSearch;
  });

  currentPage = 1;
  renderMasterTable();
}

// ==========================================================
// 7. MEMUAT REKAPITULASI DARI BACKEND (HANDLING ERROR PENUH)
// ==========================================================
async function loadMasterDashboardData() {
  const tbodyMaster = document.getElementById('tableMasterBody');
  const tbodyKp = document.getElementById('tableKpSummaryBody');

  try {
    const res = await fetchWithAuth('/api/dashboard/master');
    
    if (res && res.ok) {
      const result = await res.json();
      if (result.success && Array.isArray(result.data)) {
        rawMasterData = result.data;
        updateDynamicKpiAndSummary(rawMasterData);
        applyMasterFilters();
        return;
      } else {
        throw new Error(result.error || 'Format data dari server tidak valid.');
      }
    } else {
      const errJson = res ? await res.json().catch(() => ({})) : {};
      throw new Error(errJson.error || `Server Error (HTTP Status ${res ? res.status : 'Unknown'})`);
    }
  } catch (err) {
    console.error('Gagal mengambil data dashboard:', err);

    if (tbodyMaster) {
      tbodyMaster.innerHTML = `
        <tr>
          <td colspan="12" style="text-align: center; padding: 24px; color: #dc2626; font-weight: 600;">
            <i class="fa-solid fa-triangle-exclamation" style="font-size: 1.2rem; margin-bottom: 6px; display: block;"></i>
            Gagal memuat Data Master POP dari server.<br/>
            <span style="font-size: 0.75rem; color: #64748b; font-weight: normal;">
              Detail: ${err.message}. Pastikan MySQL telah di-ALTER dan server Node.js sudah di-restart.
            </span>
          </td>
        </tr>`;
    }

    if (tbodyKp) {
      tbodyKp.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 16px; color: #64748b; font-size: 0.78rem;">
            Data matriks tidak dapat dikalkulasi (gagal memuat data backend).
          </td>
        </tr>`;
    }
  }
}

// ==========================================================
// 8. SINKRONISASI BLUR HALAMAN PENUH SAAT POP-UP IFRAME DIBUKA
// ==========================================================
function initIframeModalBlurSync() {
  const iframes = document.querySelectorAll('iframe.embed-frame, iframe');

  iframes.forEach((iframe) => {
    const setupObserver = () => {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        if (!doc || !doc.body) return;

        const checkModalVisible = () => {
          const modals = doc.querySelectorAll('.modal-overlay, .modal, div[id*="modal"]');
          let isModalOpen = false;

          modals.forEach((modal) => {
            const style = iframe.contentWindow.getComputedStyle(modal);
            if (
              style.display !== 'none' &&
              style.visibility !== 'hidden' &&
              parseFloat(style.opacity) > 0
            ) {
              isModalOpen = true;
            }
          });

          document.body.classList.toggle('iframe-modal-open', isModalOpen);
        };

        const observer = new MutationObserver(checkModalVisible);
        observer.observe(doc.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['style', 'class']
        });

        checkModalVisible();
      } catch (err) {
        console.warn('Gagal memantau modal iframe:', err);
      }
    };

    iframe.addEventListener('load', setupObserver);
    if (iframe.contentDocument && iframe.contentDocument.readyState === 'complete') {
      setupObserver();
    }
  });
}

// Inisialisasi Aplikasi Saat Dokumen Siap
document.addEventListener('DOMContentLoaded', () => {
  loadMasterDashboardData();
  initIframeModalBlurSync();
});

// ==========================================================
// 9. EXPORT DATA MASTER POP KE EXCEL (.XLSX)
// ==========================================================
async function exportMasterExcel() {
  const btn = document.getElementById('btnExportMasterExcel');
  const originalHTML = btn ? btn.innerHTML : '';

  try {
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Mengunduh Excel...</span>';
    }

    const res = await fetchWithAuth('/api/export/master');
    if (!res) return; // Otomatis redirect ke login.html jika sesi 401

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Gagal mengunduh file Data Master Excel.');
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStamp = new Date().toISOString().slice(0, 10);

    a.href = url;
    a.download = `DATA_MASTER_POP_RJBT_${dateStamp}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Export Excel error:', err);
    alert('Terjadi kesalahan saat mengunduh Excel: ' + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHTML;
    }
  }
}