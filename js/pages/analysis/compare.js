import globalState from '../../state.js';
import { Layout } from '../../layout.js';
import DataService from '../../../services/dataService.js';
import NotificationService from '../../../services/notificationService.js';

// Configuration
const COLORS = [
    '#38bdf8', // Sky Blue
    '#10b981', // Emerald Green
    '#f43f5e', // Rose Red
    '#fbbf24'  // Amber Gold
];

// State
let selectedSymbols = [];
let allStocks = [];
let activePeriod = '1M';
let compareChart = null;
let matrixData = {}; // Cache of loaded stock details

// ─── Init ───────────────────────────────────────────
async function init() {
    globalState.setState({ activePage: 'compare' });
    await Layout.init();

    // Layout.init() already fetches and sets stocks in globalState.
    // Read them directly from state to avoid a redundant/racing fetch.
    const stateStocks = globalState.getState().stocks;
    if (Array.isArray(stateStocks) && stateStocks.length > 0) {
        allStocks = stateStocks;
    } else {
        // Fallback: fetch directly if state is still empty (e.g., cold start failure)
        try {
            allStocks = await DataService.getLiveMarket();
        } catch (err) {
            console.error('Failed to load market data for compare:', err);
        }
    }

    // Subscribe so allStocks updates if globalState refreshes later
    globalState.subscribe((state) => {
        if (Array.isArray(state.stocks) && state.stocks.length > 0) {
            allStocks = state.stocks;
        }
    });

    bindEvents();
    restoreFromQueryParam();
}

// ─── Bind Events ────────────────────────────────────
function bindEvents() {
    const searchInput = document.getElementById('compare-search');
    const resultsDiv = document.getElementById('compare-search-results');

    // Auto-complete typing
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim().toUpperCase();
        if (!query) {
            resultsDiv.classList.add('hidden');
            resultsDiv.innerHTML = '';
            return;
        }

        const matches = allStocks.filter(s =>
            s.symbol.toUpperCase().includes(query) ||
            (s.name && s.name.toUpperCase().includes(query))
        ).slice(0, 8);

        if (matches.length === 0) {
            resultsDiv.innerHTML = `
                <div style="padding: 12px 16px; color: var(--text-secondary); font-size: 0.85rem; text-align: center;">
                    No stocks match "${query}"
                </div>
            `;
            resultsDiv.classList.remove('hidden');
            return;
        }

        resultsDiv.innerHTML = matches.map(s => {
            const price = parseFloat(s.price || 0);
            const change = parseFloat(s.changePercent || 0);
            const trendClass = change >= 0 ? 'text-primary' : 'text-danger';
            const sign = change >= 0 ? '+' : '';

            return `
                <div class="autocomplete-item" data-symbol="${s.symbol}">
                    <div>
                        <span class="symbol">${s.symbol}</span>
                        <span class="name" style="margin-left: 8px;">${s.name || ''}</span>
                    </div>
                    <div style="text-align: right;">
                        <div class="price">Rs. ${price.toFixed(2)}</div>
                        <div class="${trendClass}" style="font-size: 0.75rem; font-weight: 700;">${sign}${change.toFixed(2)}%</div>
                    </div>
                </div>
            `;
        }).join('');
        resultsDiv.classList.remove('hidden');
    });

    // Autocomplete item click
    resultsDiv.addEventListener('mousedown', (e) => {
        const item = e.target.closest('.autocomplete-item');
        if (!item) return;

        const symbol = item.dataset.symbol;
        addSymbol(symbol);

        searchInput.value = '';
        resultsDiv.classList.add('hidden');
        resultsDiv.innerHTML = '';
    });

    // Close autocomplete on click outside
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !resultsDiv.contains(e.target)) {
            resultsDiv.classList.add('hidden');
        }
    });

    // Focus input to re-show if non-empty
    searchInput.addEventListener('focus', () => {
        if (searchInput.value.trim()) {
            searchInput.dispatchEvent(new Event('input'));
        }
    });

    // Chart period buttons
    const periodButtons = document.querySelectorAll('.chart-period-toggles .period-btn');
    periodButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            periodButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activePeriod = btn.dataset.period;
            
            if (selectedSymbols.length > 0) {
                renderChart();
            }
        });
    });
}

