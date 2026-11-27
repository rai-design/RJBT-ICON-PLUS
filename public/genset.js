// genset.js - Modul Utama Database PM Genset RJBT
let allGensetData = [];
let currentPage = 1;
let rowsPerPage = 10;
let currentRenderedData = [];
let autoSaveDebounceTimer = null;

document.addEventListener('DOMContentLoaded', () => {
  const selectSelect = document.getElementById('rowsPerPageSelect');
  if (selectSelect) {
    selectSelect.value = String(rowsPerPage);
  }

  fetchGensetData();

  // Event Listener Perhitungan Health Index Otomatis
  const autoStartEl = document.getElementById('editAutoStart');
  const runningTestEl = document.getElementById('editRunningTest');
  const bahanBakarEl = document.getElementById('editBahanBakarStatus');

  if (autoStartEl) autoStartEl.addEventListener('change', () => { calculateHealthIndex(); autoSaveField(); });
  if (runningTestEl) runningTestEl.addEventListener('change', () => { calculateHealthIndex(); autoSaveField(); });
  if (bahanBakarEl) bahanBakarEl.addEventListener('change', () => { calculateHealthIndex(); autoSaveField(); });

  // Event Listener Auto-save seluruh input Form Edit Genset
  const formInputs = document.querySelectorAll('#editGensetForm input, #editGensetForm select, #editGensetForm textarea');
  formInputs.forEach(el => {
    if (el.id !== 'editPopId' && el.id !== 'editHealthIndex') {
      if (el.tagName === 'SELECT' || el.type === 'date' || el.type === 'number') {
        el.addEventListener('change', autoSaveField);
        el.addEventListener('blur', autoSaveField);
      } else {
        el.addEventListener('blur', autoSaveField);
      }
    }
  });
});

