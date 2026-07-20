import globalState from '../../state.js';
import { Layout } from '../../layout.js';
import DataService from '../../../services/dataService.js';

const API_BASE = 'https://nepse-hub-backend.vercel.app';
const ROWS_PER_PAGE = 50;

// ─── State ─────────────────────────────────────────────────────────────────────
let allRows     = [];   // Full fetched dataset (all pages from API)
let filteredRows = []; // After client-side sort
let currentPage = 1;
let totalPages  = 1;
let sortCol     = 'holding_qty';
let sortDir     = 'desc';
let isLoading   = false;
let groupByDate = false;  // Aggregate mode when memberId set
let lastParams  = {};

// ─── Init ──────────────────────────────────────────────────────────────────────
async function init() {
    globalState.setState({ activePage: 'broker-holding' });
    await Layout.init();
    bindEvents();
    loadBrokers(); // async — populates dropdown in background
}

// ─── Broker searchable dropdown ────────────────────────────────────────────────
let allBrokers = []; // { broker_id, broker_name }

async function loadBrokers() {
    try {
        allBrokers = await DataService.getBrokers();
        // Pre-render all options (hidden); filtering happens on input
        renderBrokerList(allBrokers);
    } catch (e) {
        console.warn('Could not load broker list:', e);
    }
}

function renderBrokerList(brokers) {
    const list = document.getElementById('broker-list');
    if (!list) return;

    if (brokers.length === 0) {
        list.innerHTML = `<div style="padding:0.75rem 1rem; color:var(--text-secondary); font-size:0.82rem;">No brokers found</div>`;
        return;
    }

    list.innerHTML = brokers.map(b => `
        <div
            class="broker-opt"
            data-id="${b.broker_id}"
            data-name="${b.broker_name}"
            style="
                padding: 0.6rem 1rem;
                cursor: pointer;
                font-size: 0.83rem;
                display: flex;
                align-items: center;
                gap: 0.6rem;
                border-bottom: 1px solid rgba(255,255,255,0.03);
                transition: background 0.12s;
            "
        >
            <span style="
                background: rgba(16,185,129,0.12);
                color: var(--primary);
                font-weight: 700;
                font-size: 0.72rem;
                padding: 2px 7px;
                border-radius: 8px;
                min-width: 28px;
                text-align: center;
            ">${b.broker_id}</span>
            <span style="color:var(--text-primary);">${b.broker_name}</span>
        </div>
    `).join('');

    // Bind click handlers
    list.querySelectorAll('.broker-opt').forEach(opt => {
        opt.addEventListener('click', () => selectBroker(opt.dataset.id, opt.dataset.name));
    });
}

function selectBroker(id, name) {
    document.getElementById('broker-input').value  = id;
    document.getElementById('broker-search').value = `${id} — ${name}`;
    document.getElementById('broker-dropdown').style.display = 'none';
}

function bindBrokerSearch() {
    const searchEl   = document.getElementById('broker-search');
    const dropEl     = document.getElementById('broker-dropdown');
    const hiddenEl   = document.getElementById('broker-input');
    if (!searchEl || !dropEl) return;

    searchEl.addEventListener('focus', () => {
        renderBrokerList(allBrokers);
        dropEl.style.display = 'block';
    });

    searchEl.addEventListener('click', () => {
        renderBrokerList(allBrokers);
        dropEl.style.display = 'block';
    });

    searchEl.addEventListener('input', () => {
        const q = searchEl.value.trim().toLowerCase();
        // Clear hidden value when user edits text
        hiddenEl.value = '';
        const filtered = q
            ? allBrokers.filter(b =>
                String(b.broker_id).includes(q) ||
                b.broker_name.toLowerCase().includes(q)
            )
            : allBrokers;
        renderBrokerList(filtered);
        dropEl.style.display = 'block';
    });

    searchEl.addEventListener('keydown', e => {
        if (e.key === 'Escape') dropEl.style.display = 'none';
        if (e.key === 'Enter') {
            dropEl.style.display = 'none';
            // If nothing selected yet, treat raw text as broker ID
            if (!hiddenEl.value && /^\d+$/.test(searchEl.value.trim())) {
                hiddenEl.value = searchEl.value.trim();
            }
            fetchHoldings();
        }
    });
}