// ─── Restore from Query Parameters ──────────────────
function restoreFromQueryParam() {
    const params = new URLSearchParams(window.location.search);
    const symbolsParam = params.get('symbols') || params.get('symbol');
    if (symbolsParam) {
        const symbols = symbolsParam.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
        symbols.slice(0, 4).forEach(symbol => {
            if (allStocks.some(s => s.symbol === symbol)) {
                selectedSymbols.push(symbol);
            }
        });
        updateDashboard();
    }
}

// ─── Add Stock to Selection ─────────────────────────
function addSymbol(symbol) {
    const upperSymbol = symbol.toUpperCase();
    if (selectedSymbols.includes(upperSymbol)) {
        NotificationService.showToast('Already Selected', `${upperSymbol} is already in the comparison list.`, 'stoploss');
        return;
    }

    if (selectedSymbols.length >= 4) {
        NotificationService.showToast('Limit Reached', 'You can compare a maximum of 4 stocks side-by-side.', 'stoploss');
        return;
    }

    selectedSymbols.push(upperSymbol);
    updateDashboard();

    // Update URL query params silently for easy sharing
    const newUrl = `${window.location.pathname}?symbols=${selectedSymbols.join(',')}`;
    window.history.replaceState({ path: newUrl }, '', newUrl);
}

// ─── Remove Stock from Selection ──────────────────────
function removeSymbol(symbol) {
    const upperSymbol = symbol.toUpperCase();
    selectedSymbols = selectedSymbols.filter(s => s !== upperSymbol);
    delete matrixData[upperSymbol];

    updateDashboard();

    // Update URL query params
    const newUrl = selectedSymbols.length > 0 
        ? `${window.location.pathname}?symbols=${selectedSymbols.join(',')}`
        : window.location.pathname;
    window.history.replaceState({ path: newUrl }, '', newUrl);
}

// ─── Update UI Dashboard ─────────────────────────────
function updateDashboard() {
    const emptyState = document.getElementById('compare-empty-state');
    const dashboard = document.getElementById('compare-dashboard');

    if (selectedSymbols.length === 0) {
        emptyState.classList.remove('hidden');
        dashboard.classList.add('hidden');
        if (compareChart) {
            compareChart.destroy();
            compareChart = null;
        }
        renderTags();
        return;
    }

    emptyState.classList.add('hidden');
    dashboard.classList.remove('hidden');

    renderTags();
    loadAndRenderMatrix();
    renderChart();
}

// ─── Render Tags Row ──────────────────────────────────
function renderTags() {
    const container = document.getElementById('selected-symbols-tags');
    if (!container) return;

    if (selectedSymbols.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = selectedSymbols.map((symbol, idx) => {
        return `
            <div class="compare-tag" style="border-color: ${COLORS[idx % COLORS.length]}80; background: ${COLORS[idx % COLORS.length]}10;">
                <span style="color: ${COLORS[idx % COLORS.length]}; font-weight: 800; font-family: monospace;">●</span>
                <span>${symbol}</span>
                <i class="fas fa-times remove-btn" data-symbol="${symbol}"></i>
            </div>
        `;
    }).join('');

    // Bind remove button clicks
    container.querySelectorAll('.remove-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeSymbol(btn.dataset.symbol);
        });
    });
}

