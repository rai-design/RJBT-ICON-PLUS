let allPmPopData = [];
let filteredPmPopData = [];
let currentPage = 1;
let rowsPerPage = 10;
let selectedIndex = null;
let saveDebounceTimer = null;

// Filter KPI Card ('ALL', 'SELESAI', 'BELUM', 'CATATAN')
let activeCardFilter = 'ALL';

document.addEventListener('DOMContentLoaded', () => {
  fetchPmPopData();
});

// 1. Fetch Data dari Server Backend
async function fetchPmPopData() {
  const tbody = document.getElementById('tableBody');
  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="10" style="text-align: center; padding: 20px; color: #64748b;">
        Memuat data PM POP...
      </td>
    </tr>
  `;

  try {
    const response = await fetch('/api/pm-pop');
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const result = await response.json();
    allPmPopData = result.data || [];

    activeCardFilter = 'ALL';
    updateKpiCards(allPmPopData);
    filterData(true);
  } catch (error) {
    console.error('Error fetching PM POP data:', error);
    tbody.innerHTML = `
      <tr>
        <td colspan="10" style="text-align: center; padding: 20px; color: #dc2626; font-weight: 700;">
          Gagal terhubung ke server. Pastikan 'node server.js' sudah berjalan.
        </td>
      </tr>
    `;
  }
}

// 2. Hitung & Update KPI Summary Cards
function updateKpiCards(data) {
  const totalSite = data.length;
  const selesaiCount = data.filter(i => String(i.status).toUpperCase() === 'SELESAI').length;
  const belumCount = data.filter(i => String(i.status).toUpperCase() === 'BELUM').length;
  const catatanCount = data.filter(i => i.catatanHasilPm && String(i.catatanHasilPm).trim() !== '' && String(i.catatanHasilPm) !== '-').length;

  const kpiTotal = document.getElementById('kpiTotalSite');
  const kpiSelesai = document.getElementById('kpiSelesaiCount');
  const kpiBelum = document.getElementById('kpiBelumCount');
  const kpiCatatan = document.getElementById('kpiCatatanCount');

  if (kpiTotal) kpiTotal.innerText = totalSite;
  if (kpiSelesai) kpiSelesai.innerText = `${selesaiCount} Site`;
  if (kpiBelum) kpiBelum.innerText = `${belumCount} Site`;
  if (kpiCatatan) kpiCatatan.innerText = `${catatanCount} Site`;
}

// 3. Handler Klik Card KPI untuk Filter
function filterByCard(filterType) {
  if (activeCardFilter === filterType && filterType !== 'ALL') {
    activeCardFilter = 'ALL';
  } else {
    activeCardFilter = filterType;
  }

  document.querySelectorAll('.kpi-card-clickable').forEach(card => {
    card.classList.remove('active-card');
  });

  const activeElem = document.getElementById(`card${activeCardFilter}`);
  if (activeElem) activeElem.classList.add('active-card');

  filterData(true);
}

// Helper Pembersih & Format Tampilan Nomor WO di Tabel
function formatWoDisplay(woStr) {
  if (!woStr || woStr === '-' || woStr === 'null' || String(woStr).trim() === '') return '-';

  let matches = String(woStr).match(/(WP|WO)?\d+/gi);

  if (!matches || matches.length === 0) {
    matches = String(woStr).split(/[\s,]+/);
  }

  const cleanList = matches
    .map(w => w.trim())
    .filter(w => w.length > 0 && w !== '-');

  if (cleanList.length === 0) return '-';

  const tagsHtml = cleanList
    .map(wo => `<span class="wo-tag">${wo}</span>`)
    .join('');

  return `<div class="wo-container">${tagsHtml}</div>`;
}

// 4. Render Tabel PM POP dengan Paginasi
function renderTable() {
  const tbody = document.getElementById('tableBody');
  if (!tbody) return;

  tbody.innerHTML = '';
  const total = filteredPmPopData.length;

  if (total === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" style="text-align: center; padding: 20px; color: #64748b;">
          Data PM POP tidak ditemukan.
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
  const pageData = filteredPmPopData.slice(startIndex, endIndex);

  pageData.forEach((item, pageIdx) => {
    const tr = document.createElement('tr');
    
    const isSelesai = String(item.status).toUpperCase() === 'SELESAI';
    const statusBadge = isSelesai 
      ? '<span class="badge-status badge-green">SELESAI</span>'
      : '<span class="badge-status badge-amber">BELUM</span>';

    const persen = item.persentase ? Math.round(parseFloat(item.persentase) * 100) : (isSelesai ? 100 : 0);

    const originalIndex = allPmPopData.findIndex(i => i.popId === item.popId);

    tr.innerHTML = `
      <td class="sticky-col-1">${startIndex + pageIdx + 1}</td>
      <td class="sticky-col-2" style="font-weight: 700;">${item.popId || '-'}</td>
      <td style="font-weight: 600;">${item.popName || '-'}</td>
      <td><span class="badge-status badge-blue">${item.kp || item.wilayah || '-'}</span></td>
      <td>${item.kategori || '-'}</td>
      <td>${item.ptServo || item.mitra || '-'}</td>
      <td><strong>${persen}%</strong></td>
      <td style="text-align: center;">${statusBadge}</td>
      <td>${formatWoDisplay(item.wo)}</td>
      <td style="text-align: center;">
        <button onclick="openModal(${originalIndex !== -1 ? originalIndex : 0})" class="btn-detail">Detail</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  renderPagination(total);
}