// ─── Event bindings ────────────────────────────────────────────────────────────
function bindEvents() {
    // Mode tabs
    document.getElementById('tab-period').addEventListener('click', () => setMode('period'));
    document.getElementById('tab-date').addEventListener('click',   () => setMode('date'));

    // Search / clear
    document.getElementById('btn-fetch-holdings').addEventListener('click', () => {
        currentPage = 1;
        fetchHoldings();
    });
    document.getElementById('btn-clear').addEventListener('click', clearFilters);

    // Group-by-date toggle
    document.getElementById('chk-group-date').addEventListener('change', (e) => {
        groupByDate = e.target.checked;
        renderTable();
    });

    // Column sort
    document.querySelectorAll('.bh-table th[data-col]').forEach(th => {
        th.addEventListener('click', () => {
            const col = th.dataset.col;
            if (sortCol === col) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
            else { sortCol = col; sortDir = 'desc'; }
            sortAndRender();
            updateSortHeaders();
        });
    });

    // Keyboard shortcut: Enter in inputs
    ['symbol-input','date-input'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') fetchHoldings(); });
    });

    // Broker searchable dropdown
    bindBrokerSearch();

    // Click outside broker dropdown → close
    document.addEventListener('click', (e) => {
        const wrap = document.getElementById('broker-search')?.closest('.bh-fg');
        const drop = document.getElementById('broker-dropdown');
        if (drop && wrap && !wrap.contains(e.target)) {
            drop.style.display = 'none';
        }
    });
}

function setMode(mode) {
    const tabPeriod  = document.getElementById('tab-period');
    const tabDate    = document.getElementById('tab-date');
    const grpPeriod  = document.getElementById('group-period');
    const grpDate    = document.getElementById('group-date');

    if (mode === 'period') {
        tabPeriod.classList.add('active');
        tabDate.classList.remove('active');
        grpPeriod.style.display = 'flex';
        grpDate.style.display   = 'none';
    } else {
        tabDate.classList.add('active');
        tabPeriod.classList.remove('active');
        grpDate.style.display   = 'flex';
        grpPeriod.style.display = 'none';
    }
}

function clearFilters() {
    document.getElementById('symbol-input').value  = '';
    document.getElementById('broker-input').value  = '';
    document.getElementById('broker-search').value = '';
    document.getElementById('type-select').value   = 'All';
    document.getElementById('period-select').value = '1D';
    document.getElementById('date-input').value    = '';
    setMode('period');
    allRows = []; filteredRows = [];
    renderEmpty('Filters cleared. Press Search to load data.');
    hideSummary();
    document.getElementById('pagebar').style.display = 'none';
}