// ─── Load & Render Comparison Matrix Table ───────────
async function loadAndRenderMatrix() {
    const table = document.getElementById('compare-matrix-table');
    if (!table) return;

    // 1. Initialise table with headers and shimmers
    renderShimmerMatrix(table);

    // 2. Fetch data in parallel for all selected symbols
    const promises = selectedSymbols.map(async (symbol) => {
        try {
            // Find basic stock info in pre-fetched list
            const liveStock = allStocks.find(s => s.symbol === symbol) || {};

            // Fetch detail services
            const [profile, alphaBeta, technical, broker] = await Promise.all([
                DataService.getStockProfile(symbol),
                DataService.getAlphaBeta(symbol),
                DataService.getTechnicalIndicators(symbol),
                DataService.getBrokerTopHolding(symbol, 1)
            ]);

            return {
                symbol,
                name: liveStock.name || (profile && profile.companyName) || 'Unknown Company',
                sector: liveStock.sector || (profile && profile.sector) || 'Other',
                price: parseFloat(liveStock.price) || 0,
                change: parseFloat(liveStock.changePercent) || 0,
                high: parseFloat(liveStock.high) || 0,
                low: parseFloat(liveStock.low) || 0,
                open: parseFloat(liveStock.open) || 0,
                volume: parseFloat(liveStock.volume) || 0,
                turnover: parseFloat(liveStock.turnover) || 0,
                beta: extractBeta(alphaBeta),
                alpha: extractAlpha(alphaBeta),
                rsi: technical && technical.indicators ? parseFloat(technical.indicators.rsi_14) : null,
                trend: technical && technical.indicators ? getOverallTrend(technical.indicators) : 'Neutral',
                topBroker: extractTopBroker(broker)
            };
        } catch (err) {
            console.error(`Failed to fetch complete data for ${symbol}:`, err);
            return {
                symbol,
                name: symbol,
                sector: 'Other',
                price: 0,
                change: 0,
                high: 0,
                low: 0,
                open: 0,
                volume: 0,
                turnover: 0,
                beta: null,
                alpha: null,
                rsi: null,
                trend: 'Neutral',
                topBroker: null
            };
        }
    });

    const results = await Promise.all(promises);
    
    // Store in matrixData cache
    results.forEach(res => {
        matrixData[res.symbol] = res;
    });

    // 3. Render final table content
    renderMatrixTable(table, results);
}

// ─── Render Shimmer Matrix Placeholder ───────────────
function renderShimmerMatrix(table) {
    const headerCols = selectedSymbols.map(sym => `
        <th>
            <div class="compare-stock-header">
                <span class="sym">${sym}</span>
                <div class="compare-shimmer" style="width: 80px; height: 12px; margin-top: 4px;"></div>
            </div>
        </th>
    `).join('');

    const shimmerCols = selectedSymbols.map(() => `
        <td><div class="compare-shimmer" style="width: 60px;"></div></td>
    `).join('');

    table.innerHTML = `
        <thead>
            <tr>
                <th style="width: 200px;">Metric</th>
                ${headerCols}
            </tr>
        </thead>
        <tbody>
            <tr><td>LTP (Rs.)</td>${shimmerCols}</tr>
            <tr><td>Change (%)</td>${shimmerCols}</tr>
            <tr><td>Today's High</td>${shimmerCols}</tr>
            <tr><td>Today's Low</td>${shimmerCols}</tr>
            <tr><td>Today's Open</td>${shimmerCols}</tr>
            <tr><td>Volume</td>${shimmerCols}</tr>
            <tr><td>Turnover (Rs.)</td>${shimmerCols}</tr>
            <tr><td>Beta</td>${shimmerCols}</tr>
            <tr><td>Alpha</td>${shimmerCols}</tr>
            <tr><td>Technical Trend</td>${shimmerCols}</tr>
            <tr><td>RSI (14)</td>${shimmerCols}</tr>
            <tr><td>Top Buyer Broker</td>${shimmerCols}</tr>
            <tr><td>Actions</td>${shimmerCols}</tr>
        </tbody>
    `;
}