// 5. Render Kontrol Paginasi
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
  const totalPages = Math.ceil(filteredPmPopData.length / rowsPerPage);
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

// 6. Logika Filter Data PM POP
function filterData(resetPage = true) {
  const searchInput = document.getElementById('searchInput');
  const filterKp = document.getElementById('filterKp');
  const filterStatus = document.getElementById('filterStatus');

  const search = searchInput ? searchInput.value.trim().toUpperCase() : '';
  const kp = filterKp ? filterKp.value.trim().toUpperCase() : 'ALL';
  const status = filterStatus ? filterStatus.value.trim().toUpperCase() : 'ALL';

  filteredPmPopData = allPmPopData.filter(item => {
    const matchSearch = String(item.popId || '').toUpperCase().includes(search) ||
                        String(item.popName || '').toUpperCase().includes(search) ||
                        String(item.wo || '').toUpperCase().includes(search) ||
                        String(item.ptServo || item.mitra || '').toUpperCase().includes(search);

    const itemKp = String(item.kp || item.wilayah || '').toUpperCase();
    const matchKp = (kp === 'ALL' || kp === '') || itemKp.includes(kp);

    const itemStatus = String(item.status || '').toUpperCase();
    const matchStatus = (status === 'ALL' || status === '') || itemStatus === status;

    let matchCard = true;
    if (activeCardFilter === 'SELESAI') {
      matchCard = itemStatus === 'SELESAI';
    } else if (activeCardFilter === 'BELUM') {
      matchCard = itemStatus === 'BELUM';
    } else if (activeCardFilter === 'CATATAN') {
      matchCard = item.catatanHasilPm && String(item.catatanHasilPm).trim() !== '' && String(item.catatanHasilPm) !== '-';
    }

    return matchSearch && matchKp && matchStatus && matchCard;
  });

  if (resetPage) {
    currentPage = 1;
  }

  renderTable();
}

// Helper Format Tanggal untuk Date Input (YYYY-MM-DD)
function formatDateForInput(dateStr) {
  if (!dateStr || dateStr === '-') return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toISOString().split('T')[0];
}

