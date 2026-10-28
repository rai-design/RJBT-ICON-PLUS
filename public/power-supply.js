let allPowerSupplyData = [];
let filteredPowerSupplyData = [];
let currentPage = 1;
let rowsPerPage = 10;
let selectedIndex = null;
let saveDebounceTimer = null;

// Status Filter KPI Card Aktif ('ALL', 'HI_WARNING', 'BELUM_N1', 'KURANG_8JAM')
let activeCardFilter = 'ALL';

document.addEventListener('DOMContentLoaded', () => {
  fetchPowerSupplyData();
});

// Helper Pengelompokan Data Rectifier 1 & Rectifier 2 yang Presisi
function groupPowerSupplyData(rawData) {
  // 1. Filter baris kosong/invalid
  const cleanData = rawData.filter(
    item => item.idPop && String(item.idPop).trim() !== '' && String(item.idPop).trim() !== '-'
  );

  const map = new Map();

  cleanData.forEach(item => {
    const idPop = String(item.idPop).trim();
    
    // Regex fleksibel mencakup: rect2, recti2, (rect2), (recti2), {rect2}, rect 2, dsb.
    const isRect2 = /recti?\s*2/i.test(item.lokasi);
    const cleanLokasi = String(item.lokasi).replace(/\s*[\{\(\[]?\s*recti?\s*2\s*[\}\)\]]?/gi, '').trim();

    if (!map.has(idPop)) {
      if (isRect2) {
        map.set(idPop, {
          ...item,
          idPop: idPop,
          lokasi: cleanLokasi,
          rect2: item
        });
      } else {
        map.set(idPop, {
          ...item,
          lokasi: cleanLokasi,
          rect2: null
        });
      }
    } else {
      const currentSite = map.get(idPop);
      if (isRect2) {
        // Simpan data ke Rectifier 2
        currentSite.rect2 = item;
      } else {
        // Jika Rectifier 1 baru dibaca belakangan, perbarui data utama dengan Rectifier 1
        const existingRect2 = currentSite.rect2;
        Object.assign(currentSite, item);
        currentSite.lokasi = cleanLokasi;
        currentSite.rect2 = existingRect2;
      }
    }
  });

  return Array.from(map.values());
}

// 1. Fetch Data dari Express Server Backend (/api/power-supply)
async function fetchPowerSupplyData() {
  const tbody = document.getElementById('tableBody');
  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="8" style="text-align: center; padding: 20px; color: #64748b;">
        Memuat data PM Power Supply...
      </td>
    </tr>
  `;

  try {
    const response = await fetch('/api/power-supply');
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    
    const result = await response.json();
    const rawData = result.data || [];
    
    // Kelompokkan data berdasarkan ID POP
    allPowerSupplyData = groupPowerSupplyData(rawData);

    activeCardFilter = 'ALL';
    
    // Highlight Card ALL secara default di awal
    document.querySelectorAll('.kpi-card-clickable').forEach(card => card.classList.remove('active-card'));
    const cardAllElem = document.getElementById('cardALL');
    if (cardAllElem) cardAllElem.classList.add('active-card');

    updateKpiCards(allPowerSupplyData);
    filterData(); // Jalankan filter awal & render tabel
  } catch (error) {
    console.error('Error fetching power supply data:', error);
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 20px; color: #dc2626; font-weight: 700;">
          Gagal terhubung ke server. Pastikan 'node server.js' sudah berjalan.
        </td>
      </tr>
    `;
  }
}