// ─── Render Final Matrix Table ───────────────────────
function renderMatrixTable(table, stocks) {
    // Helper: Highlights index of highest/lowest in row
    const ltpHighlights = findHighestAndLowest(stocks, s => s.price);
    const changeHighlights = findHighestAndLowest(stocks, s => s.change);
    const volumeHighlights = findHighestAndLowest(stocks, s => s.volume);
    const turnoverHighlights = findHighestAndLowest(stocks, s => s.turnover);
    const betaHighlights = findHighestAndLowest(stocks, s => s.beta);
    const alphaHighlights = findHighestAndLowest(stocks, s => s.alpha);

    // Build parts
    const headerRow = `
        <thead>
            <tr>
                <th>Metric</th>
                ${stocks.map((s, idx) => `
                    <th>
                        <div class="compare-stock-header">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span class="sym" style="color: ${COLORS[idx % COLORS.length]};">${s.symbol}</span>
                                <i class="fas fa-times-circle remove-btn" 
                                   style="cursor: pointer; color: var(--text-secondary); font-size: 0.85rem; margin-left: 6px;" 
                                   data-symbol="${s.symbol}" title="Remove"></i>
                            </div>
                            <span class="name" title="${s.name}">${s.name}</span>
                            <span class="sector-badge">${s.sector}</span>
                        </div>
                    </th>
                `).join('')}
            </tr>
        </thead>
    `;

    // Row builders
    const getCellClass = (idx, highlights) => {
        if (idx === highlights.highestIndex) return 'class="metric-highest"';
        if (idx === highlights.lowestIndex) return 'class="metric-lowest"';
        return '';
    };

    const tbody = `
        <tbody>
            <tr>
                <td>LTP (Rs.)</td>
                ${stocks.map((s, idx) => `
                    <td ${getCellClass(idx, ltpHighlights)} style="font-weight: 700;">
                        Rs. ${s.price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                `).join('')}
            </tr>
            <tr>
                <td>Change (%)</td>
                ${stocks.map((s, idx) => {
                    const sign = s.change >= 0 ? '+' : '';
                    const color = s.change >= 0 ? '#10b981' : '#f43f5e';
                    return `
                        <td ${getCellClass(idx, changeHighlights)} style="font-weight: 700; color: ${color};">
                            ${sign}${s.change.toFixed(2)}%
                        </td>
                    `;
                }).join('')}
            </tr>
            <tr>
                <td>Today's High</td>
                ${stocks.map(s => `<td>Rs. ${s.high.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>`).join('')}
            </tr>
            <tr>
                <td>Today's Low</td>
                ${stocks.map(s => `<td>Rs. ${s.low.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>`).join('')}
            </tr>
            <tr>
                <td>Today's Open</td>
                ${stocks.map(s => `<td>Rs. ${s.open.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>`).join('')}
            </tr>
            <tr>
                <td>Volume (Qty)</td>
                ${stocks.map((s, idx) => `
                    <td ${getCellClass(idx, volumeHighlights)}>
                        ${s.volume > 0 ? Math.round(s.volume).toLocaleString() : '—'}
                    </td>
                `).join('')}
            </tr>
            <tr>
                <td>Turnover (Rs.)</td>
                ${stocks.map((s, idx) => `
                    <td ${getCellClass(idx, turnoverHighlights)}>
                        ${s.turnover > 0 ? `Rs. ${Math.round(s.turnover).toLocaleString()}` : '—'}
                    </td>
                `).join('')}
            </tr>
            <tr>
                <td>Beta</td>
                ${stocks.map((s, idx) => `
                    <td ${getCellClass(idx, betaHighlights)}>
                        ${s.beta !== null ? s.beta.toFixed(3) : '—'}
                    </td>
                `).join('')}
            </tr>
            <tr>
                <td>Alpha</td>
                ${stocks.map((s, idx) => `
                    <td ${getCellClass(idx, alphaHighlights)}>
                        ${s.alpha !== null ? s.alpha.toFixed(3) : '—'}
                    </td>
                `).join('')}
            </tr>
            <tr>
                <td>Technical Trend</td>
                ${stocks.map(s => {
                    let trendBadge = '<span class="signal-badge badge-neutral">Neutral</span>';
                    if (s.trend === 'Bullish') {
                        trendBadge = '<span class="signal-badge badge-bullish" style="padding: 2px 8px; font-size: 0.75rem;"><i class="fas fa-arrow-trend-up"></i> Bullish</span>';
                    } else if (s.trend === 'Bearish') {
                        trendBadge = '<span class="signal-badge badge-bearish" style="padding: 2px 8px; font-size: 0.75rem;"><i class="fas fa-arrow-trend-down"></i> Bearish</span>';
                    }
                    return `<td>${trendBadge}</td>`;
                }).join('')}
            </tr>
            <tr>
                <td>RSI (14)</td>
                ${stocks.map(s => {
                    if (s.rsi === null) return '<td>—</td>';
                    let rsiBadge = '';
                    if (s.rsi <= 30) rsiBadge = '<span class="signal-badge badge-oversold" style="margin-left: 6px; font-size: 0.65rem;">OVERSOLD</span>';
                    else if (s.rsi >= 70) rsiBadge = '<span class="signal-badge badge-overbought" style="margin-left: 6px; font-size: 0.65rem;">OVERBOUGHT</span>';
                    return `
                        <td>
                            <span style="font-weight: 600;">${s.rsi.toFixed(2)}</span>
                            ${rsiBadge}
                        </td>
                    `;
                }).join('')}
            </tr>
            <tr>
                <td>Top Buyer Broker</td>
                ${stocks.map(s => `
                    <td style="font-size: 0.85rem; color: var(--text-secondary);">
                        ${s.topBroker || '—'}
                    </td>
                `).join('')}
            </tr>
            <tr>
                <td>Actions</td>
                ${stocks.map(s => `
                    <td>
                        <div class="compare-action-btns">
                            <button class="btn-sm details-btn" onclick="window.location.href='../market/stock-details.html?symbol=${s.symbol}'" title="View details">Details</button>
                            <button class="btn-sm" onclick="window.location.href='../calculator/planner.html?symbol=${s.symbol}'" title="Open planner">Plan</button>
                            <button class="btn-sm" onclick="window.location.href='../calculator/buy-sell.html?symbol=${s.symbol}'" title="Calculate buy/sell costs">Trade</button>
                        </div>
                    </td>
                `).join('')}
            </tr>
        </tbody>
    `;

    table.innerHTML = headerRow + tbody;

    // Bind inline remove buttons
    table.querySelectorAll('.remove-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeSymbol(btn.dataset.symbol);
        });
    });
}

// ─── Render Chart ────────────────────────────────────
async function renderChart() {
    const canvas = document.getElementById('compare-perf-chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    // Union of all dates, caches of closes
    const allDatesSet = new Set();
    const stockClosesMap = {};
    const firstPricesMap = {};

    try {
        const fetchClosesPromises = selectedSymbols.map(async (symbol) => {
            const closes = await DataService.getHistoricalCloses(symbol, activePeriod);
            if (closes && closes.length > 0) {
                stockClosesMap[symbol] = closes;
                firstPricesMap[symbol] = closes[0].close;
                closes.forEach(c => allDatesSet.add(c.date));
            }
        });

        await Promise.all(fetchClosesPromises);

        const sortedDates = Array.from(allDatesSet).sort();

        if (sortedDates.length === 0) {
            if (compareChart) {
                compareChart.destroy();
                compareChart = null;
            }
            return;
        }

        // Build datasets
        const datasets = selectedSymbols.map((symbol, idx) => {
            const closes = stockClosesMap[symbol] || [];
            const firstPrice = firstPricesMap[symbol] || 0;

            if (!firstPrice || closes.length === 0) return null;

            let lastPrice = firstPrice;
            const dataPoints = sortedDates.map(date => {
                const matched = closes.find(c => c.date === date);
                if (matched) {
                    lastPrice = matched.close;
                }
                return ((lastPrice - firstPrice) / firstPrice) * 100;
            });

            return {
                label: symbol,
                data: dataPoints,
                borderColor: COLORS[idx % COLORS.length],
                backgroundColor: `${COLORS[idx % COLORS.length]}1A`,
                borderWidth: 2.5,
                pointRadius: sortedDates.length > 30 ? 0 : 2,
                pointHoverRadius: 5,
                fill: false,
                tension: 0.15
            };
        }).filter(Boolean);

        if (compareChart) {
            compareChart.destroy();
        }

        compareChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: sortedDates.map(d => formatDateLabel(d)),
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            color: '#e2e8f0',
                            font: {
                                family: 'Outfit',
                                weight: 600
                            }
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.95)',
                        titleColor: '#fff',
                        bodyColor: '#e2e8f0',
                        borderColor: 'rgba(255, 255, 255, 0.1)',
                        borderWidth: 1,
                        padding: 12,
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.y !== null) {
                                    const sign = context.parsed.y >= 0 ? '+' : '';
                                    label += sign + context.parsed.y.toFixed(2) + '%';
                                }
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: {
                            color: 'rgba(255, 255, 255, 0.05)'
                        },
                        ticks: {
                            color: '#94a3b8',
                            font: {
                                family: 'Outfit',
                                size: 10
                            },
                            maxTicksLimit: 12
                        }
                    },
                    y: {
                        grid: {
                            color: 'rgba(255, 255, 255, 0.05)'
                        },
                        ticks: {
                            color: '#94a3b8',
                            font: {
                                family: 'Outfit'
                            },
                            callback: function(value) {
                                return (value >= 0 ? '+' : '') + value.toFixed(1) + '%';
                            }
                        }
                    }
                }
            }
        });

    } catch (err) {
        console.error('Failed to plot performance comparison chart:', err);
    }
}

