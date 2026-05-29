import globalState from '../../state.js';
import { Layout } from '../../layout.js';

const SCREENER_API = 'https://technical-nepse.vercel.app/api/screener/all';

// State
let allData = [];           // All data loaded so far (all pages combined)
let filteredData = [];      // After filter/search
let currentPage = 1;
let perPage = 20;
let totalPages = 1;
let totalSymbols = 0;
let currentFilter = 'all';
let searchQuery = '';
let sortKey = null;
let sortDir = 'asc';
let isLoading = false;

// ─── Init ───────────────────────────────────────────
async function init() {
    globalState.setState({ activePage: 'screener' });
    await Layout.init();
    bindEvents();
    showSkeletonRows();
    await loadAllPages();
}

// ─── Load All Pages from API ────────────────────────
async function loadAllPages() {
    isLoading = true;
    allData = [];
    let page = 1;
    let hasMore = true;

    try {
        while (hasMore) {
            const url = `${SCREENER_API}?page=${page}&limit=50`;
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const json = await response.json();

            if (json.results && json.results.length > 0) {
                allData = allData.concat(json.results);
            }

            totalSymbols = json.pagination?.total_symbols || allData.length;
            const apiTotalPages = json.pagination?.total_pages || 1;

            if (page >= apiTotalPages) {
                hasMore = false;
            } else {
                page++;
            }

            // Update stats progressively
            updateStats();
            updateChipCounts();
        }
    } catch (err) {
        console.error('Screener fetch error:', err);
        if (allData.length === 0) {
            showEmpty('Failed to load screener data. Please try again.');
            isLoading = false;
            return;
        }
    }

    isLoading = false;
    currentPage = 1;
    applyFiltersAndRender();
}

// ─── Bind Events ────────────────────────────────────
function bindEvents() {
    // Search
    const searchInput = document.getElementById('screener-search');
    let debounce;
    searchInput.addEventListener('input', (e) => {
        clearTimeout(debounce);
        debounce = setTimeout(() => {
            searchQuery = e.target.value.trim().toUpperCase();
            currentPage = 1;
            applyFiltersAndRender();
        }, 250);
    });

    // Filter chips
    document.getElementById('filter-chips').addEventListener('click', (e) => {
        const chip = e.target.closest('.filter-chip');
        if (!chip) return;
        document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        
        currentFilter = chip.dataset.filter;
        currentPage = 1;

        // Synchronize selection to the dropdown menu items
        const dropdownMenu = document.getElementById('analysis-dropdown-menu');
        if (dropdownMenu) {
            dropdownMenu.querySelectorAll('.dropdown-item').forEach(el => {
                if (el.dataset.filter === currentFilter) {
                    el.classList.add('active');
                } else {
                    el.classList.remove('active');
                }
            });
        }

        applyFiltersAndRender();
    });

    // Analysis Dropdown Events
    const dropdownContainer = document.getElementById('analysis-dropdown-container');
    const dropdownTrigger = document.getElementById('analysis-dropdown-trigger');
    const dropdownMenu = document.getElementById('analysis-dropdown-menu');

    if (dropdownTrigger && dropdownMenu) {
        // Toggle dropdown open/closed
        dropdownTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdownContainer.classList.toggle('open');
            dropdownMenu.classList.toggle('show');
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!dropdownContainer.contains(e.target)) {
                dropdownContainer.classList.remove('open');
                dropdownMenu.classList.remove('show');
            }
        });

        // Dropdown item selection
        dropdownMenu.addEventListener('click', (e) => {
            const item = e.target.closest('.dropdown-item');
            if (!item) return;

            // Set active class in menu
            dropdownMenu.querySelectorAll('.dropdown-item').forEach(el => el.classList.remove('active'));
            item.classList.add('active');

            currentFilter = item.dataset.filter;
            currentPage = 1;

            // Synchronize selection to filter chips (if matching chip exists)
            document.querySelectorAll('.filter-chip').forEach(c => {
                if (c.dataset.filter === currentFilter) {
                    c.classList.add('active');
                } else {
                    c.classList.remove('active');
                }
            });

            // Close dropdown
            dropdownContainer.classList.remove('open');
            dropdownMenu.classList.remove('show');

            applyFiltersAndRender();
        });
    }

    // Sort headers
    document.querySelectorAll('.screener-table thead th[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
            const key = th.dataset.sort;
            if (sortKey === key) {
                sortDir = sortDir === 'asc' ? 'desc' : 'asc';
            } else {
                sortKey = key;
                sortDir = 'asc';
            }
            // Update visual
            document.querySelectorAll('.screener-table thead th').forEach(t => t.classList.remove('sorted'));
            th.classList.add('sorted');
            const icon = th.querySelector('.sort-icon');
            if (icon) {
                icon.className = `fas fa-sort-${sortDir === 'asc' ? 'up' : 'down'} sort-icon`;
            }
            applyFiltersAndRender();
        });
    });

    // Per-page select
    document.getElementById('per-page-select').addEventListener('change', (e) => {
        perPage = parseInt(e.target.value);
        currentPage = 1;
        applyFiltersAndRender();
    });
}