// 1. Fetch Data Genset dari Backend API
async function fetchGensetData() {
  const tbody = document.getElementById('gensetTableBody');
  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="10" style="text-align:center; padding: 24px; color: #64748b;">
        <i class="fa-solid fa-spinner fa-spin" style="margin-right: 8px;"></i> Memuat data genset dari database...
      </td>
    </tr>
  `;

  try {
    const res = await fetch('/api/genset');
    if (!res.ok) throw new Error('HTTP Error ' + res.status);
    
    const result = await res.json();
    allGensetData = result.data || [];
    
    updateKpi(allGensetData);
    filterData();
  } catch (err) {
    console.error('Fetch Genset Error:', err);
    tbody.innerHTML = `
      <tr>
        <td colspan="10" style="text-align:center; padding: 24px; color: #dc2626; font-weight:700;">
          Gagal terhubung ke backend server. Pastikan endpoint '/api/genset' sudah aktif di server.js.
        </td>
      </tr>
    `;
  }
}

// 2. Hitung & Update Summary KPI Cards
function updateKpi(data) {
  const total = data.length;

  const validData = data.filter(i => {
    const pop = i.pop_id || i.idPop || '';
    const loc = i.lokasi || '';
    return pop.trim() !== '' && pop !== '-' && loc.trim() !== '';
  });

  const normal = validData.filter(i => {
    const running = String(i.running_test || i.runningTest || i.statusAts || '').toUpperCase();
    return running.includes('NORMAL') || running === 'OK';
  }).length;
  
  const warning = validData.length - normal;
  
  const totalHi = validData.reduce((acc, i) => {
    const hiVal = i.health_index_genset !== undefined ? i.health_index_genset : (i.healthIndexGenset !== undefined ? i.healthIndexGenset : 100);
    const hi = hiVal !== null ? Number(hiVal) : 100;
    return acc + hi;
  }, 0);

  const avgHi = validData.length > 0 ? parseFloat((totalHi / validData.length).toFixed(1)) : 100;

  let hiColor = '#16a34a';
  if (avgHi <= 30) hiColor = '#dc2626';
  else if (avgHi <= 70) hiColor = '#d97706';

  const elTotal = document.getElementById('kpiTotalGenset');
  const elNormal = document.getElementById('kpiNormalCount');
  const elFault = document.getElementById('kpiFaultCount');
  const elSub = document.getElementById('kpiFaultSub');
  const elAvgHi = document.getElementById('kpiAvgHi');

  if (elTotal) elTotal.textContent = total;
  if (elNormal) elNormal.textContent = normal + ' Unit';
  if (elFault) elFault.textContent = warning + ' Unit';
  if (elSub) elSub.textContent = warning > 0 ? 'Perlu Perhatian' : 'Aman';
  
  if (elAvgHi) {
    elAvgHi.textContent = avgHi + '%';
    elAvgHi.style.color = hiColor;
  }
}

// Helper Badge Status & Health Index
function getStatusBadge(val) {
  if (!val || val === '-') return '<span class="badge-status badge-blue">-</span>';
  const text = String(val).toUpperCase().trim();
  if (text.includes('NORMAL') || text === 'OK') {
    return `<span class="badge-status badge-green">NORMAL</span>`;
  }
  return `<span class="badge-status badge-red">${text}</span>`;
}

function getHealthBadge(val) {
  const hi = parseFloat(val) || 0;
  let color = '#16a34a';
  let bg = '#dcfce7';

  if (hi <= 30) {
    color = '#dc2626';
    bg = '#fee2e2';
  } else if (hi <= 70) {
    color = '#d97706';
    bg = '#fef3c7';
  }

  return `<span style="color: ${color}; font-weight: 800; background: ${bg}; padding: 2px 8px; border-radius: 4px;">${hi}%</span>`;
}

// 3. Paginasi Tabel
function changeRowsPerPage() {
  const select = document.getElementById('rowsPerPageSelect');
  if (select) {
    rowsPerPage = parseInt(select.value, 10) || 10;
    currentPage = 1;
    renderGensetTable(currentRenderedData);
  }
}

function goToPage(page) {
  currentPage = page;
  renderGensetTable(currentRenderedData);
}

function changePage(direction) {
  const totalPages = Math.ceil(currentRenderedData.length / rowsPerPage);
  currentPage += direction;
  if (currentPage < 1) currentPage = 1;
  if (currentPage > totalPages) currentPage = totalPages;
  renderGensetTable(currentRenderedData);
}

// 4. Render Tabel Genset (10 Kolom Ringkas)
function renderGensetTable(data) {
  currentRenderedData = data;
  const tbody = document.getElementById('gensetTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding: 20px; color: #64748b;">Data genset tidak ditemukan</td></tr>`;
    const tableInfo = document.getElementById('tableInfo');
    if (tableInfo) tableInfo.textContent = '0-0 dari 0 data';
    const container = document.getElementById('paginationContainer');
    if (container) container.innerHTML = '';
    return;
  }

  const totalPages = Math.ceil(data.length / rowsPerPage);
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;

  const startIdx = (currentPage - 1) * rowsPerPage;
  const endIdx = Math.min(startIdx + rowsPerPage, data.length);
  const paginatedData = data.slice(startIdx, endIdx);

  paginatedData.forEach((item, index) => {
    const globalIdx = allGensetData.indexOf(item);
    const displayNo = startIdx + index + 1;
    const tr = document.createElement('tr');
    
    const popId = item.pop_id || item.idPop || '-';
    const lokasi = item.lokasi || '-';
    const kategori = item.kategori || '-';
    const kotaKab = item.kota_kab || item.area || '-';
    const kp = item.kp || item.area || '-';
    const merk = item.merk_genset || item.merkGenset || '-';
    const kapasitas = item.kapasitas_genset || item.kapasitas || (item.kapKva ? `${item.kapKva} KVA` : '-');
    const healthIndex = item.health_index_genset !== undefined ? item.health_index_genset : (item.healthIndexGenset !== undefined ? item.healthIndexGenset : 100);

    tr.innerHTML = `
      <td class="sticky-col-1">${displayNo}</td>
      <td class="sticky-col-2" style="font-weight:700;">${popId}</td>
      <td style="font-weight: 600;">${lokasi}</td>
      <td>${kategori}</td>
      <td>${kotaKab}</td>
      <td><span class="badge-status badge-blue">${kp}</span></td>
      <td>${merk}</td>
      <td>${kapasitas}</td>
      <td>${getHealthBadge(healthIndex)}</td>
      <td style="text-align:center; white-space: nowrap;">
        <button type="button" onclick="openEditModal(${globalIdx})" class="btn-detail" title="Lihat & Edit Detail">Detail</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  const tableInfo = document.getElementById('tableInfo');
  if (tableInfo) tableInfo.textContent = `${startIdx + 1}-${endIdx} dari ${data.length} data`;
  renderPaginationButtons(totalPages);
}

// 5. Render Tombol Paginasi
function renderPaginationButtons(totalPages) {
  const container = document.getElementById('paginationContainer');
  if (!container) return;
  container.innerHTML = '';

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.innerHTML = '&laquo; Previous';
  prevBtn.className = 'btn-page';
  if (currentPage === 1) {
    prevBtn.disabled = true;
  } else {
    prevBtn.onclick = () => changePage(-1);
  }
  container.appendChild(prevBtn);

  let pages = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    if (currentPage <= 4) {
      pages = [1, 2, 3, 4, 5, '...', totalPages];
    } else if (currentPage >= totalPages - 3) {
      pages = [1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    } else {
      pages = [1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages];
    }
  }

  pages.forEach(p => {
    const pageBtn = document.createElement('button');
    pageBtn.type = 'button';
    pageBtn.textContent = p;
    pageBtn.className = `btn-page-num ${p === currentPage ? 'active' : ''}`;

    if (p === '...') {
      pageBtn.style.background = 'transparent';
      pageBtn.style.border = 'none';
      pageBtn.style.cursor = 'default';
    } else if (p !== currentPage) {
      pageBtn.onclick = () => goToPage(p);
    }
    container.appendChild(pageBtn);
  });

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.innerHTML = 'Next &raquo;';
  nextBtn.className = 'btn-page';
  if (currentPage === totalPages || totalPages === 0) {
    nextBtn.disabled = true;
  } else {
    nextBtn.onclick = () => changePage(1);
  }
  container.appendChild(nextBtn);
}

// 6. HELPER HIGHLIGHT KARTU KPI DINAMIS
function updateActiveKpiCard(statusType) {
  document.querySelectorAll('.kpi-card').forEach(card => {
    card.classList.remove('active-card');
  });

  const status = (statusType || '').toUpperCase().trim();
  let activeCardId = 'cardALL';

  if (status === 'NORMAL') {
    activeCardId = 'cardNORMAL';
  } else if (status === 'NOT OK' || status === 'FAULT') {
    activeCardId = 'cardFAULT';
  } else if (status === 'AVG') {
    activeCardId = 'cardAVG';
  }

  const activeCard = document.getElementById(activeCardId);
  if (activeCard) activeCard.classList.add('active-card');
}

// 7. Logika Filter & Search
function filterData() {
  currentPage = 1;

  const searchInput = document.getElementById('searchInput');
  const filterArea = document.getElementById('filterArea');
  const filterStatus = document.getElementById('filterStatus');

  const search = searchInput ? searchInput.value.toUpperCase().trim() : '';
  const area = filterArea ? filterArea.value.toUpperCase().trim() : '';
  const status = filterStatus ? filterStatus.value.toUpperCase().trim() : '';

  updateActiveKpiCard(status);

  const filtered = allGensetData.filter(item => {
    const pop = item.pop_id || item.idPop || '';
    const loc = item.lokasi || '';
    const merk = item.merk_genset || item.merkGenset || '';
    const kp = item.kp || item.area || '';
    const kota = item.kota_kab || '';
    const running = String(item.running_test || item.statusAmi || '').toUpperCase();

    const matchSearch = String(pop).toUpperCase().includes(search) || 
                        String(loc).toUpperCase().includes(search) ||
                        String(merk).toUpperCase().includes(search);
    
    const matchArea = area === '' || String(kp).toUpperCase().includes(area) || String(kota).toUpperCase().includes(area);
    const matchStatus = status === '' || running.includes(status);

    return matchSearch && matchArea && matchStatus;
  });

  renderGensetTable(filtered);
}

function filterByKpi(type) {
  const statusSelect = document.getElementById('filterStatus');
  if (!statusSelect) return;

  // Cek apakah kartu yang diklik saat ini sudah aktif
  const cardMap = {
    'ALL': 'cardALL',
    'AVG': 'cardAVG',
    'NORMAL': 'cardNORMAL',
    'NOT OK': 'cardFAULT',
    'FAULT': 'cardFAULT'
  };
  const clickedCard = document.getElementById(cardMap[type]);
  const isAlreadyActive = clickedCard && clickedCard.classList.contains('active-card');

  // Jika kartu yang sedang aktif diklik ulang (selain ALL), kembalikan ke ALL
  const targetType = (isAlreadyActive && type !== 'ALL') ? 'ALL' : type;

  if (targetType === 'ALL' || targetType === 'AVG') {
    statusSelect.value = '';
  } else {
    statusSelect.value = targetType;
  }

  filterData();

  if (targetType === 'AVG') {
    updateActiveKpiCard('AVG');
  }
}

// 8. Hitung Health Index Otomatis
function calculateHealthIndex() {
  const autoStart = (document.getElementById('editAutoStart')?.value || '').toUpperCase().trim();
  const runningTest = (document.getElementById('editRunningTest')?.value || '').toUpperCase().trim();
  const bahanBakar = (document.getElementById('editBahanBakarStatus')?.value || '').toUpperCase().trim();
  
  let normalCount = 0;
  if (autoStart.includes('NORMAL') || autoStart === 'OK') normalCount++;
  if (runningTest.includes('NORMAL') || runningTest === 'OK') normalCount++;
  if (bahanBakar.includes('NORMAL') || bahanBakar === 'OK') normalCount++;

  let score = 0;
  if (normalCount === 3) {
    score = 100;
  } else if (normalCount === 2) {
    score = 60;
  } else if (normalCount === 1) {
    score = 30;
  } else {
    score = 0;
  }
  
  const healthInput = document.getElementById('editHealthIndex');
  if (healthInput) {
    healthInput.value = score;
    healthInput.readOnly = true;
  }

  const badgeHi = document.getElementById('badgeHiModal');
  if (badgeHi) {
    const badgeState = score >= 80 ? 'hi-good' : (score >= 60 ? 'hi-warning' : 'hi-danger');
    badgeHi.classList.remove('hi-good', 'hi-warning', 'hi-danger');
    badgeHi.classList.add(badgeState);
    badgeHi.innerHTML = `<span class="badge-hi-label">HEALTH INDEX:</span><strong class="badge-hi-value">${score}%</strong>`;
  }
}

// Helper Format Tanggal
function parseDateOnly(val) {
  if (!val || val === '0000-00-00' || val === '-') return '';
  let str = String(val);
  if (str.includes('T')) {
    str = str.split('T')[0];
  }
  return str.substring(0, 10);
}

// 9. Modal Detail / Edit Lengkap
function openEditModal(idx) {
  const item = allGensetData[idx];
  if (!item) return;

  const popId = item.pop_id || item.idPop || '';
  const lokasi = item.lokasi || '';
  const kpKota = item.kota_kab || item.kp || item.area || '';
  const kategori = item.kategori || '-';
  const merk = item.merk_genset || item.merkGenset || '-';

  const labelEl = document.getElementById('editPopIdLabel');
  if (labelEl) labelEl.textContent = popId;

  const subEl = document.getElementById('editModalSub');
  if (subEl) subEl.textContent = `${lokasi} (${kpKota}) - Kategori: ${kategori} | Merk: ${merk}`;

  document.getElementById('editPopId').value = popId;
  document.getElementById('editLokasi').value = lokasi;
  document.getElementById('editKategori').value = item.kategori || '';
  document.getElementById('editKotaKab').value = item.kota_kab || item.area || '';
  document.getElementById('editKp').value = item.kp || item.area || '';
  document.getElementById('editTglInstalasi').value = parseDateOnly(item.tgl_instalasi);
  document.getElementById('editMerk').value = item.merk_genset || item.merkGenset || '';
  document.getElementById('editTipe').value = item.tipe_genset || item.model || '';
  document.getElementById('editSn').value = item.sn_genset || '';
  document.getElementById('editKapasitas').value = item.kapasitas_genset || item.kapasitas || (item.kapKva ? `${item.kapKva} KVA` : '');
  document.getElementById('editJmlOli').value = item.jumlah_oli || '';
  document.getElementById('editJnsBbm').value = item.jenis_bbm || '';
  document.getElementById('editKapBbm').value = item.kapasitas_bbm || item.levelBBM || '';
  document.getElementById('editJnsAki').value = item.jenis_aki || '';
  document.getElementById('editSpesAki').value = item.spesifikasi_aki || '';
  document.getElementById('editKet').value = item.ket || item.catatanGenset || '';
  document.getElementById('editReal').value = parseDateOnly(item.real);
  document.getElementById('editFilterBbm').value = parseDateOnly(item.filter_bbm);
  document.getElementById('editFilterUdara').value = parseDateOnly(item.filter_udara);
  document.getElementById('editFilterOli').value = parseDateOnly(item.filter_oli);
  document.getElementById('editTanggalGantiAki').value = parseDateOnly(item.tanggal_ganti_aki);
  document.getElementById('editVoltaseAki').value = item.voltase_aki_v || item.teganganAki || '';
  document.getElementById('editHertz').value = item.hertz || '';
  document.getElementById('editBbmL').value = item.bbm_l !== null && item.bbm_l !== undefined ? item.bbm_l : '';
  document.getElementById('editAts').value = item.ats || item.statusAts || '';
  document.getElementById('editKrangkeng').value = item.krangkeng || '';
  document.getElementById('editHewanPengerat').value = item.tanda_tanda_hewan_pengerat || '';
  document.getElementById('editAutoStart').value = item.auto_start || 'NORMAL';
  document.getElementById('editRunningTest').value = item.running_test || 'NORMAL';
  document.getElementById('editBahanBakarStatus').value = item.bahan_bakar || 'NORMAL';
  
  const hiVal = item.health_index_genset !== undefined ? item.health_index_genset : (item.healthIndexGenset ?? 100);
  document.getElementById('editHealthIndex').value = hiVal;

  calculateHealthIndex();

  document.getElementById('editTemuan').value = item.temuan || item.catatanGenset || '';
  document.getElementById('editStatusTemuan').value = item.status_temuan || '';
  
  document.getElementById('editSemester1').value = parseDateOnly(item.semester_1 || item.semester1);
  document.getElementById('editSemester2').value = parseDateOnly(item.semester_2 || item.semester2);

  const editModal = document.getElementById('editModal');
  if (editModal) editModal.classList.remove('hidden');
}

function closeEditModal() {
  const editModal = document.getElementById('editModal');
  if (editModal) editModal.classList.add('hidden');
}

// 10. Auto-Save ke Backend API
async function autoSaveField() {
  const popId = document.getElementById('editPopId').value;
  if (!popId) return;

  clearTimeout(autoSaveDebounceTimer);
  autoSaveDebounceTimer = setTimeout(async () => {
    const payload = {
      lokasi: document.getElementById('editLokasi').value,
      kategori: document.getElementById('editKategori').value,
      kota_kab: document.getElementById('editKotaKab').value,
      kp: document.getElementById('editKp').value,
      tgl_instalasi: document.getElementById('editTglInstalasi').value || null,
      merk_genset: document.getElementById('editMerk').value,
      tipe_genset: document.getElementById('editTipe').value,
      sn_genset: document.getElementById('editSn').value,
      kapasitas_genset: document.getElementById('editKapasitas').value,
      jumlah_oli: document.getElementById('editJmlOli').value,
      jenis_bbm: document.getElementById('editJnsBbm').value,
      kapasitas_bbm: document.getElementById('editKapBbm').value,
      jenis_aki: document.getElementById('editJnsAki').value,
      spesifikasi_aki: document.getElementById('editSpesAki').value,
      ket: document.getElementById('editKet').value,
      real: document.getElementById('editReal').value || null,
      filter_bbm: document.getElementById('editFilterBbm').value || null,
      filter_udara: document.getElementById('editFilterUdara').value || null,
      filter_oli: document.getElementById('editFilterOli').value || null,
      tanggal_ganti_aki: document.getElementById('editTanggalGantiAki').value || null,
      voltase_aki_v: document.getElementById('editVoltaseAki').value,
      hertz: document.getElementById('editHertz').value,
      bbm_l: document.getElementById('editBbmL').value ? parseInt(document.getElementById('editBbmL').value, 10) : null,
      ats: document.getElementById('editAts').value,
      krangkeng: document.getElementById('editKrangkeng').value,
      tanda_tanda_hewan_pengerat: document.getElementById('editHewanPengerat').value,
      auto_start: document.getElementById('editAutoStart').value,
      running_test: document.getElementById('editRunningTest').value,
      bahan_bakar: document.getElementById('editBahanBakarStatus').value,
      health_index_genset: parseFloat(document.getElementById('editHealthIndex').value) || 100,
      temuan: document.getElementById('editTemuan').value,
      status_temuan: document.getElementById('editStatusTemuan').value,
      semester_1: document.getElementById('editSemester1').value || null,
      semester_2: document.getElementById('editSemester2').value || null
    };

    try {
      const res = await fetch(`/api/genset/${encodeURIComponent(popId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const idx = allGensetData.findIndex(i => (i.pop_id || i.idPop) === popId);
        if (idx !== -1) {
          Object.assign(allGensetData[idx], payload);
          updateKpi(allGensetData);
          filterData();
        }
      }
    } catch (err) {
      console.error('Auto-Save Error:', err);
    }
  }, 300);
}