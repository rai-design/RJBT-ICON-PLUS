// ac.js - Modul utama database PM AC RJBT
let allAcData = [];
let currentPage = 1;
let rowsPerPage = 10; // Default 10 data per halaman (sama dengan Power Supply & Genset)
let currentRenderedData = [];

// Fungsi untuk menambahkan bulan ke objek Date atau string tanggal secara akurat
function addMonthsToDate(dateInput, months) {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  
  d.setMonth(d.getMonth() + months);
  
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

document.addEventListener('DOMContentLoaded', () => {
  const rowsSelect = document.getElementById('rowsPerPageSelect');
  if (rowsSelect) {
    rowsPerPage = parseInt(rowsSelect.value, 10) || 10;
  }

  fetchAcData();

  // Event listener untuk mendeteksi perubahan dropdown secara real-time
  const suhuEl = document.getElementById('editSuhu');
  const kondisiEl = document.getElementById('editKondisi');
  const prevEl = document.getElementById('editPreventive');

  if (suhuEl) suhuEl.addEventListener('change', () => { calculateHealthIndex(); autoSaveField(); });
  if (kondisiEl) kondisiEl.addEventListener('change', () => { calculateHealthIndex(); autoSaveField(); });
  if (prevEl) prevEl.addEventListener('change', () => { calculateHealthIndex(); autoSaveField(); });

  // Otomatisasi Tanggal PM #1 -> PM #2, #3, #4 (Interval 3 Bulan)
  const tglPm1El = document.getElementById('editTglPm1');
  if (tglPm1El) {
    tglPm1El.addEventListener('input', handlePm1Change);
    tglPm1El.addEventListener('change', handlePm1Change);
    tglPm1El.addEventListener('blur', handlePm1Change);
  }

  // Daftarkan event auto-save ke seluruh input form edit
  const formInputs = document.querySelectorAll('#editForm input, #editForm select, #editForm textarea');
  formInputs.forEach(el => {
    if (el.id !== 'editHealth') {
      if (el.tagName === 'SELECT' || el.type === 'date' || el.type === 'number') {
        el.addEventListener('change', autoSaveField);
        el.addEventListener('blur', autoSaveField);
      } else {
        el.addEventListener('blur', autoSaveField);
      }
    }
  });
});

function handlePm1Change(e) {
  const val1 = e.target.value;
  if (!val1) return;

  let d1 = new Date(val1);
  if (isNaN(d1.getTime()) && val1.includes('/')) {
    const parts = val1.split('/');
    if (parts.length === 3) {
      d1 = new Date(`${parts[2].trim()}-${parts[1].trim()}-${parts[0].trim()}`);
    }
  }

  if (!isNaN(d1.getTime())) {
    const tgl2 = addMonthsToDate(d1, 3);
    const tgl3 = addMonthsToDate(d1, 6);
    const tgl4 = addMonthsToDate(d1, 9);

    const el2 = document.getElementById('editTglPm2');
    const el3 = document.getElementById('editTglPm3');
    const el4 = document.getElementById('editTglPm4');

    if (el2) { 
      el2.value = tgl2; 
      if (el2._flatpickr) el2._flatpickr.setDate(tgl2, true);
      el2.dispatchEvent(new Event('input', { bubbles: true }));
      el2.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (el3) { 
      el3.value = tgl3; 
      if (el3._flatpickr) el3._flatpickr.setDate(tgl3, true);
      el3.dispatchEvent(new Event('input', { bubbles: true }));
      el3.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (el4) { 
      el4.value = tgl4; 
      if (el4._flatpickr) el4._flatpickr.setDate(tgl4, true);
      el4.dispatchEvent(new Event('input', { bubbles: true }));
      el4.dispatchEvent(new Event('change', { bubbles: true }));
    }

    autoSaveField();
  }
}

// FUNGSI EXPORT EXCEL AC (MENGARAH KE BACKEND EXPRESS)
function exportAcToExcel() {
  window.open('/api/export/ac', '_blank');
}

async function fetchAcData() {
  const tbody = document.getElementById('tableBody');
  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="10" style="text-align:center; padding: 24px; color: #64748b;">
        Memuat data AC dari database...
      </td>
    </tr>
  `;

  try {
    const res = await fetch('/api/ac');
    if (!res.ok) throw new Error('HTTP Error ' + res.status);
    
    const result = await res.json();
    allAcData = result.data || [];
    
    updateKpi(allAcData);
    renderTable(allAcData);
  } catch (err) {
    console.error('Fetch Error:', err);
    tbody.innerHTML = `
      <tr>
        <td colspan="10" style="text-align:center; padding: 24px; color: #dc2626; font-weight:700;">
          Gagal terhubung ke backend server.js. Pastikan 'node server.js' sudah berjalan.
        </td>
      </tr>
    `;
  }
}

function getAcScore(suhuVal, kondisiVal, prevVal) {
  const s = String(suhuVal || '').toUpperCase();
  const k = String(kondisiVal || '').toUpperCase();
  const p = String(prevVal || '').toUpperCase();
  
  let normalCount = 0;
  if (s.includes('NORMAL')) normalCount++;
  if (k.includes('NORMAL')) normalCount++;
  if (p.includes('NORMAL')) normalCount++;

  if (normalCount === 3) return 100;
  if (normalCount === 2) return 60; 
  if (normalCount === 1) return 30; 
  return 0;                         
}

function updateKpi(data) {
  const total = data.length;

  const validData = data.filter(i => {
    const pop = i.id_pop || i.idPop || '';
    const loc = i.lokasi || '';
    return pop.trim() !== '' && pop !== '-' && loc.trim() !== '';
  });

  const normal = validData.filter(i => {
    const suhu = String(i.suhu_ruangan || i.suhuRuangan || '').toUpperCase();
    const kondisi = String(i.kondisi_ac || i.kondisiAc || '').toUpperCase();
    const preventive = String(i.preventive_maintenance || i.preventiveMaintenance || '').toUpperCase();
    return suhu.includes('NORMAL') && kondisi.includes('NORMAL') && preventive.includes('NORMAL');
  }).length;
  
  const warning = validData.length - normal;
  
  const totalHi = validData.reduce((acc, i) => {
    if (i.health_index_ac !== null && i.health_index_ac !== undefined && i.health_index_ac !== '') {
      return acc + Number(i.health_index_ac);
    }
    
    const sStr = String(i.suhu_ruangan || i.suhuRuangan || '').toUpperCase();
    const kStr = String(i.kondisi_ac || i.kondisiAc || '').toUpperCase();
    const pStr = String(i.preventive_maintenance || i.preventiveMaintenance || '').toUpperCase();
    
    return acc + getAcScore(sStr, kStr, pStr);
  }, 0);

  const avgHi = validData.length > 0 ? parseFloat((totalHi / validData.length).toFixed(1)) : 100;

  let hiColor = '#16a34a';
  if (avgHi <= 30) {
    hiColor = '#dc2626';
  } else if (avgHi <= 70) {
    hiColor = '#d97706';
  }

  document.getElementById('kpiTotalAc').textContent = total;
  document.getElementById('kpiNormalCount').textContent = normal + ' Unit';
  document.getElementById('kpiFaultCount').textContent = warning + ' Unit';
  document.getElementById('kpiFaultSub').textContent = warning > 0 ? 'Perlu Perhatian' : 'Aman';
  
  const avgHiElement = document.getElementById('kpiAvgHi');
  avgHiElement.textContent = avgHi + '%';
  avgHiElement.style.color = hiColor;
}

function getStatusBadge(val) {
  if (!val) return '';
  const text = String(val).toUpperCase().trim();
  if (text === 'NORMAL') {
    return `<span class="badge-status badge-green">NORMAL</span>`;
  } else if (text === 'NOT OK' || text === 'ABNORMAL' || text === 'UNNORMAL' || text.includes('NOT') || text.includes('ABN')) {
    return `<span class="badge-status badge-red">NOT OK</span>`;
  }
  return text;
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

function changeRowsPerPage() {
  const select = document.getElementById('rowsPerPageSelect');
  if (!select) return;

  rowsPerPage = parseInt(select.value, 10) || 10;
  currentPage = 1;
  renderTable(currentRenderedData);
}

function goToPage(page) {
  currentPage = page;
  renderTable(currentRenderedData);
}

function changePage(direction) {
  const totalPages = Math.ceil(currentRenderedData.length / rowsPerPage);
  currentPage += direction;
  if (currentPage < 1) currentPage = 1;
  if (currentPage > totalPages) currentPage = totalPages;
  renderTable(currentRenderedData);
}

// Render Tabel AC (Ringkas 10 Kolom)
function renderTable(data) {
  currentRenderedData = data;
  const tbody = document.getElementById('tableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding: 20px;">Data tidak ditemukan</td></tr>`;
    document.getElementById('tableInfo').textContent = '0-0 dari 0 data';
    const container = document.getElementById('paginationContainer');
    if (container) container.innerHTML = '';
    return;
  }

  const totalPages = Math.ceil(data.length / rowsPerPage);
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;

  const startIdx = (currentPage - 1) * rowsPerPage;
  const endIdx = startIdx + rowsPerPage;
  const paginatedData = data.slice(startIdx, endIdx);

  paginatedData.forEach((item, index) => {
    const globalIdx = allAcData.indexOf(item);
    const displayNo = startIdx + index + 1;
    const tr = document.createElement('tr');
    
    const idPop = item.id_pop || item.idPop || '';
    const lokasi = item.lokasi || '';
    const kategori = item.kategori || '';
    const model = item.model || '';
    const pemilik = item.pemilik || 'ICON+';
    const suhuRuangan = item.suhu_ruangan || item.suhuRuangan || 'NORMAL';
    const kondisiAc = item.kondisi_ac || item.kondisiAc || 'NORMAL';
    const preventiveMaint = item.preventive_maintenance || item.preventiveMaintenance || 'NORMAL';
    
    let healthIndex = 100;
    if (item.health_index_ac !== null && item.health_index_ac !== undefined && item.health_index_ac !== '') {
      healthIndex = item.health_index_ac;
    } else {
      healthIndex = getAcScore(suhuRuangan, kondisiAc, preventiveMaint);
    }

    const jadwalNextPm = item.jadwal_next_pm || item.jadwalNextPm || '-';
    const areaServpo = item.area_servpo || item.areaServpo || '';

    tr.innerHTML = `
      <td class="sticky-col-1">${displayNo}</td>
      <td class="sticky-col-2" style="font-weight:700;">${idPop}</td>
      <td>${lokasi}</td>
      <td>${kategori}</td>
      <td>${model}</td>
      <td>${pemilik}</td>
      <td>${getHealthBadge(healthIndex)}</td>
      <td style="font-weight: 600; color: #0284c7;">${jadwalNextPm}</td>
      <td><span class="badge-status badge-blue">${areaServpo}</span></td>
      <td style="text-align:center; white-space: nowrap;">
        <button onclick="openEditModal(${globalIdx})" class="btn-detail" title="Detail Data">
          Detail
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById('tableInfo').textContent = `${startIdx + 1}-${Math.min(endIdx, data.length)} dari ${data.length} data`;
  renderPaginationButtons(totalPages);
}

function renderPaginationButtons(totalPages) {
  const container = document.getElementById('paginationContainer');
  if (!container) return;

  container.innerHTML = '';
  container.style.gap = '6px';

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.innerHTML = '&laquo; Previous';
  prevBtn.className = 'btn-page';
  prevBtn.disabled = currentPage === 1 || totalPages === 0;
  if (!prevBtn.disabled) {
    prevBtn.onclick = () => changePage(-1);
  }
  container.appendChild(prevBtn);

  const pageNumbers = document.createElement('div');
  pageNumbers.className = 'page-numbers';

  if (totalPages > 0) {
    let startPage = Math.max(1, currentPage - 1);
    let endPage = Math.min(totalPages, currentPage + 1);

    if (currentPage === 1) endPage = Math.min(totalPages, 3);
    if (currentPage === totalPages) startPage = Math.max(1, totalPages - 2);

    if (startPage > 1) {
      const firstBtn = document.createElement('button');
      firstBtn.type = 'button';
      firstBtn.className = 'btn-page-num';
      firstBtn.textContent = '1';
      firstBtn.onclick = () => goToPage(1);
      pageNumbers.appendChild(firstBtn);

      if (startPage > 2) {
        const dots = document.createElement('span');
        dots.textContent = '...';
        dots.style.padding = '0 4px';
        dots.style.color = '#94a3b8';
        pageNumbers.appendChild(dots);
      }
    }

    for (let page = startPage; page <= endPage; page++) {
      const pageBtn = document.createElement('button');
      pageBtn.type = 'button';
      pageBtn.className = `btn-page-num ${page === currentPage ? 'active' : ''}`;
      pageBtn.textContent = page;
      pageBtn.onclick = () => goToPage(page);
      pageNumbers.appendChild(pageBtn);
    }

    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {
        const dots = document.createElement('span');
        dots.textContent = '...';
        dots.style.padding = '0 4px';
        dots.style.color = '#94a3b8';
        pageNumbers.appendChild(dots);
      }

      const lastBtn = document.createElement('button');
      lastBtn.type = 'button';
      lastBtn.className = 'btn-page-num';
      lastBtn.textContent = totalPages;
      lastBtn.onclick = () => goToPage(totalPages);
      pageNumbers.appendChild(lastBtn);
    }
  }

  container.appendChild(pageNumbers);

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.innerHTML = 'Next &raquo;';
  nextBtn.className = 'btn-page';
  nextBtn.disabled = currentPage === totalPages || totalPages === 0;
  if (!nextBtn.disabled) {
    nextBtn.onclick = () => changePage(-1);
  }
  container.appendChild(nextBtn);
}

function filterData() {
  currentPage = 1;

  const search = document.getElementById('searchInput').value.toUpperCase();
  const area = document.getElementById('filterArea').value.toUpperCase();
  const startDate = document.getElementById('filterStartDate').value;
  const endDate = document.getElementById('filterEndDate').value;
  const param = document.getElementById('filterParam').value;
  const status = document.getElementById('filterStatus').value.toUpperCase();

  const filtered = allAcData.filter(item => {
    const pop = item.id_pop || item.idPop || '';
    const loc = item.lokasi || '';
    const srv = item.area_servpo || item.areaServpo || '';
    const nextPmVal = item.jadwal_next_pm || item.jadwalNextPm || '';
    
    const suhu = String(item.suhu_ruangan || item.suhuRuangan || '').toUpperCase();
    const kondisi = String(item.kondisi_ac || item.kondisiAc || '').toUpperCase();
    const preventive = String(item.preventive_maintenance || item.preventiveMaintenance || '').toUpperCase();

    const matchSearch = String(pop).toUpperCase().includes(search) || 
                        String(loc).toUpperCase().includes(search) ||
                        String(srv).toUpperCase().includes(search);
    
    const matchArea = area === '' || String(srv).toUpperCase() === area;

    let matchDateRange = true;
    if (startDate || endDate) {
      if (!nextPmVal) {
        matchDateRange = false;
      } else {
        const itemDate = new Date(nextPmVal).toISOString().split('T')[0];
        if (startDate && itemDate < startDate) matchDateRange = false;
        if (endDate && itemDate > endDate) matchDateRange = false;
      }
    }

    let matchParamStatus = true;
    if (param !== '' && status !== '') {
      if (param === 'suhu') {
        matchParamStatus = suhu.includes(status);
      } else if (param === 'kondisi') {
        matchParamStatus = kondisi.includes(status);
      } else if (param === 'preventive') {
        matchParamStatus = preventive.includes(status);
      }
    } else if (status !== '') {
      matchParamStatus = suhu.includes(status) || kondisi.includes(status) || preventive.includes(status);
    } else if (param !== '' && status === '') {
      matchParamStatus = true;
    }

    return matchSearch && matchArea && matchDateRange && matchParamStatus;
  });

  renderTable(filtered);
}

function filterAcByKpi(type) {
  const statusSelect = document.getElementById('filterStatus');
  const paramSelect = document.getElementById('filterParam');
  if (!statusSelect || !paramSelect) return;

  // Jika kartu yang sedang aktif diklik ulang (selain ALL), kembalikan ke ALL
  const targetType = (statusSelect.value.toUpperCase() === type && type !== 'ALL') ? 'ALL' : type;

  document.querySelectorAll('.kpi-card').forEach(card => {
    card.classList.remove('active-card');
  });

  if (targetType === 'ALL') {
    paramSelect.value = '';
    statusSelect.value = '';
    const cardAll = document.getElementById('cardALL');
    if (cardAll) cardAll.classList.add('active-card');
  } else if (targetType === 'NORMAL') {
    paramSelect.value = '';
    statusSelect.value = 'NORMAL';
    const cardNormal = document.getElementById('cardNORMAL');
    if (cardNormal) cardNormal.classList.add('active-card');
  } else if (targetType === 'NOT OK') {
    paramSelect.value = '';
    statusSelect.value = 'NOT OK';
    const cardNotOk = document.getElementById('cardNOT_OK');
    if (cardNotOk) cardNotOk.classList.add('active-card');
  }

  filterData();
}

function calculateHealthIndex() {
  const suhu = document.getElementById('editSuhu').value.toUpperCase().trim();
  const kondisi = document.getElementById('editKondisi').value.toUpperCase().trim();
  const preventive = document.getElementById('editPreventive').value.toUpperCase().trim();
  
  let normalCount = 0;
  if (suhu.includes('NORMAL')) normalCount++;
  if (kondisi.includes('NORMAL')) normalCount++;
  if (preventive.includes('NORMAL')) normalCount++;

  let score = 0;
  if (normalCount === 3) score = 100;
  else if (normalCount === 2) score = 60;
  else if (normalCount === 1) score = 30;
  else score = 0;
  
  const healthInput = document.getElementById('editHealth');
  if (healthInput) {
    healthInput.value = score;
  }

  const badgeElem = document.getElementById('mHealthIndexDisplay');
  if (badgeElem) {
    badgeElem.textContent = `${score}%`;
    if (score >= 80) {
      badgeElem.style.color = '#16a34a';
    } else if (score >= 60) {
      badgeElem.style.color = '#d97706';
    } else {
      badgeElem.style.color = '#dc2626';
    }
  }
}

function openEditModal(idx) {
  const item = allAcData[idx];
  if (!item) return;

  const parseDateForPicker = (val) => {
    if (!val || val === 'NULL' || val === null) return '';
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }
    const str = String(val).trim();
    return str.length >= 10 ? str.substring(0, 10) : '';
  };

  const idPop = item.id_pop || item.idPop || '-';
  const lokasi = item.lokasi || '';
  const area = item.area_servpo || item.areaServpo || '';
  const kategori = item.kategori || '';
  const model = item.model || '';

  document.getElementById('editIdPopLabel').textContent = idPop;
  document.getElementById('editSubTitle').textContent = `${lokasi} (${area}) - Kategori: ${kategori} | Model: ${model}`;

  document.getElementById('editIdRow').value = item.id_row || idx + 1;
  document.getElementById('editIdPop').value = idPop;
  document.getElementById('editLokasi').value = lokasi;
  document.getElementById('editArea').value = area;
  document.getElementById('editKategori').value = kategori || 'POP-D';
  document.getElementById('editModel').value = model || '';
  document.getElementById('editPemilik').value = 'ICON+';
  document.getElementById('editJmlAc').value = item.jml_ac || '';
  
  const suhuVal = String(item.suhu_ruangan || item.suhuRuangan || 'NORMAL').toUpperCase();
  const kondisiVal = String(item.kondisi_ac || item.kondisiAc || 'NORMAL').toUpperCase();
  const prevVal = String(item.preventive_maintenance || item.preventiveMaintenance || 'NORMAL').toUpperCase();

  document.getElementById('editSuhu').value = (suhuVal.includes('NOT') || suhuVal.includes('ABN')) ? 'NOT OK' : 'NORMAL';
  document.getElementById('editKondisi').value = (kondisiVal.includes('NOT') || kondisiVal.includes('ABN')) ? 'NOT OK' : 'NORMAL';
  document.getElementById('editPreventive').value = (prevVal.includes('NOT') || prevVal.includes('ABN')) ? 'NOT OK' : 'NORMAL';

  calculateHealthIndex();

  document.getElementById('editLastPm').value = parseDateForPicker(item.last_pm);
  document.getElementById('editJadwalNext').value = parseDateForPicker(item.jadwal_next_pm);
  
  const tgl1Val = parseDateForPicker(item.tgl_pm_no1);
  const tglPm1El = document.getElementById('editTglPm1');
  if (tglPm1El) {
    tglPm1El.value = tgl1Val;
    if (tglPm1El._flatpickr) tglPm1El._flatpickr.setDate(tgl1Val, true);
  }

  const tgl2Val = parseDateForPicker(item.tgl_pm_no2);
  const tglPm2El = document.getElementById('editTglPm2');
  if (tglPm2El) {
    tglPm2El.value = tgl2Val;
    if (tglPm2El._flatpickr) tglPm2El._flatpickr.setDate(tgl2Val, true);
  }

  const tgl3Val = parseDateForPicker(item.tgl_pm_no3);
  const tglPm3El = document.getElementById('editTglPm3');
  if (tglPm3El) {
    tglPm3El.value = tgl3Val;
    if (tglPm3El._flatpickr) tglPm3El._flatpickr.setDate(tgl3Val, true);
  }

  const tgl4Val = parseDateForPicker(item.tgl_pm_no4);
  const tglPm4El = document.getElementById('editTglPm4');
  if (tglPm4El) {
    tglPm4El.value = tgl4Val;
    if (tglPm4El._flatpickr) tglPm4El._flatpickr.setDate(tgl4Val, true);
  }

  document.getElementById('editStatusTemuan').value = item.status_temuan || '';
  document.getElementById('editSelisih').value = item.selisih || '';
  document.getElementById('editAlarm').value = item.alarm || '-';
  document.getElementById('editNeedNew').value = item.need_new_ac || '';
  document.getElementById('editAdaPrgkt').value = item.ada_prgkt_besar || '';
  document.getElementById('editThnInstall').value = item.thn_install || item.thnInstall || '';
  document.getElementById('editBiaya').value = item.biaya_service_ac || '';
  document.getElementById('editNote').value = item.note || '';
  document.getElementById('editTemuan').value = item.temuan || '';

  document.getElementById('editModal').classList.remove('hidden');
}

function closeEditModal() {
  document.getElementById('editModal').classList.add('hidden');
}

async function autoSaveField() {
  const idRow = document.getElementById('editIdRow').value;
  if (!idRow) return;

  const suhu = document.getElementById('editSuhu').value.toUpperCase().trim();
  const kondisi = document.getElementById('editKondisi').value.toUpperCase().trim();
  const preventive = document.getElementById('editPreventive').value.toUpperCase().trim();
  
  let normalCount = 0;
  if (suhu.includes('NORMAL')) normalCount++;
  if (kondisi.includes('NORMAL')) normalCount++;
  if (preventive.includes('NORMAL')) normalCount++;

  let finalScore = 0;
  if (normalCount === 3) finalScore = 100;
  else if (normalCount === 2) finalScore = 60;
  else if (normalCount === 1) finalScore = 30;
  else finalScore = 0;

  const payload = {
    id_pop: document.getElementById('editIdPop').value,
    lokasi: document.getElementById('editLokasi').value,
    area_servpo: document.getElementById('editArea').value,
    kategori: document.getElementById('editKategori').value,
    model: document.getElementById('editModel').value,
    pemilik: 'ICON+',
    jml_ac: document.getElementById('editJmlAc').value,
    suhu_ruangan: suhu,
    kondisi_ac: kondisi,
    preventive_maintenance: preventive,
    health_index_ac: finalScore,
    last_pm: document.getElementById('editLastPm').value,
    jadwal_next_pm: document.getElementById('editJadwalNext').value,
    tgl_pm_no1: document.getElementById('editTglPm1').value,
    tgl_pm_no2: document.getElementById('editTglPm2').value,
    tgl_pm_no3: document.getElementById('editTglPm3').value,
    tgl_pm_no4: document.getElementById('editTglPm4').value,
    status_temuan: document.getElementById('editStatusTemuan').value,
    selisih: document.getElementById('editSelisih').value,
    alarm: document.getElementById('editAlarm').value,
    need_new_ac: document.getElementById('editNeedNew').value,
    ada_prgkt_besar: document.getElementById('editAdaPrgkt').value,
    thn_install: document.getElementById('editThnInstall').value,
    biaya_service_ac: document.getElementById('editBiaya').value,
    note: document.getElementById('editNote').value,
    temuan: document.getElementById('editTemuan').value
  };

  try {
    const res = await fetch(`/api/ac/${idRow}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await res.json();
    if (result.success) {
      fetchAcData();
    }
  } catch (err) {
    console.error('Auto-Save Error:', err);
  }
}

// Buka Modal Reset Tahunan AC
function openResetModal() {
  const modal = document.getElementById('resetModal');
  if (modal) modal.classList.remove('hidden');
}

// Tutup Modal Reset Tahunan AC
function closeResetModal() {
  const modal = document.getElementById('resetModal');
  if (modal) modal.classList.add('hidden');
}

// Eksekusi Reset Jadwal & Realisasi PM AC di Server Backend
async function confirmResetAc() {
  const btn = document.getElementById('btnConfirmReset');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Memproses...';
  }

  try {
    const response = await fetch('/api/ac/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
      throw new Error('Gagal melakukan reset data di server.');
    }

    const result = await response.json();
    alert('✅ ' + (result.message || 'Jadwal & Realisasi PM AC berhasil di-reset!'));

    closeResetModal();
    fetchAcData();
  } catch (error) {
    console.error('Error resetting AC data:', error);
    alert('❌ Terjadi kesalahan saat melakukan reset data PM AC.');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Ya, Reset Jadwal';
    }
  }
}