// 2. Hitung & Update KPI Summary Cards
function updateKpiCards(data) {
  const totalSite = data.length;
  
  const totalHi = data.reduce((acc, item) => acc + (parseFloat(item.healthIndexPowerSupply) || 100), 0);
  const avgHi = totalSite > 0 ? (totalHi / totalSite).toFixed(1) : '100';

  const nPlus1Count = data.filter(i => String(i.statusModulRecti1).toLowerCase().includes('n+1')).length;
  const belumN1Count = data.filter(i => String(i.statusModulRecti1).toLowerCase().includes('belum n+1')).length;

  const diatas8Jam = data.filter(i => String(i.statusKemampuan).toUpperCase().includes('DIATAS 8JAM')).length;
  const kurang8Jam = data.filter(i => String(i.statusKemampuan).toUpperCase().includes('KURANG 8JAM')).length;

  const kpiTotal = document.getElementById('kpiTotalSite');
  const kpiAvgHi = document.getElementById('kpiAvgHi');
  const kpiN1 = document.getElementById('kpiN1Count');
  const kpiBelumN1 = document.getElementById('kpiBelumN1Sub');
  const kpiDiatas8 = document.getElementById('kpiBackup8Jam');
  const kpiKurang8 = document.getElementById('kpiKurang8JamSub');

  if (kpiTotal) kpiTotal.innerText = totalSite;
  if (kpiAvgHi) kpiAvgHi.innerText = avgHi + '%';
  if (kpiN1) kpiN1.innerText = `${nPlus1Count} Site`;
  if (kpiBelumN1) kpiBelumN1.innerText = `${belumN1Count} Site Belum N+1`;
  if (kpiDiatas8) kpiDiatas8.innerText = `${diatas8Jam} Site`;
  if (kpiKurang8) kpiKurang8.innerText = `${kurang8Jam} Site Kurang 8 Jam`;
}

// 3. Handler Klik Card KPI untuk Filter Otomatis
function filterByCard(filterType) {
  if (activeCardFilter === filterType && filterType !== 'ALL') {
    activeCardFilter = 'ALL';
  } else {
    activeCardFilter = filterType;
  }

  // Hapus highlight dari seluruh card
  document.querySelectorAll('.kpi-card-clickable').forEach(card => {
    card.classList.remove('active-card');
  });

  // Tambahkan highlight ke card yang aktif (termasuk cardALL)
  const activeElem = document.getElementById(`card${activeCardFilter}`);
  if (activeElem) {
    activeElem.classList.add('active-card');
  }

  filterData();
}

// 4. Render Tabel Utama dengan Paginasi Bersih
function renderTable() {
  const tbody = document.getElementById('tableBody');
  if (!tbody) return;

  tbody.innerHTML = '';
  const total = filteredPowerSupplyData.length;

  if (total === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 20px; color: #64748b;">
          Data Power Supply tidak ditemukan.
        </td>
      </tr>
    `;
    renderPagination(0);
    return;
  }

  const totalPages = Math.ceil(total / rowsPerPage);
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;

  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = Math.min(startIndex + rowsPerPage, total);
  const pageData = filteredPowerSupplyData.slice(startIndex, endIndex);

  pageData.forEach((item, pageIdx) => {
    const tr = document.createElement('tr');
    const hiValue = parseFloat(item.healthIndexPowerSupply) || 100;
    const hiColor = hiValue >= 90 ? '#16a34a' : (hiValue >= 70 ? '#d97706' : '#dc2626');

    const originalIndex = allPowerSupplyData.findIndex(i => i.idPop === item.idPop);

    tr.innerHTML = `
      <td class="sticky-col-1">${startIndex + pageIdx + 1}</td>
      <td class="sticky-col-2" style="font-weight: 700;">${item.idPop}</td>
      <td>${item.lokasi}</td>
      <td><span class="badge-status badge-blue">${item.area || item.kp || '-'}</span></td>
      <td>${item.kategori || '-'}</td>
      <td>${item.model || '-'}</td>
      <td style="font-weight: 800; color: ${hiColor};">${hiValue}%</td>
      <td style="text-align: center;">
        <button onclick="openModal(${originalIndex !== -1 ? originalIndex : 0})" class="btn-detail">Detail</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  renderPagination(total);
}

// 5. Render Kontrol Paginasi Ringkas & Konsisten
function renderPagination(total) {
  const pageRangeInfo = document.getElementById('pageRangeInfo');
  const btnPrev = document.getElementById('btnPrevPage');
  const btnNext = document.getElementById('btnNextPage');
  const pageNumbers = document.getElementById('pageNumbers');

  if (total === 0) {
    if (pageRangeInfo) pageRangeInfo.textContent = '0 - 0 dari 0 data';
    if (btnPrev) btnPrev.disabled = true;
    if (btnNext) btnNext.disabled = true;
    if (pageNumbers) pageNumbers.innerHTML = '';
    return;
  }

  const totalPages = Math.ceil(total / rowsPerPage);
  const startRow = (currentPage - 1) * rowsPerPage + 1;
  const endRow = Math.min(currentPage * rowsPerPage, total);

  if (pageRangeInfo) {
    pageRangeInfo.textContent = `${startRow} - ${endRow} dari ${total} data`;
  }

  if (btnPrev) btnPrev.disabled = currentPage === 1;
  if (btnNext) btnNext.disabled = currentPage === totalPages;

  if (pageNumbers) {
    pageNumbers.innerHTML = '';

    let startPage = Math.max(1, currentPage - 1);
    let endPage = Math.min(totalPages, currentPage + 1);

    if (currentPage === 1) endPage = Math.min(totalPages, 3);
    if (currentPage === totalPages) startPage = Math.max(1, totalPages - 2);

    if (startPage > 1) {
      const btn1 = document.createElement('button');
      btn1.className = 'btn-page-num';
      btn1.textContent = '1';
      btn1.onclick = () => goToPage(1);
      pageNumbers.appendChild(btn1);

      if (startPage > 2) {
        const dots = document.createElement('span');
        dots.textContent = '...';
        dots.style.padding = '0 4px';
        dots.style.color = '#94a3b8';
        pageNumbers.appendChild(dots);
      }
    }

    for (let i = startPage; i <= endPage; i++) {
      const btn = document.createElement('button');
      btn.className = `btn-page-num ${i === currentPage ? 'active' : ''}`;
      btn.textContent = i;
      btn.onclick = () => goToPage(i);
      pageNumbers.appendChild(btn);
    }

    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {
        const dots = document.createElement('span');
        dots.textContent = '...';
        dots.style.padding = '0 4px';
        dots.style.color = '#94a3b8';
        pageNumbers.appendChild(dots);
      }
      const btnLast = document.createElement('button');
      btnLast.className = 'btn-page-num';
      btnLast.textContent = totalPages;
      btnLast.onclick = () => goToPage(totalPages);
      pageNumbers.appendChild(btnLast);
    }
  }
}