// ─── Fetch ─────────────────────────────────────────────────────────────────────
async function fetchHoldings() {
    if (isLoading) return;
    isLoading = true;

    const periodMode = document.getElementById('tab-period').classList.contains('active');
    const period     = periodMode ? document.getElementById('period-select').value : null;
    const date       = !periodMode ? document.getElementById('date-input').value : null;
    const symbol     = document.getElementById('symbol-input').value.trim().toUpperCase();
    const memberIdRaw = document.getElementById('broker-input').value.trim();
    const memberId   = memberIdRaw ? parseInt(memberIdRaw, 10) : null;
    const typeVal    = document.getElementById('type-select').value;
    const type       = typeVal !== 'All' ? typeVal : null;

    lastParams = { period, date, symbol, memberId, type };

    // Show group toggle only when memberId is present
    const groupWrap = document.getElementById('group-toggle-wrap');
    if (memberId) {
        groupWrap.style.display = 'flex';
    } else {
        groupWrap.style.display = 'none';
        groupByDate = false;
        document.getElementById('chk-group-date').checked = false;
    }

    showLoadingState();
    disableSearch(true);

    try {
        // Build query params - fetch all rows via limit=1000 per request (API handles pagination)
        const params = new URLSearchParams();
        if (period)   params.append('period', period);
        if (date)     params.append('date', date);
        if (symbol)   params.append('symbol', symbol);
        if (memberId) params.append('memberId', memberId);
        if (type)     params.append('type', type);
        params.append('limit', '1000');
        params.append('page', '1');

        const url = `${API_BASE}/api/brokerHolding?${params.toString()}`;
        console.log('📡 Broker Holdings:', url);
        const resp = await fetch(url);

        if (!resp.ok) {
            const errJson = await resp.json().catch(() => ({}));
            throw new Error(errJson.error || `HTTP ${resp.status}`);
        }

        const json = await resp.json();

        if (!json.success) throw new Error(json.error || 'Unknown error');

        const pag = json.pagination || {};
        allRows = json.data || [];

        // If backend has multiple pages, fetch remaining
        if (pag.totalPages && pag.totalPages > 1) {
            for (let p = 2; p <= pag.totalPages; p++) {
                params.set('page', p);
                const r = await fetch(`${API_BASE}/api/brokerHolding?${params.toString()}`);
                if (!r.ok) break;
                const extra = await r.json();
                if (extra.data) allRows = allRows.concat(extra.data);
            }
        }

        renderSummary(json.summary);
        currentPage = 1;
        sortAndRender();

    } catch (err) {
        console.error('Broker Holdings error:', err);
        renderEmpty(`Error: ${err.message}`);
        hideSummary();
        document.getElementById('pagebar').style.display = 'none';
        document.getElementById('record-count').textContent = 'Error loading';
    } finally {
        isLoading = false;
        disableSearch(false);
    }
}

// ─── Sort & render ─────────────────────────────────────────────────────────────
function sortAndRender() {
    filteredRows = [...allRows].sort((a, b) => {
        let va = a[sortCol], vb = b[sortCol];
        if (typeof va === 'string') {
            return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
        }
        return sortDir === 'asc' ? (va - vb) : (vb - va);
    });
    totalPages = Math.max(1, Math.ceil(filteredRows.length / ROWS_PER_PAGE));
    if (currentPage > totalPages) currentPage = totalPages;
    renderTable();
    updatePagination();
}