// ─── Filter + Sort + Paginate + Render ──────────────
function applyFiltersAndRender() {
    // 1. Filter
    filteredData = allData.filter(item => {
        const ind = item.indicators;
        // Search filter
        if (searchQuery && !item.symbol.toUpperCase().includes(searchQuery)) return false;

        // Category filter
        if (currentFilter === 'bullish') {
            return getOverallTrend(ind) === 'bullish';
        } else if (currentFilter === 'bearish') {
            return getOverallTrend(ind) === 'bearish';
        } else if (currentFilter === 'oversold') {
            return ind.rsi_14 <= 30;
        } else if (currentFilter === 'overbought') {
            return ind.rsi_14 >= 70;
        } else if (currentFilter === 'golden_cross') {
            return hasSignal(ind, 'golden_cross');
        } else if (currentFilter === 'death_cross') {
            return hasSignal(ind, 'death_cross');
        } else if (currentFilter === 'short_bullish') {
            return ind.moving_average_crossovers?.short_term_cross?.status === 'bullish';
        } else if (currentFilter === 'short_bearish') {
            return ind.moving_average_crossovers?.short_term_cross?.status === 'bearish';
        } else if (currentFilter === 'swing_bullish') {
            return ind.moving_average_crossovers?.swing_trading_cross?.status === 'bullish';
        } else if (currentFilter === 'swing_bearish') {
            return ind.moving_average_crossovers?.swing_trading_cross?.status === 'bearish';
        } else if (currentFilter === 'medium_bullish') {
            return ind.moving_average_crossovers?.medium_term_cross?.status === 'bullish';
        } else if (currentFilter === 'medium_bearish') {
            return ind.moving_average_crossovers?.medium_term_cross?.status === 'bearish';
        }
        return true; // 'all'
    });

    // 2. Sort
    if (sortKey) {
        filteredData.sort((a, b) => {
            let va = getSortValue(a, sortKey);
            let vb = getSortValue(b, sortKey);
            if (typeof va === 'string') {
                return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
            }
            return sortDir === 'asc' ? va - vb : vb - va;
        });
    }

    // 3. Paginate
    totalPages = Math.max(1, Math.ceil(filteredData.length / perPage));
    if (currentPage > totalPages) currentPage = totalPages;
    const start = (currentPage - 1) * perPage;
    const pageData = filteredData.slice(start, start + perPage);

    // 4. Render
    renderTable(pageData);
    renderPagination();
    updateStats();
    updateChipCounts();
}

function getSortValue(item, key) {
    const ind = item.indicators;
    switch (key) {
        case 'symbol': return item.symbol;
        case 'close': return ind.latest_close || 0;
        case 'rsi': return ind.rsi_14 || 0;
        case 'histogram': return ind.macd?.histogram || 0;
        case 'atr': return ind.atr_14 || 0;
        default: return 0;
    }
}

// ─── Helpers ────────────────────────────────────────
function getOverallTrend(ind) {
    const mac = ind.moving_average_crossovers;
    if (!mac) return 'neutral';
    const statuses = [
        mac.golden_cross_death_cross?.status,
        mac.short_term_cross?.status,
        mac.swing_trading_cross?.status,
        mac.medium_term_cross?.status
    ].filter(Boolean);
    const bullish = statuses.filter(s => s === 'bullish').length;
    const bearish = statuses.filter(s => s === 'bearish').length;
    if (bullish > bearish) return 'bullish';
    if (bearish > bullish) return 'bearish';
    return 'neutral';
}

function hasSignal(ind, signalType) {
    const mac = ind.moving_average_crossovers;
    if (!mac) return false;
    const crosses = [
        mac.golden_cross_death_cross,
        mac.short_term_cross,
        mac.swing_trading_cross,
        mac.medium_term_cross
    ];
    return crosses.some(c => c?.signal === signalType);
}

function getRsiColor(rsi) {
    if (rsi <= 30) return '#818cf8';
    if (rsi >= 70) return '#f59e0b';
    if (rsi <= 40) return '#34d399';
    if (rsi >= 60) return '#fb923c';
    return 'var(--text-primary)';
}