function prevPage() {
  if (currentPage > 1) {
    currentPage--;
    renderTable();
  }
}

function nextPage() {
  const totalPages = Math.ceil(filteredPowerSupplyData.length / rowsPerPage);
  if (currentPage < totalPages) {
    currentPage++;
    renderTable();
  }
}

function goToPage(page) {
  currentPage = page;
  renderTable();
}

function changeRowsPerPage(val) {
  rowsPerPage = parseInt(val, 10) || 10;
  currentPage = 1;
  renderTable();
}

// 6. Filter Data Interaktif (Pancarian, Regional KP, & KPI Card)
function filterData(resetPage = true) {
  const searchInput = document.getElementById('searchInput');
  const filterKp = document.getElementById('filterKp');

  const search = searchInput ? searchInput.value.trim().toUpperCase() : '';
  const kp = filterKp ? filterKp.value.trim().toUpperCase() : 'ALL';

  filteredPowerSupplyData = allPowerSupplyData.filter(item => {
    // 1. Match Search (ID POP, Lokasi, Model, Merk Rectifier)
    const matchSearch = String(item.idPop || '').toUpperCase().includes(search) ||
                        String(item.lokasi || '').toUpperCase().includes(search) ||
                        String(item.model || '').toUpperCase().includes(search) ||
                        String(item.rectifierBrand1 || '').toUpperCase().includes(search);

    // 2. Match Regional KP
    const itemKp = String(item.kp || item.area || '').toUpperCase();
    const matchKp = (kp === 'ALL' || kp === '') || itemKp.includes(kp);

    // 3. Match KPI Card Click Filter
    let matchCard = true;
    if (activeCardFilter === 'BELUM_N1') {
      matchCard = String(item.statusModulRecti1 || '').toLowerCase().includes('belum n+1');
    } else if (activeCardFilter === 'KURANG_8JAM') {
      matchCard = String(item.statusKemampuan || '').toUpperCase().includes('KURANG 8JAM');
    } else if (activeCardFilter === 'HI_WARNING') {
      matchCard = (parseFloat(item.healthIndexPowerSupply) || 100) < 100;
    }

    return matchSearch && matchKp && matchCard;
  });

  if (resetPage) {
    currentPage = 1;
  }

  renderTable();
}

// Alias agar kompatibel jika di HTML dipanggil applyFilters()
function applyFilters() {
  filterData(true);
}