// ─── Utility Helpers ─────────────────────────────────

function formatDateLabel(dateStr) {
    try {
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            const date = new Date(parts[0], parts[1] - 1, parts[2]);
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }
        return dateStr;
    } catch (e) {
        return dateStr;
    }
}

function findHighestAndLowest(stocks, extractor) {
    let highestIndex = -1;
    let lowestIndex = -1;
    let highestValue = -Infinity;
    let lowestValue = Infinity;

    stocks.forEach((stock, index) => {
        const val = extractor(stock);
        if (val === null || val === undefined || isNaN(val) || val === 0) return;

        if (val > highestValue) {
            highestValue = val;
            highestIndex = index;
        }
        if (val < lowestValue) {
            lowestValue = val;
            lowestIndex = index;
        }
    });

    const validCount = stocks.filter(s => {
        const v = extractor(s);
        return v !== null && v !== undefined && !isNaN(v) && v !== 0;
    }).length;

    if (validCount < 2 || highestValue === lowestValue) {
        return { highestIndex: -1, lowestIndex: -1 };
    }

    return { highestIndex, lowestIndex };
}

function extractBeta(alphaBeta) {
    if (!alphaBeta) return null;
    const b = alphaBeta.beta ?? alphaBeta.betaValue ?? alphaBeta.Beta ?? alphaBeta.data?.beta;
    return b !== undefined && b !== null ? parseFloat(b) : null;
}