// Helper Set Value Modal (Mendukung Input, Date, dan Select Dropdown)
function setValue(id, val) {
  const el = document.getElementById(id);
  if (!el) return;
  const cleanVal = (val !== null && val !== undefined && String(val).trim() !== '' && String(val) !== '-') ? String(val).trim() : '';

  if (el.tagName === 'SELECT') {
    let exists = Array.from(el.options).some(opt => opt.value.toUpperCase() === cleanVal.toUpperCase());
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

// Helper Render Tombol Link Berita Acara (BA) Seperti di Excel
function renderBaLink(containerId, linkVal, labelTahap, popName = '') {
  const container = document.getElementById(containerId);
  if (!container) return;

  const rawLink = (linkVal && String(linkVal).trim() !== '' && String(linkVal).trim() !== '-')
    ? String(linkVal).trim()
    : null;

  if (rawLink) {
    let fileUrl = rawLink;
    let displayText = rawLink;

    if (rawLink.startsWith('http://') || rawLink.startsWith('https://')) {
      fileUrl = rawLink;

      const urlParts = rawLink.split('/');
      const lastSegment = urlParts[urlParts.length - 1].split('?')[0];

      if (lastSegment && (lastSegment.includes('.pdf') || lastSegment.includes('.docx') || lastSegment.includes('.xlsx') || lastSegment.includes('.doc'))) {
        displayText = decodeURIComponent(lastSegment);
      } else {
        displayText = `PM FOT ${popName || 'DOCUMENT'}.pdf`;
      }
    } else {
      fileUrl = `/uploads/ba/${rawLink}`;
      displayText = rawLink;
    }

    container.innerHTML = `
      <a href="${fileUrl}" target="_blank" class="ba-link-btn" title="${fileUrl}">
        <i class="fa-solid fa-file-pdf" style="color: #dc2626; font-size: 0.95rem; flex-shrink: 0;"></i>
        <div style="display: flex; flex-direction: column; overflow: hidden; margin-right: 4px;">
          <span style="font-size: 0.65rem; color: #64748b; font-weight: 700; text-transform: uppercase;">${labelTahap}</span>
          <span style="font-size: 0.74rem; color: #0369a1; font-weight: 600; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">
            ${displayText}
          </span>
        </div>
        <i class="fa-solid fa-arrow-up-right-from-square" style="margin-left: auto; font-size: 0.75rem; color: #0284c7; flex-shrink: 0;"></i>
      </a>
    `;
  } else {
    container.innerHTML = `
      <span class="ba-empty">
        <i class="fa-regular fa-folder-open"></i> <strong>${labelTahap}:</strong> Belum Ada Berkas
      </span>
    `;
  }
}

// Handler Real-Time Update Preview Link BA saat Input Diubah
function updateBaPreviewAndSave() {
  if (selectedIndex === null) return;
  const item = allPmPopData[selectedIndex];
  const popName = item ? item.popName : '';

  const getVal = id => {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  };

  renderBaLink('baContainer1', getVal('mLinkBaTahap1'), 'BA Tahap 1', popName);
  renderBaLink('baContainer2', getVal('mLinkBaTahap2'), 'BA Tahap 2', popName);
  renderBaLink('baContainer3', getVal('mLinkBaTahap3'), 'BA Tahap 3', popName);
  renderBaLink('baContainer4', getVal('mLinkBaTahap4'), 'BA Tahap 4', popName);

  autoSaveData();
}

// 7. Buka Modal Detail
function openModal(index) {
  selectedIndex = index;
  const item = allPmPopData[index];
  if (!item) return;

  const setTxt = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val || '-';
  };

  setTxt('mPopId', item.popId);
  setTxt('mPopName', item.popName);
  setTxt('mKp', item.kp);
  setTxt('mWilayah', item.wilayah);
  setTxt('mKategori', item.kategori);
  setTxt('mTikor', item.tikor);
  setTxt('mPicServo', item.picPmServo);

  // Hanya mengisi tanggal Tahap 1 s.d. Tahap 4
  setValue('mTahap1', item.tahap1);
  setValue('mTahap2', item.tahap2);
  setValue('mTahap3', item.tahap3);
  setValue('mTahap4', item.tahap4);

  setValue('mMitra', item.ptServo || item.mitra);
  setValue('mStatusPm', item.status || 'BELUM');
  setValue('mNomorWo', item.wo);
  setValue('mCatatanPm', item.catatanHasilPm);

  // Set nilai input text Link BA Tahap 1 s.d. 4
  setValue('mLinkBaTahap1', item.linkBaTahap1);
  setValue('mLinkBaTahap2', item.linkBaTahap2);
  setValue('mLinkBaTahap3', item.linkBaTahap3);
  setValue('mLinkBaTahap4', item.linkBaTahap4);

  // Render 4 Berkas Link BA ke Modal
  renderBaLink('baContainer1', item.linkBaTahap1, 'BA Tahap 1', item.popName);
  renderBaLink('baContainer2', item.linkBaTahap2, 'BA Tahap 2', item.popName);
  renderBaLink('baContainer3', item.linkBaTahap3, 'BA Tahap 3', item.popName);
  renderBaLink('baContainer4', item.linkBaTahap4, 'BA Tahap 4', item.popName);

  const autoStatus = document.getElementById('autoSaveStatus');
  if (autoStatus) autoStatus.textContent = '';

  const detailModal = document.getElementById('detailModal');
  if (detailModal) detailModal.classList.remove('hidden');
}

function closeDetailModal() {
  const detailModal = document.getElementById('detailModal');
  if (detailModal) detailModal.classList.add('hidden');
}

// 8. Auto Save Perubahan ke Server Backend
function autoSaveData() {
  if (selectedIndex === null) return;

  const autoStatus = document.getElementById('autoSaveStatus');
  if (autoStatus) {
    autoStatus.style.color = '#d97706';
    autoStatus.textContent = '🔄 Menyimpan...';
  }

  clearTimeout(saveDebounceTimer);
  saveDebounceTimer = setTimeout(async () => {
    const currentItem = allPmPopData[selectedIndex];
    const popId = currentItem.popId;

    const getVal = id => {
      const el = document.getElementById(id);
      return el ? el.value.trim() : '';
    };

    const payload = {
      tahap1: getVal('mTahap1'),
      tahap2: getVal('mTahap2'),
      tahap3: getVal('mTahap3'),
      tahap4: getVal('mTahap4'),
      tahap5: null,
      tahap6: null,
      mitra: getVal('mMitra'),
      status: getVal('mStatusPm'),
      wo: getVal('mNomorWo'),
      catatanHasilPm: getVal('mCatatanPm'),
      linkBaTahap1: getVal('mLinkBaTahap1'),
      linkBaTahap2: getVal('mLinkBaTahap2'),
      linkBaTahap3: getVal('mLinkBaTahap3'),
      linkBaTahap4: getVal('mLinkBaTahap4')
    };

    try {
      const response = await fetch(`/api/pm-pop/${encodeURIComponent(popId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) throw new Error('Gagal memperbarui data PM POP.');

      const result = await response.json();

      Object.assign(allPmPopData[selectedIndex], {
        ...payload,
        ptServo: payload.mitra,
        linkBaTahap1: payload.linkBaTahap1,
        linkBaTahap2: payload.linkBaTahap2,
        linkBaTahap3: payload.linkBaTahap3,
        linkBaTahap4: payload.linkBaTahap4,
        persentase: result.persentase !== undefined ? result.persentase : allPmPopData[selectedIndex].persentase,
        status: result.status !== undefined ? result.status : payload.status,
        done: result.done !== undefined ? result.done : allPmPopData[selectedIndex].done
      });

      if (autoStatus) {
        autoStatus.style.color = '#16a34a';
        autoStatus.textContent = 'Perubahan tersimpan!';
      }

      updateKpiCards(allPmPopData);
      filterData(false);
    } catch (err) {
      console.error('Error auto-saving PM POP data:', err);
      if (autoStatus) {
        autoStatus.style.color = '#dc2626';
        autoStatus.textContent = '❌ Gagal menyimpan perubahan.';
      }
    }
  }, 300);
}