// Helper: Menyesuaikan Pengisian Nilai (SELECT / INPUT / DATE)
function setValue(id, val) {
  const el = document.getElementById(id);
  if (!el) return;
  
  const cleanVal = (val !== null && val !== undefined && String(val).trim() !== '' && String(val) !== '-') ? String(val).trim() : '';

  if (el.tagName === 'SELECT') {
    let exists = Array.from(el.options).some(opt => opt.value === cleanVal);
    if (!exists && cleanVal !== '') {
      const newOpt = document.createElement('option');
      newOpt.value = cleanVal;
      newOpt.textContent = cleanVal;
      el.appendChild(newOpt);
    }
    el.value = cleanVal;
  } else if (el.type === 'date') {
    el.value = formatDateForInput(cleanVal);
  } else {
    el.value = cleanVal;
  }
}

function formatDateForInput(dateStr) {
  if (!dateStr || dateStr === '-') return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toISOString().split('T')[0];
}

// Helper Hitung Otomatis Health Index Berdasarkan Bobot Parameter Site
function calculateHealthIndex() {
  const pln = document.getElementById('mTeganganPln')?.value.toUpperCase() || '';
  const fisik = document.getElementById('mKondisiFisik')?.value.toUpperCase() || '';
  const batt = document.getElementById('mTeganganBattery')?.value.toUpperCase() || '';
  const alarm = document.getElementById('mExternalAlarm')?.value.toUpperCase() || '';

  let score = 100;

  if (alarm === 'NOT OK') score -= 15;
  if (batt === 'NOT OK') score -= 25;
  if (fisik === 'NOT OK') score -= 25;
  if (pln === 'NOT OK' || pln === 'DROP') score -= 35;

  if (score < 0) score = 0;

  const inputHi = document.getElementById('mHealthIndexPs');
  if (inputHi) {
    inputHi.value = score;
  }

  return score;
}

// 7. Buka Modal Detail
function openModal(index) {
  selectedIndex = index;
  const item = allPowerSupplyData[index];
  if (!item) return;

  const setElemTxt = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val || '-';
  };

  setElemTxt('mPopId', item.idPop);
  setElemTxt('mLokasi', `${item.lokasi} (${item.area || item.kp || '-'}) - Kategori: ${item.kategori || '-'} | Model: ${item.model || '-'}`);

  const autoStatus = document.getElementById('autoSaveStatus');
  if (autoStatus) autoStatus.textContent = '';

  // 1. Rectifier 1
  setValue('mRectiBrand1', item.rectifierBrand1);
  setValue('mKapTotalRecti1', item.kapTotalModulRecti1);
  setValue('mTipeModulRecti1', item.tipeModulRecti1);
  setValue('mStatusModulRecti1', item.statusModulRecti1);
  setValue('mModulRecti1Unit', item.modulRecti1Unit);
  setValue('mBebanRectiA', item.bebanRectiA);
  setValue('mKapTiapModul1', item.kapTiapModulRecti1);

  // 2. Rectifier 2
  const r2 = item.rect2 || {};
  setValue('mRectiBrand2', r2.rectifierBrand1 || '');
  setValue('mKapTotalRecti2', r2.kapTotalModulRecti1 || '');
  setValue('mTipeModulRecti2', r2.tipeModulRecti1 || '');
  setValue('mStatusModulRecti2', r2.statusModulRecti1 || '');
  setValue('mModulRecti2Unit', r2.modulRecti1Unit || '');
  setValue('mBebanRectiA2', r2.bebanRectiA || '');
  setValue('mKapTiapModul2', r2.kapTiapModulRecti1 || '');

  // 3. Baterai
  setValue('mMerkBatt', item.merkBatt);
  setValue('mJmlBatt', item.jmlBatt);
  setValue('mTipeBatt', item.tipeBatt);
  setValue('mKapBattAh', item.kapBattAh);
  setValue('mJenisBatt', item.jenisBatt);
  setValue('mKemampuanJam', item.kemampuanJam);
  setValue('mStatusUmurBatt', item.statusUmurBatt);
  setValue('mStatusKemampuan', item.statusKemampuan);

  // 4. Maintenance & Evaluasi
  setValue('mInsertDate', item.insertDate);
  setValue('mPrioritasBatt', item.prioritasBatt);
  setValue('mButuhRecti', item.butuhRecti);
  setValue('mStatusMaster', item.status);
  setValue('mButuhPlusBattAh', item.butuhBattAh);

  // 5. Dummy Load
  setValue('mButuhDummy2025', item.butuhDummy2025);
  setValue('mDoneDummy', item.doneDummy);
  setValue('mLastDummy', item.lastDummy);
  setValue('mJumlahBattBank', item.jumlahBattBank);
  setValue('mTanggalDummy2025', item.tanggalDummy2025);
  setValue('mKapBattAfterDummy', item.kapBattAfterDummyAh);

  // 6. Tegangan, Kondisi Fisik & Alarm
  setValue('mTeganganPln', item.teganganPln);
  setValue('mKondisiFisik', item.kondisiFisikBatteryRecti);
  setValue('mTeganganBattery', item.teganganBattery);
  setValue('mExternalAlarm', item.externalAlarm);

  calculateHealthIndex();

  const detailModal = document.getElementById('detailModal');
  if (detailModal) detailModal.classList.remove('hidden');
}