function extractAlpha(alphaBeta) {
    if (!alphaBeta) return null;
    const a = alphaBeta.alpha ?? alphaBeta.alphaValue ?? alphaBeta.Alpha ?? alphaBeta.data?.alpha;
    return a !== undefined && a !== null ? parseFloat(a) : null;
}

function extractTopBroker(brokerData) {
    if (!brokerData) return null;
    const holdings = Array.isArray(brokerData) ? brokerData : ((brokerData && brokerData.value) ? brokerData.value : []);
    if (holdings.length === 0) return null;

    const brokerMap = {};
    holdings.forEach(item => {
        const brokerId = item.buyer;
        const quantity = parseFloat(item.quantity) || 0;
        if (!brokerMap[brokerId]) {
            brokerMap[brokerId] = 0;
        }
        brokerMap[brokerId] += quantity;
    });

    const sorted = Object.entries(brokerMap).sort((a, b) => b[1] - a[1]);
    if (sorted.length > 0) {
        return `Broker #${sorted[0][0]} (${Math.round(sorted[0][1]).toLocaleString()} Units)`;
    }
    return null;
}

function getOverallTrend(ind) {
    if (!ind) return 'Neutral';
    const mac = ind.moving_average_crossovers;
    if (!mac) return 'Neutral';
    const statuses = [
        mac.golden_cross_death_cross?.status,
        mac.short_term_cross?.status,
        mac.swing_trading_cross?.status,
        mac.medium_term_cross?.status
    ].filter(Boolean);
    const bullish = statuses.filter(s => s === 'bullish').length;
    const bearish = statuses.filter(s => s === 'bearish').length;
    if (bullish > bearish) return 'Bullish';
    if (bearish > bullish) return 'Bearish';
    return 'Neutral';
}

document.addEventListener('DOMContentLoaded', init);