function getRsiBarColor(rsi) {
    if (rsi <= 30) return '#818cf8';
    if (rsi >= 70) return '#f59e0b';
    if (rsi < 50) return '#10b981';
    return '#ef4444';
}

// ─── Render Table ───────────────────────────────────
function renderTable(data) {
    const tbody = document.getElementById('screener-body');

    if (!data || data.length === 0) {
        tbody.innerHTML = `
            <tr><td colspan="8">
                <div class="screener-empty">
                    <i class="fas fa-search"></i>
                    <p>No symbols match your criteria</p>
                </div>
            </td></tr>`;
        return;
    }

    tbody.innerHTML = data.map(item => {
        const ind = item.indicators;
        const rsi = (ind.rsi_14 || 0).toFixed(2);
        const macdLine = (ind.macd?.macd_line || 0).toFixed(2);
        const signalLine = (ind.macd?.signal_line || 0).toFixed(2);
        const histogram = (ind.macd?.histogram || 0).toFixed(2);
        const atr = (ind.atr_14 || 0).toFixed(2);
        const close = (ind.latest_close || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const trend = getOverallTrend(ind);
        const mac = ind.moving_average_crossovers || {};

        // RSI badge
        let rsiBadge = '';
        const rsiVal = ind.rsi_14 || 0;
        if (rsiVal <= 30) rsiBadge = '<span class="signal-badge badge-oversold" style="margin-left:6px;font-size:0.6rem;">OVERSOLD</span>';
        else if (rsiVal >= 70) rsiBadge = '<span class="signal-badge badge-overbought" style="margin-left:6px;font-size:0.6rem;">OVERBOUGHT</span>';

        // Histogram bar
        const histVal = ind.macd?.histogram || 0;
        const histColor = histVal >= 0 ? '#10b981' : '#ef4444';
        const histBarH = Math.min(Math.abs(histVal) * 2, 20);

        // MA cross dots
        const crossDots = renderCrossDots(mac);

        // Trend badge
        let trendBadge = '';
        if (trend === 'bullish') trendBadge = '<span class="signal-badge badge-bullish"><i class="fas fa-arrow-trend-up" style="font-size:0.6rem;"></i> Bullish</span>';
        else if (trend === 'bearish') trendBadge = '<span class="signal-badge badge-bearish"><i class="fas fa-arrow-trend-down" style="font-size:0.6rem;"></i> Bearish</span>';
        else trendBadge = '<span class="signal-badge badge-neutral">Neutral</span>';

        return `
            <tr onclick="window.location.href='stock-details.html?symbol=${item.symbol}'">
                <td>
                    <div class="symbol-cell">
                        <div>
                            <div class="symbol-name">${item.symbol}</div>
                            <div class="symbol-date">${item.latest_traded_date || ''}</div>
                        </div>
                    </div>
                </td>
                <td style="font-weight:600;">Rs. ${close}</td>
                <td>
                    <div class="rsi-bar-container">
                        <div class="rsi-bar">
                            <div class="rsi-bar-fill" style="width:${rsiVal}%;background:${getRsiBarColor(rsiVal)};"></div>
                        </div>
                        <span class="rsi-bar-value" style="color:${getRsiColor(rsiVal)};">${rsi}</span>
                    </div>
                    ${rsiBadge}
                </td>
                <td>
                    <div style="font-size:0.78rem;">
                        <span style="color:var(--text-secondary);">M:</span> <span style="font-weight:600;">${macdLine}</span>
                        <span style="color:var(--text-secondary);margin-left:4px;">S:</span> <span style="font-weight:600;">${signalLine}</span>
                    </div>
                </td>
                <td>
                    <span class="macd-histogram-bar" style="background:${histColor};height:${histBarH}px;"></span>
                    <span style="color:${histColor};font-weight:700;">${histogram}</span>
                </td>
                <td style="font-weight:600;">${atr}</td>
                <td>${crossDots}</td>
                <td>${trendBadge}</td>
            </tr>`;
    }).join('');
}

function renderCrossDots(mac) {
    const crosses = [
        { key: 'golden_cross_death_cross', label: 'Golden/Death Cross (50/200 SMA)' },
        { key: 'short_term_cross', label: 'Short-term (5/20 SMA)' },
        { key: 'swing_trading_cross', label: 'Swing (10/50 SMA)' },
        { key: 'medium_term_cross', label: 'Medium-term (20/50 SMA)' }
    ];

    return `<div class="crossover-mini">${crosses.map(c => {
        const data = mac[c.key];
        if (!data) return '<span class="crossover-dot" style="background:var(--surface-border);"></span>';
        const cls = data.status === 'bullish' ? 'bullish' : 'bearish';
        const signalInfo = data.signal && data.signal !== 'none' ? ` — Signal: ${data.signal.replace('_', ' ')}` : '';
        return `<span class="crossover-dot ${cls}" title="${c.label}: ${data.status}${signalInfo}"></span>`;
    }).join('')}</div>`;
}

// ─── Update Stats ───────────────────────────────────
function updateStats() {
    const bullish = allData.filter(i => getOverallTrend(i.indicators) === 'bullish').length;
    const bearish = allData.filter(i => getOverallTrend(i.indicators) === 'bearish').length;
    const oversold = allData.filter(i => i.indicators.rsi_14 <= 30).length;
    const overbought = allData.filter(i => i.indicators.rsi_14 >= 70).length;

    document.getElementById('stat-bullish').textContent = bullish;
    document.getElementById('stat-bearish').textContent = bearish;
    document.getElementById('stat-oversold').textContent = oversold;
    document.getElementById('stat-overbought').textContent = overbought;
}

function updateChipCounts() {
    const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
    el('chip-all', allData.length);
    el('chip-bullish', allData.filter(i => getOverallTrend(i.indicators) === 'bullish').length);
    el('chip-bearish', allData.filter(i => getOverallTrend(i.indicators) === 'bearish').length);
    el('chip-oversold', allData.filter(i => i.indicators.rsi_14 <= 30).length);
    el('chip-overbought', allData.filter(i => i.indicators.rsi_14 >= 70).length);
}

// ─── Pagination ─────────────────────────────────────
function renderPagination() {
    const start = (currentPage - 1) * perPage + 1;
    const end = Math.min(currentPage * perPage, filteredData.length);
    document.getElementById('pagination-info').textContent =
        `Showing ${start}–${end} of ${filteredData.length} symbols${searchQuery ? ` (filtered)` : ''}`;

    const container = document.getElementById('pagination-controls');
    const buttons = [];

    // Prev
    buttons.push(`<button class="pagination-btn" ${currentPage <= 1 ? 'disabled' : ''} data-page="${currentPage - 1}"><i class="fas fa-chevron-left"></i></button>`);

    // Page numbers
    const pages = getPaginationRange(currentPage, totalPages);
    pages.forEach(p => {
        if (p === '...') {
            buttons.push('<span class="pagination-ellipsis">…</span>');
        } else {
            buttons.push(`<button class="pagination-btn ${p === currentPage ? 'active' : ''}" data-page="${p}">${p}</button>`);
        }
    });

    // Next
    buttons.push(`<button class="pagination-btn" ${currentPage >= totalPages ? 'disabled' : ''} data-page="${currentPage + 1}"><i class="fas fa-chevron-right"></i></button>`);

    container.innerHTML = buttons.join('');

    // Bind pagination clicks
    container.querySelectorAll('.pagination-btn:not(:disabled)').forEach(btn => {
        btn.addEventListener('click', () => {
            currentPage = parseInt(btn.dataset.page);
            applyFiltersAndRender();
            // Scroll to top of table
            document.getElementById('screener-table').scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });
}

function getPaginationRange(current, total) {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    if (current <= 3) return [1, 2, 3, 4, '...', total];
    if (current >= total - 2) return [1, '...', total - 3, total - 2, total - 1, total];
    return [1, '...', current - 1, current, current + 1, '...', total];
}

// ─── Skeleton Loading ───────────────────────────────
function showSkeletonRows() {
    const tbody = document.getElementById('screener-body');
    tbody.innerHTML = Array.from({ length: 10 }, () => `
        <tr class="skeleton-row">
            <td><div class="skel-line" style="width:70px;"></div></td>
            <td><div class="skel-line" style="width:80px;"></div></td>
            <td><div class="skel-line" style="width:100px;"></div></td>
            <td><div class="skel-line" style="width:120px;"></div></td>
            <td><div class="skel-line" style="width:60px;"></div></td>
            <td><div class="skel-line" style="width:50px;"></div></td>
            <td><div class="skel-line" style="width:60px;"></div></td>
            <td><div class="skel-line" style="width:70px;"></div></td>
        </tr>
    `).join('');
}

function showEmpty(msg) {
    document.getElementById('screener-body').innerHTML = `
        <tr><td colspan="8">
            <div class="screener-empty">
                <i class="fas fa-exclamation-triangle"></i>
                <p>${msg}</p>
            </div>
        </td></tr>`;
    document.getElementById('pagination-info').textContent = '';
    document.getElementById('pagination-controls').innerHTML = '';
}

document.addEventListener('DOMContentLoaded', init);