function closeDetailModal() {
  const detailModal = document.getElementById('detailModal');
  if (detailModal) detailModal.classList.add('hidden');
}

// 8. AUTO-SAVE LANGSUNG SAAT ELEMEN DIUBAH
function autoSaveData() {
  if (selectedIndex === null) return;

  calculateHealthIndex();

  const autoStatus = document.getElementById('autoSaveStatus');
  if (autoStatus) {
    autoStatus.style.color = '#d97706';
    autoStatus.textContent = '🔄 Menyimpan...';
  }

  clearTimeout(saveDebounceTimer);
  saveDebounceTimer = setTimeout(async () => {
    const currentItem = allPowerSupplyData[selectedIndex];
    const idPop = currentItem.idPop;

    const getVal = id => {
      const el = document.getElementById(id);
      return el ? el.value : '';
    };

    const payload = {
      rectifierBrand1: getVal('mRectiBrand1'),
      kapTotalModulRecti1: getVal('mKapTotalRecti1'),
      tipeModulRecti1: getVal('mTipeModulRecti1'),
      statusModulRecti1: getVal('mStatusModulRecti1'),
      modulRecti1Unit: getVal('mModulRecti1Unit'),
      bebanRectiA: getVal('mBebanRectiA'),
      kapTiapModulRecti1: getVal('mKapTiapModul1'),
      merkBatt: getVal('mMerkBatt'),
      jmlBatt: getVal('mJmlBatt'),
      tipeBatt: getVal('mTipeBatt'),
      kapBattAh: getVal('mKapBattAh'),
      jenisBatt: getVal('mJenisBatt'),
      kemampuanJam: getVal('mKemampuanJam'),
      statusUmurBatt: getVal('mStatusUmurBatt'),
      statusKemampuan: getVal('mStatusKemampuan'),
      insertDate: getVal('mInsertDate'),
      prioritasBatt: getVal('mPrioritasBatt'),
      butuhRecti: getVal('mButuhRecti'),
      status: getVal('mStatusMaster'),
      butuhBattAh: getVal('mButuhPlusBattAh'),
      healthIndexPowerSupply: getVal('mHealthIndexPs'),
      butuhDummy2025: getVal('mButuhDummy2025'),
      doneDummy: getVal('mDoneDummy'),
      lastDummy: getVal('mLastDummy'),
      jumlahBattBank: getVal('mJumlahBattBank'),
      tanggalDummy2025: getVal('mTanggalDummy2025'),
      kapBattAfterDummyAh: getVal('mKapBattAfterDummy'),
      teganganPln: getVal('mTeganganPln'),
      kondisiFisikBatteryRecti: getVal('mKondisiFisik'),
      teganganBattery: getVal('mTeganganBattery'),
      externalAlarm: getVal('mExternalAlarm')
    };

    try {
      const response = await fetch(`/api/power-supply/${encodeURIComponent(idPop)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) throw new Error('Gagal memperbarui data.');

      Object.assign(allPowerSupplyData[selectedIndex], payload);

      if (autoStatus) {
        autoStatus.style.color = '#16a34a';
        autoStatus.textContent = 'Perubahan tersimpan!';
      }

      updateKpiCards(allPowerSupplyData);
      filterData(false);
    } catch (err) {
      console.error('Error auto-saving data:', err);
      if (autoStatus) {
        autoStatus.style.color = '#dc2626';
        autoStatus.textContent = '❌ Gagal menyimpan perubahan.';
      }
    }
  }, 300);
}