function updateSortHeaders() {
    document.querySelectorAll('.bh-table th[data-col]').forEach(th => {
        th.classList.remove('sort-asc','sort-desc');
        if (th.dataset.col === sortCol) {
            th.classList.add(sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
        }
    });
}

// ─── Table rendering ───────────────────────────────────────────────────────────
function renderTable() {
    const tbody = document.getElementById('holdings-table-body');
    const thead = document.getElementById('table-head');
    const titleEl = document.getElementById('table-title');

    if (allRows.length === 0) {
        renderEmpty('No records found for the selected filters.');
        document.getElementById('record-count').textContent = '0 records';
        document.getElementById('pagebar').style.display = 'none';
        return;
    }

    // Grouped mode: aggregate by date (useful when viewing a single broker over a period)
    if (groupByDate && lastParams.memberId) {
        renderGroupedTable(tbody, thead, titleEl);
        return;
    }

    // Default flat table — Date, Symbol, Broker, Holding, Holding Amount, Avg Price
    thead.innerHTML = `
        <tr>
          <th data-col="date">Date</th>
          <th data-col="symbol">Symbol</th>
          <th data-col="broker_id">Broker</th>
          <th data-col="holding_qty" class="r">Holding Qty</th>
          <th data-col="holding_amount" class="r">Holding Amount</th>
          <th data-col="avg_price" class="r">Avg Price</th>
        </tr>
    `;
    // Re-bind sort listeners after innerHTML rebuild
    thead.querySelectorAll('th[data-col]').forEach(th => {
        th.addEventListener('click', () => {
            const col = th.dataset.col;
            if (sortCol === col) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
            else { sortCol = col; sortDir = 'desc'; }
            sortAndRender(); updateSortHeaders();
        });
    });
    updateSortHeaders();

    titleEl.textContent = 'Broker Holdings';

    const start = (currentPage - 1) * ROWS_PER_PAGE;
    const pageRows = filteredRows.slice(start, start + ROWS_PER_PAGE);

    document.getElementById('record-count').textContent = `${filteredRows.length.toLocaleString('en-IN')} records`;

    tbody.innerHTML = pageRows.map(row => {
        const holdClass = row.holding_qty > 0 ? 'pos' : row.holding_qty < 0 ? 'neg' : 'neutral';
        const amtClass  = row.holding_amount > 0 ? 'pos' : row.holding_amount < 0 ? 'neg' : 'neutral';
        // Avg price = net amount / net qty (only meaningful when holding_qty != 0)
        const avgPrice = row.holding_qty !== 0 ? Math.abs(row.holding_amount / row.holding_qty) : null;
        return `
            <tr>
              <td class="td-date">${row.date}</td>
              <td class="td-symbol">${row.symbol}</td>
              <td class="td-broker"><span class="bh-group-badge"><i class="fas fa-user"></i>${row.broker_id}</span></td>
              <td class="r ${holdClass}" style="font-size:0.92rem; font-weight:700;">${row.holding_qty >= 0 ? '+' : ''}${row.holding_qty.toLocaleString('en-IN')}</td>
              <td class="r ${amtClass}" style="font-weight:600;">${row.holding_amount >= 0 ? '+' : ''}${fmtAmt(row.holding_amount)}</td>
              <td class="r" style="color:var(--text-secondary); font-size:0.82rem;">${avgPrice !== null ? 'Rs. ' + avgPrice.toFixed(2) : '<span style="opacity:0.4">—</span>'}</td>
            </tr>
        `;
    }).join('');
}

function renderGroupedTable(tbody, thead, titleEl) {
    // Aggregate by date → sum all symbols for the memberId
    const dateMap = {};
    for (const row of filteredRows) {
        if (!dateMap[row.date]) {
            dateMap[row.date] = {
                date: row.date,
                broker_id: row.broker_id,
                symbolCount: 0,
                buy_qty: 0, buy_amount: 0,
                sell_qty: 0, sell_amount: 0,
                holding_qty: 0, holding_amount: 0
            };
        }
        const g = dateMap[row.date];
        g.symbolCount++;
        g.buy_qty     += row.buy_qty;
        g.buy_amount  += row.buy_amount;
        g.sell_qty    += row.sell_qty;
        g.sell_amount += row.sell_amount;
        g.holding_qty += row.holding_qty;
        g.holding_amount += row.holding_amount;
    }
    const grouped = Object.values(dateMap).sort((a, b) => {
        const dir = sortDir === 'asc' ? 1 : -1;
        if (sortCol === 'date') return a.date < b.date ? -dir : dir;
        return (a[sortCol] - b[sortCol]) * dir;
    });

    titleEl.textContent = `Date-wise Summary — Broker ${lastParams.memberId}`;
    document.getElementById('record-count').textContent = `${grouped.length.toLocaleString('en-IN')} dates`;

    thead.innerHTML = `
        <tr>
          <th data-col="date">Date</th>
          <th class="r">Symbols</th>
          <th data-col="holding_qty" class="r">Holding Qty</th>
          <th data-col="holding_amount" class="r">Holding Amount</th>
          <th class="r">Avg Price</th>
        </tr>
    `;
    thead.querySelectorAll('th[data-col]').forEach(th => {
        th.style.cursor = 'pointer';
        th.addEventListener('click', () => {
            const col = th.dataset.col;
            if (sortCol === col) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
            else { sortCol = col; sortDir = 'desc'; }
            renderTable(); updateSortHeaders();
        });
    });

    // Paginate grouped rows
    totalPages = Math.max(1, Math.ceil(grouped.length / ROWS_PER_PAGE));
    if (currentPage > totalPages) currentPage = totalPages;
    const start = (currentPage - 1) * ROWS_PER_PAGE;
    const pageRows = grouped.slice(start, start + ROWS_PER_PAGE);
    updatePagination(grouped.length);

    tbody.innerHTML = pageRows.map(row => {
        const holdClass = row.holding_qty > 0 ? 'pos' : row.holding_qty < 0 ? 'neg' : 'neutral';
        const amtClass  = row.holding_amount > 0 ? 'pos' : row.holding_amount < 0 ? 'neg' : 'neutral';
        const avgPrice  = row.holding_qty !== 0 ? Math.abs(row.holding_amount / row.holding_qty) : null;
        return `
            <tr>
              <td class="td-date" style="font-weight:600;">${row.date}</td>
              <td class="r"><span class="bh-group-badge">${row.symbolCount}</span></td>
              <td class="r ${holdClass}" style="font-size:0.92rem; font-weight:700;">${row.holding_qty >= 0 ? '+' : ''}${row.holding_qty.toLocaleString('en-IN')}</td>
              <td class="r ${amtClass}" style="font-weight:600;">${row.holding_amount >= 0 ? '+' : ''}${fmtAmt(row.holding_amount)}</td>
              <td class="r" style="color:var(--text-secondary); font-size:0.82rem;">${avgPrice !== null ? 'Rs. ' + avgPrice.toFixed(2) : '<span style="opacity:0.4">—</span>'}</td>
            </tr>
        `;
    }).join('');

    // Show pagebar
    updatePagination(grouped.length);
}

// ─── Summary cards ─────────────────────────────────────────────────────────────
function renderSummary(s) {
    if (!s) { hideSummary(); return; }
    const grid = document.getElementById('summary-grid');
    grid.innerHTML = `
        <div class="bh-stat-card" style="--card-accent:#4ade80">
            <span class="bh-stat-label">Total Buy Qty</span>
            <span class="bh-stat-value pos">${(s.buyQuantity||0).toLocaleString('en-IN')}</span>
            <span class="bh-stat-sub">Rs. ${fmtAmt(s.buyAmount||0)}</span>
        </div>
        <div class="bh-stat-card" style="--card-accent:#f87171">
            <span class="bh-stat-label">Total Sell Qty</span>
            <span class="bh-stat-value neg">${(s.sellQuantity||0).toLocaleString('en-IN')}</span>
            <span class="bh-stat-sub">Rs. ${fmtAmt(s.sellAmount||0)}</span>
        </div>
        <div class="bh-stat-card" style="--card-accent:${(s.holdingQuantity||0) >= 0 ? '#4ade80' : '#f87171'}">
            <span class="bh-stat-label">Net Holding Qty</span>
            <span class="bh-stat-value ${(s.holdingQuantity||0) >= 0 ? 'pos' : 'neg'}">${(s.holdingQuantity||0) >= 0 ? '+' : ''}${(s.holdingQuantity||0).toLocaleString('en-IN')}</span>
            <span class="bh-stat-sub">Net Rs. ${fmtAmt(s.netAmount||0)}</span>
        </div>
        <div class="bh-stat-card" style="--card-accent:#818cf8">
            <span class="bh-stat-label">Avg Prices</span>
            <span class="bh-stat-value" style="font-size:1rem; gap:0.35rem; display:flex; flex-direction:column; margin-top:0.2rem;">
                <span class="pos" style="font-size:0.9rem;">Buy: Rs. ${(s.averageBuyPrice||0).toFixed(2)}</span>
                <span class="neg" style="font-size:0.9rem;">Sell: Rs. ${(s.averageSellPrice||0).toFixed(2)}</span>
            </span>
            <span class="bh-stat-sub">Weighted average per share</span>
        </div>
    `;
}
function hideSummary() {
    document.getElementById('summary-grid').innerHTML = '';
}

// ─── Pagination ─────────────────────────────────────────────────────────────────
function updatePagination(overrideTotal) {
    const total = overrideTotal !== undefined ? overrideTotal : filteredRows.length;
    totalPages = Math.max(1, Math.ceil(total / ROWS_PER_PAGE));
    const pagebar  = document.getElementById('pagebar');
    const pageInfo = document.getElementById('page-info');
    const pageBtns = document.getElementById('page-btns');

    if (total === 0) { pagebar.style.display = 'none'; return; }
    pagebar.style.display = 'flex';

    const start = (currentPage - 1) * ROWS_PER_PAGE + 1;
    const end   = Math.min(currentPage * ROWS_PER_PAGE, total);
    pageInfo.textContent = `Showing ${start.toLocaleString('en-IN')}–${end.toLocaleString('en-IN')} of ${total.toLocaleString('en-IN')} records`;

    // Build page buttons (compact)
    const pages = buildPageNumbers(currentPage, totalPages);
    pageBtns.innerHTML = `
        <button class="bh-page-btn" ${currentPage <= 1 ? 'disabled' : ''} id="pp-prev">
            <i class="fas fa-chevron-left"></i>
        </button>
        ${pages.map(p => p === '...'
            ? `<button class="bh-page-btn" disabled>…</button>`
            : `<button class="bh-page-btn ${p === currentPage ? 'active' : ''}" data-page="${p}">${p}</button>`
        ).join('')}
        <button class="bh-page-btn" ${currentPage >= totalPages ? 'disabled' : ''} id="pp-next">
            <i class="fas fa-chevron-right"></i>
        </button>
    `;

    pageBtns.querySelectorAll('[data-page]').forEach(btn => {
        btn.addEventListener('click', () => { currentPage = parseInt(btn.dataset.page); renderTable(); updatePagination(overrideTotal); });
    });
    const prevBtn = document.getElementById('pp-prev');
    const nextBtn = document.getElementById('pp-next');
    if (prevBtn) prevBtn.addEventListener('click', () => { if (currentPage > 1) { currentPage--; renderTable(); updatePagination(overrideTotal); } });
    if (nextBtn) nextBtn.addEventListener('click', () => { if (currentPage < totalPages) { currentPage++; renderTable(); updatePagination(overrideTotal); } });
}

function buildPageNumbers(current, total) {
    if (total <= 7) return Array.from({length: total}, (_, i) => i + 1);
    if (current <= 4) return [1, 2, 3, 4, 5, '...', total];
    if (current >= total - 3) return [1, '...', total-4, total-3, total-2, total-1, total];
    return [1, '...', current - 1, current, current + 1, '...', total];
}

// ─── Loading / empty states ────────────────────────────────────────────────────
function showLoadingState() {
    document.getElementById('holdings-table-body').innerHTML = `
        <tr><td colspan="6">
            <div class="bh-loading-msg">
                <div class="bh-spinner">
                    <div class="ring ring-1"></div>
                    <div class="ring ring-2"></div>
                </div>
                <span style="color:var(--text-secondary); font-size:0.88rem;">Querying broker holdings data...</span>
            </div>
        </td></tr>
    `;
    document.getElementById('summary-grid').innerHTML = `
        ${[...Array(4)].map(() => `
            <div class="bh-stat-card">
                <div class="skel" style="width:80px; height:10px;"></div>
                <div class="skel" style="width:120px; height:24px; margin-top:6px;"></div>
                <div class="skel" style="width:100px; height:10px; margin-top:4px;"></div>
            </div>
        `).join('')}
    `;
    document.getElementById('record-count').textContent = 'Loading...';
    document.getElementById('pagebar').style.display = 'none';
}

function renderEmpty(msg) {
    const icon = msg.includes('Error') ? 'fa-exclamation-triangle' : 'fa-search-minus';
    document.getElementById('holdings-table-body').innerHTML = `
        <tr><td colspan="6">
            <div class="bh-empty">
                <i class="fas ${icon}"></i>
                <p>${msg}</p>
            </div>
        </td></tr>
    `;
}

function disableSearch(state) {
    const btn = document.getElementById('btn-fetch-holdings');
    btn.disabled = state;
    btn.innerHTML = state
        ? '<i class="fas fa-spinner fa-spin"></i> Searching...'
        : '<i class="fas fa-search"></i> Search';
}

// ─── Formatting helpers ────────────────────────────────────────────────────────
function fmtAmt(val) {
    const n = Number(val);
    if (isNaN(n)) return '—';
    // Format in lakh/crore for large numbers
    if (Math.abs(n) >= 1e7) return `${(n / 1e7).toFixed(2)} Cr`;
    if (Math.abs(n) >= 1e5) return `${(n / 1e5).toFixed(2)} L`;
    return n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

// ─── Boot ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
