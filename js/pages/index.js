import globalState from '../state.js';
import { Layout } from '../layout.js';
import DataService from '../../services/dataService.js';
import StorageService from '../../services/storageService.js';

let marketData = [];
let marketSummary = null;
let indexData = null;
let subindexData = [];
let mainChart = null;
let activePeriod = '1D';
let activeChartSymbol = 'NEPSE';

// ─────────────────────────────────────────────
// SECTOR COLORS (consistent mapping)
// ─────────────────────────────────────────────
const SECTOR_COLORS = {
    'Banking':           '#6366f1',
    'Development Bank':  '#8b5cf6',
    'Finance':           '#a78bfa',
    'Hotels And Tourism':'#f59e0b',
    'HydroPower':        '#22d3ee',
    'Investment':        '#14b8a6',
    'Life Insurance':    '#10b981',
    'Manu.& Pro.':       '#f97316',
    'Microfinance':      '#ec4899',
    'Mutual Fund':       '#64748b',
    'Non Life Insurance':'#06b6d4',
    'Others':            '#78716c',
    'Trading':           '#eab308'
};

async function init() {
    globalState.setState({ activePage: 'index' });
    await Layout.init();
    
    initChartTabs();
    await refresh();
    
    // Reload Market Turnover API (every 2.5 seconds when open)
    setInterval(async () => {
        const marketOpen = await DataService.checkMarketStatus();
        if (!marketOpen) return;
        const summary = await DataService.getMarketSummary();
        if (summary) {
            marketSummary = summary;
            renderPulseCards();
        }
    }, 2500);

    // Reload Homepage Data, Index Live, Subindex Live, Chart 1D API (every 5 seconds when open)
    setInterval(async () => {
        const marketOpen = await DataService.checkMarketStatus();
        if (!marketOpen) return;
        await refresh();
    }, 5000);
}

function initChartTabs() {
    const tabContainer = document.getElementById('nepse-chart-tabs');
    if (tabContainer) {
        tabContainer.addEventListener('click', (e) => {
            const tab = e.target.closest('.chart-tab');
            if (!tab) return;

            const period = tab.dataset.period;
            if (period === activePeriod) return;

            tabContainer.querySelectorAll('.chart-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            activePeriod = period;
            renderMainChart();
        });
    }

    // Custom dropdown trigger binding
    const trigger = document.getElementById('dropdown-trigger-btn');
    const menu = document.getElementById('dropdown-menu-list');
    const dropdownWrap = document.getElementById('chart-index-dropdown');

    if (trigger && menu) {
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            menu.classList.toggle('show');
            dropdownWrap.classList.toggle('open');
        });

        // Document click listener to close dropdown when clicking outside
        document.addEventListener('click', () => {
            menu.classList.remove('show');
            dropdownWrap.classList.remove('open');
        });

        // Click listeners on items inside dropdown menu list
        menu.addEventListener('click', (e) => {
            const item = e.target.closest('.dropdown-item');
            if (!item) return;

            const val = item.dataset.value;
            if (!val) return;

            activeChartSymbol = val;
            
            // Update selected label
            const labelEl = document.getElementById('selected-index-label');
            if (labelEl) {
                labelEl.innerText = item.innerText;
            }

            // Set active class
            menu.querySelectorAll('.dropdown-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            menu.classList.remove('show');
            dropdownWrap.classList.remove('open');

            renderMainChart();
        });
    }
}

function populateSubindexDropdown() {
    const subitemsContainer = document.getElementById('custom-subindex-items');
    if (!subitemsContainer || !subindexData || subindexData.length === 0) return;

    // Only populate once
    if (subitemsContainer.children.length > 0) return;

    subitemsContainer.innerHTML = subindexData.map(item => {
        return `<div class="dropdown-item" data-value="${item.indexName}">${item.indexName}</div>`;
    }).join('');
}

function updateChartHeader() {
    let currentVal = 0;
    let diff = 0;
    let pct = 0;
    let dateStr = '';

    const dataObj = findIndexData(activeChartSymbol);
    if (dataObj) {
        currentVal = dataObj.indexValue;
        diff = dataObj.difference;
        pct = dataObj.percentChange;
        dateStr = dataObj.asOfDateString || '';
    }

    const isUp = diff >= 0;
    const arrow = isUp ? '↑' : '↓';
    const color = isUp ? '#10b981' : '#ef4444';

    const priceValEl = document.getElementById('chart-price-val');
    if (priceValEl) {
        const newVal = currentVal.toLocaleString('en-IN', { minimumFractionDigits: 2 });
        if (priceValEl.innerText !== newVal) {
            priceValEl.innerText = newVal;
        }
        if (priceValEl.style.color !== color) {
            priceValEl.style.color = color;
        }
    }

    const priceDiffEl = document.getElementById('chart-price-diff');
    if (priceDiffEl) {
        const newVal = `${isUp ? '+' : ''}${diff.toFixed(2)}`;
        if (priceDiffEl.innerText !== newVal) {
            priceDiffEl.innerText = newVal;
        }
        if (priceDiffEl.style.color !== color) {
            priceDiffEl.style.color = color;
        }
    }

    const pricePctEl = document.getElementById('chart-price-pct');
    if (pricePctEl) {
        const newVal = `${arrow} ${Math.abs(pct).toFixed(2)}%`;
        if (pricePctEl.innerText !== newVal) {
            pricePctEl.innerText = newVal;
        }
        const newClass = `chart-header-pct-badge ${isUp ? 'up' : 'down'}`;
        if (pricePctEl.className !== newClass) {
            pricePctEl.className = newClass;
        }
    }

    const timestampEl = document.getElementById('chart-timestamp-val');
    if (timestampEl) {
        const newVal = dateStr.replace('As of ', '');
        if (timestampEl.innerText !== newVal) {
            timestampEl.innerText = newVal;
        }
    }
}

// ─────────────────────────────────────────────
// DATA REFRESH
// ─────────────────────────────────────────────
async function refresh() {
    try {
        if (marketData.length === 0) {
            renderSkeletons();
        }
        const [liveData, summary, indices, subindices] = await Promise.allSettled([
            DataService.getLiveMarket(),
            DataService.getMarketSummary(),
            DataService.getIndices(),
            DataService.getSectorIndices()
        ]);
        
        // Preserve existing data if the new response is empty or failed
        if (liveData.status === 'fulfilled' && Array.isArray(liveData.value) && liveData.value.length > 0) {
            marketData = liveData.value;
        }
        
        if (summary.status === 'fulfilled' && summary.value) {
            marketSummary = summary.value;
        }
        
        // Parse index response: { statusCode, message, result: [...] }
        let indexParsed = null;
        if (indices.status === 'fulfilled' && indices.value) {
            const raw = indices.value;
            indexParsed = raw.result || raw.data || (Array.isArray(raw) ? raw : null);
        }
        // Fallback to homepage data index cache if indices API failed or returned empty
        if (!Array.isArray(indexParsed) || indexParsed.length === 0) {
            const homepageIndices = DataService.getHomepageIndices();
            if (Array.isArray(homepageIndices) && homepageIndices.length > 0) {
                indexParsed = homepageIndices;
            }
        }
        if (Array.isArray(indexParsed) && indexParsed.length > 0) {
            indexData = normalizeIndexData(indexParsed);
        }

        let subindexParsed = null;
        if (subindices.status === 'fulfilled' && subindices.value) {
            const raw = subindices.value;
            subindexParsed = raw.result || raw.data || (Array.isArray(raw) ? raw : null);
        }
        // Fallback to homepage data subindices cache if subindices API failed or returned empty
        if (!Array.isArray(subindexParsed) || subindexParsed.length === 0) {
            const homepageSubindices = DataService.getHomepageSubIndices();
            if (Array.isArray(homepageSubindices) && homepageSubindices.length > 0) {
                subindexParsed = homepageSubindices;
            }
        }
        if (Array.isArray(subindexParsed) && subindexParsed.length > 0) {
            subindexData = normalizeIndexData(subindexParsed);
        }

        render();
    } catch (error) {
        console.error('Error refreshing dashboard:', error);
    }
}

function renderSkeletons() {
    const subBody = document.getElementById("subindex-body");
    const gainersBody = document.getElementById("top-gainers-body");
    const losersBody = document.getElementById("top-losers-body");
    const turnoverBody = document.getElementById("top-turnover-body");
    const volumeBody = document.getElementById("top-volume-body");
    const miniCards = document.getElementById("mini-index-cards");
    const watchlistContainer = document.getElementById("hero-watchlist-pills");

    if (subBody) {
        let html = "";
        for (let i = 0; i < 4; i++) {
            html += `
                <tr class="skeleton-row">
                    <td>
                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                            <div class="skeleton-line circle" style="width: 8px; height: 8px; min-width: 8px;"></div>
                            <div class="skeleton-line" style="width: ${90 + (i % 2) * 20}px;"></div>
                        </div>
                    </td>
                    <td><div class="skeleton-line" style="width: 70px;"></div></td>
                    <td><div class="skeleton-line" style="width: 50px;"></div></td>
                    <td><div class="skeleton-line pill"></div></td>
                    <td class="hide-mobile"><div class="skeleton-line" style="width: 90px;"></div></td>
                    <td class="hide-mobile"><div class="skeleton-line" style="width: 80px;"></div></td>
                    <td class="hide-mobile"><div class="skeleton-line" style="width: 40px;"></div></td>
                </tr>
            `;
        }
        subBody.innerHTML = html;
    }

    const renderMiniRows = (tbody) => {
        if (!tbody) return;
        tbody.innerHTML = `
            <tr class="skeleton-row">
                <td><div class="skeleton-line" style="width: 50px;"></div></td>
                <td><div class="skeleton-line" style="width: 60px;"></div></td>
                <td><div class="skeleton-line pill" style="width: 50px;"></div></td>
            </tr>
            <tr class="skeleton-row">
                <td><div class="skeleton-line" style="width: 45px;"></div></td>
                <td><div class="skeleton-line" style="width: 55px;"></div></td>
                <td><div class="skeleton-line pill" style="width: 50px;"></div></td>
            </tr>
            <tr class="skeleton-row">
                <td><div class="skeleton-line" style="width: 55px;"></div></td>
                <td><div class="skeleton-line" style="width: 65px;"></div></td>
                <td><div class="skeleton-line pill" style="width: 50px;"></div></td>
            </tr>
        `;
    };

    renderMiniRows(gainersBody);
    renderMiniRows(losersBody);
    renderMiniRows(turnoverBody);
    renderMiniRows(volumeBody);

    if (miniCards) {
        miniCards.innerHTML = `
            <div class="glass mini-idx-card skeleton-card">
                <div class="mini-idx-info">
                    <div class="skeleton-line short" style="height: 10px;"></div>
                    <div class="skeleton-line" style="width: 80px; height: 16px; margin-top: 4px;"></div>
                </div>
                <div class="skeleton-line pill"></div>
            </div>
            <div class="glass mini-idx-card skeleton-card">
                <div class="mini-idx-info">
                    <div class="skeleton-line short" style="height: 10px;"></div>
                    <div class="skeleton-line" style="width: 80px; height: 16px; margin-top: 4px;"></div>
                </div>
                <div class="skeleton-line pill"></div>
            </div>
            <div class="glass mini-idx-card skeleton-card">
                <div class="mini-idx-info">
                    <div class="skeleton-line short" style="height: 10px;"></div>
                    <div class="skeleton-line" style="width: 80px; height: 16px; margin-top: 4px;"></div>
                </div>
                <div class="skeleton-line pill"></div>
            </div>
        `;
    }

    if (watchlistContainer) {
        watchlistContainer.innerHTML = `
            <div class="wl-pill skeleton-card" style="width: 70px; height: 26px; border-radius: 20px;">
                <div class="skeleton-line" style="width: 100%; height: 100%; border-radius: 20px;"></div>
            </div>
            <div class="wl-pill skeleton-card" style="width: 85px; height: 26px; border-radius: 20px;">
                <div class="skeleton-line" style="width: 100%; height: 100%; border-radius: 20px;"></div>
            </div>
            <div class="wl-pill skeleton-card" style="width: 60px; height: 26px; border-radius: 20px;">
                <div class="skeleton-line" style="width: 100%; height: 100%; border-radius: 20px;"></div>
            </div>
        `;
    }
}

// ─────────────────────────────────────────────
// RENDER
// ─────────────────────────────────────────────
function render() {
    renderIndexHero();
    renderWatchlistCard();
    renderMainChart();
    renderSubindexTable();
    renderPulseCards();
    renderMarketCards();
}

// ─────────────────────────────────────────────
// 1. NEPSE INDEX HERO
// ─────────────────────────────────────────────
function renderIndexHero() {
    if (!indexData || !Array.isArray(indexData)) return;

    updateChartHeader();

    const nepse = indexData.find(i => i.indexName === 'Nepse');
    if (!nepse) return;

    const isUp = nepse.difference >= 0;
    const arrow = isUp ? '▲' : '▼';

    setText('idx-nepse-value', nepse.indexValue.toLocaleString('en-IN', { minimumFractionDigits: 2 }));

    const changeEl = document.getElementById('idx-nepse-change');
    if (changeEl) {
        changeEl.className = `hero-change ${isUp ? 'up' : 'down'}`;
    }
    setText('idx-nepse-diff', `${arrow} ${Math.abs(nepse.difference).toFixed(2)}`);
    setText('idx-nepse-pct', `(${isUp ? '+' : ''}${nepse.percentChange.toFixed(2)}%)`);
    setText('idx-nepse-meta', nepse.asOfDateString || '');



    setText('idx-nepse-high', nepse.dayHigh.toLocaleString());
    setText('idx-nepse-low', nepse.dayLow.toLocaleString());
    setText('idx-nepse-turnover', formatCurrency(nepse.turnover));
    setText('idx-nepse-mcap', formatCurrency(nepse.marketCap));
    setText('idx-nepse-txns', (nepse.noOfTransactions || 0).toLocaleString());
    setText('idx-nepse-52h', nepse.yearHigh.toLocaleString());

    // Mini Index Cards (Float, Sensitive, Sen. Float)
    const others = indexData.filter(i => i.indexName !== 'Nepse');
    const container = document.getElementById('mini-index-cards');
    if (container && others.length > 0) {
        const newHtml = others.map(idx => {
            const up = idx.difference >= 0;
            return `
                <div class="glass mini-idx-card">
                    <div class="mini-idx-info">
                        <div class="mini-idx-name">${idx.indexName}</div>
                        <div class="mini-idx-val">${idx.indexValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                    </div>
                    <div class="mini-idx-chg ${up ? 'up' : 'down'}">
                        ${up ? '▲' : '▼'} ${Math.abs(idx.percentChange).toFixed(2)}%
                    </div>
                </div>
            `;
        }).join('');

        if (container.innerHTML !== newHtml) {
            container.innerHTML = newHtml;
        }
    }
}

async function renderWatchlistCard() {
    const container = document.getElementById('hero-watchlist-pills');
    if (!container) return;
    
    const watchlist = await StorageService.getWatchlist();
    if (!watchlist || watchlist.length === 0) {
        const emptyHtml = `<div class="text-secondary" style="font-size: 0.75rem;">No stocks in watchlist</div>`;
        if (container.innerHTML !== emptyHtml) {
            container.innerHTML = emptyHtml;
        }
        return;
    }

    const pillsHtml = watchlist.map(item => {
        // Find live market data for this symbol to get LTP and change
        const live = marketData.find(m => m.symbol === item.symbol) || {};
        const ltp = live.price || 0;
        const change = live.change || 0;
        const isUp = change >= 0;
        
        return `
            <div class="wl-pill" onclick="window.location.href='/pages/watchlist.html'">
                <span class="wl-sym">${item.symbol}</span>
                <span class="wl-ltp ${isUp ? 'up' : 'down'}">${ltp.toLocaleString('en-IN', {minimumFractionDigits: 1})}</span>
            </div>
        `;
    }).join('');

    if (container.innerHTML !== pillsHtml) {
        container.innerHTML = pillsHtml;
    }
}

// ─────────────────────────────────────────────
// 2. SECTOR SUBINDEX TABLE
// ─────────────────────────────────────────────
function renderSubindexTable() {
    const tbody = document.getElementById('subindex-body');
    if (!tbody || !subindexData || subindexData.length === 0) return;

    populateSubindexDropdown();
    updateChartHeader();

    // Update timestamp badge
    if (subindexData[0]?.asOfDateString) {
        const ts = document.getElementById('subindex-timestamp');
        if (ts) ts.innerText = subindexData[0].asOfDateString.replace('As of ', '');
    }

    // Sort by turnover descending for prominence
    const sorted = [...subindexData].sort((a, b) => (b.turnover || 0) - (a.turnover || 0));

    const newHtml = sorted.map(s => {
        const up = s.difference >= 0;
        const color = SECTOR_COLORS[s.indexName] || '#6366f1';

        return `
            <tr>
                <td>
                    <div class="sector-name">
                        <span class="sector-dot" style="background: ${color};"></span>
                        ${s.indexName}
                    </div>
                </td>
                <td class="idx-val">${s.indexValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                <td>
                    <span class="chg-badge ${up ? 'up' : 'down'}">
                        ${up ? '+' : ''}${s.difference.toFixed(2)}
                    </span>
                </td>
                <td>
                    <span class="${up ? 'price-up' : 'price-down'}" style="font-weight:700;">
                        ${up ? '+' : ''}${s.percentChange.toFixed(2)}%
                    </span>
                </td>
                <td class="hide-mobile">${formatCurrency(s.turnover || 0)}</td>
                <td class="hide-mobile">${(s.volume || 0).toLocaleString()}</td>
                <td class="hide-mobile">${s.noOfTradedCompanies || 0}</td>
            </tr>
        `;
    }).join('');

    if (tbody.innerHTML !== newHtml) {
        tbody.innerHTML = newHtml;
    }
}

// ─────────────────────────────────────────────
// 3. PULSE SUMMARY CARDS
// ─────────────────────────────────────────────
function renderPulseCards() {
    let totalTurnover = 0;
    let totalVolume = 0;
    let scripCount = marketData.length;
    let adv = 0, dec = 0, unc = 0;

    // Calculate advances/declines/unchanged from marketData first
    marketData.forEach(s => {
        const cp = parseFloat(s.changePercent) || 0;
        if (cp > 0) adv++;
        else if (cp < 0) dec++;
        else unc++;
    });

    // Check indexData for official advancing/declining/unchanged metrics
    if (indexData && Array.isArray(indexData)) {
        const nepse = indexData.find(i => i.indexName === 'Nepse');
        if (nepse) {
            adv = nepse.noOfGainers || adv;
            dec = nepse.noOfLosers || dec;
            unc = nepse.noOfUnchanged || unc;
            scripCount = nepse.noOfTradedCompanies || scripCount;
        }
    }

    // Direct use of market-turnover API for official total turnover and total volume as requested
    if (marketSummary && marketSummary.totalTurnover) {
        totalTurnover = marketSummary.totalTurnover.totalTradedValue || 0;
        totalVolume = marketSummary.totalTurnover.totalTradedQuantity || 0;
        scripCount = marketSummary.totalTurnover.scripCount || scripCount;
    } else {
        // Fallback to index data or market data sum if marketSummary is unavailable
        if (indexData && Array.isArray(indexData)) {
            const nepse = indexData.find(i => i.indexName === 'Nepse');
            if (nepse) {
                totalTurnover = nepse.turnover || 0;
                totalVolume = nepse.volume || 0;
            }
        }
        if (totalTurnover === 0) {
            marketData.forEach(s => {
                totalTurnover += (parseFloat(s.turnover) || 0);
                totalVolume += (parseFloat(s.volume) || 0);
            });
        }
    }

    const sentimentEl = document.getElementById('idx-nepse-sentiment');
    const turnoverEl = document.getElementById('idx-total-turnover');
    const volumeEl = document.getElementById('idx-total-volume');
    const companiesEl = document.getElementById('idx-total-companies');

    if (sentimentEl) {
        const sentimentHtml = `
            <span class="price-up">${adv}</span> / 
            <span class="price-down">${dec}</span> / 
            <span style="color:var(--text-secondary)">${unc}</span>
        `;
        if (sentimentEl.innerHTML !== sentimentHtml) {
            sentimentEl.innerHTML = sentimentHtml;
        }
    }
    const formattedTurnover = `Rs. ${formatCurrency(totalTurnover)}`;
    if (turnoverEl && turnoverEl.innerText !== formattedTurnover) {
        turnoverEl.innerText = formattedTurnover;
    }
    const formattedVolume = totalVolume.toLocaleString();
    if (volumeEl && volumeEl.innerText !== formattedVolume) {
        volumeEl.innerText = formattedVolume;
    }
    const formattedCompanies = String(scripCount);
    if (companiesEl && companiesEl.innerText !== formattedCompanies) {
        companiesEl.innerText = formattedCompanies;
    }


}

// ─────────────────────────────────────────────
// 4. MARKET CARDS (Gainers/Losers/Turnover/Volume)
// ─────────────────────────────────────────────
function renderMarketCards() {
    if (!marketData || marketData.length === 0) return;

    const gainers = [...marketData]
        .sort((a, b) => b.changePercent - a.changePercent)
        .slice(0, 10);
    renderMiniTable('top-gainers-body', gainers, 'changePercent');

    const losers = [...marketData]
        .sort((a, b) => a.changePercent - b.changePercent)
        .slice(0, 10);
    renderMiniTable('top-losers-body', losers, 'changePercent');

    const turnover = [...marketData]
        .sort((a, b) => (parseFloat(b.turnover) || 0) - (parseFloat(a.turnover) || 0))
        .slice(0, 10);
    renderMiniTable('top-turnover-body', turnover, 'turnover');

    const volume = [...marketData]
        .sort((a, b) => b.volume - a.volume)
        .slice(0, 10);
    renderMiniTable('top-volume-body', volume, 'volume');
}

// ─────────────────────────────────────────────
// TABLE RENDERER
// ─────────────────────────────────────────────
function renderMiniTable(containerId, data, type) {
    const tbody = document.getElementById(containerId);
    if (!tbody) return;

    const newHtml = data.map(stock => {
        let valueHtml = '';
        if (type === 'changePercent') {
            const isUp = stock.changePercent >= 0;
            valueHtml = `<span class="${isUp ? 'price-up' : 'price-down'}">${isUp ? '+' : ''}${stock.changePercent.toFixed(2)}%</span>`;
        } else if (type === 'turnover') {
            valueHtml = `<span>${formatCurrency(stock.turnover)}</span>`;
        } else if (type === 'volume') {
            valueHtml = `<span>${stock.volume.toLocaleString()}</span>`;
        }

        return `
            <tr>
                <td class="symbol-cell" style="cursor:pointer;" onclick="showSymbolDetails('${stock.symbol}')">${stock.symbol}</td>
                <td class="price-cell">${stock.price.toFixed(2)}</td>
                <td>${valueHtml}</td>
            </tr>
        `;
    }).join('');

    if (tbody.innerHTML !== newHtml) {
        tbody.innerHTML = newHtml;
    }
}

// ─────────────────────────────────────────────
// MAIN DASHBOARD CHART (Lightweight Charts)
// ─────────────────────────────────────────────
async function renderMainChart() {
    const canvas = document.getElementById('main-nepse-chart');
    if (!canvas) return;

    try {
        const rawData = await DataService.getIndexChart(activeChartSymbol, activePeriod);
        if (!rawData) return;

        let labels = [];
        let prices = [];

        if (activePeriod === '1D') {
            if (!Array.isArray(rawData) || rawData.length === 0) return;
            
            // Filter out any trailing flat points after market close (3:01 PM NPT = 901 minutes)
            const filteredData = rawData.filter(item => {
                const timestamp = item[0];
                const d = new Date(timestamp * 1000);
                
                // Mathematical timezone conversion to Nepal Standard Time (UTC + 5:45)
                const utcMinutes = d.getUTCHours() * 60 + d.getUTCMinutes();
                const nptMinutes = (utcMinutes + 345) % 1440;
                
                // Only keep points between 11:00 AM NPT (660 minutes) and 3:01 PM NPT (901 minutes)
                return nptMinutes >= 660 && nptMinutes <= 901;
            });

            labels = filteredData.map(item => {
                const d = new Date(item[0] * 1000);
                return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
            });
            prices = filteredData.map(item => item[1]);
        } else {
            const dataList = rawData.success && Array.isArray(rawData.data) ? rawData.data : [];
            if (dataList.length === 0) return;
            
            const chronological = [...dataList].reverse();
            labels = chronological.map(item => item.date || item.asOfDateString || '');
            prices = chronological.map(item => item.value || item.indexValue || 0);
        }

        let isPositive = true;
        const dataObj = findIndexData(activeChartSymbol);
        if (dataObj) {
            isPositive = dataObj.difference >= 0;
        }
        const color = isPositive ? '#10b981' : '#ef4444';

        const ctx = canvas.getContext('2d');

        const gradient = ctx.createLinearGradient(0, 0, 0, 300);
        gradient.addColorStop(0, color + '33');
        gradient.addColorStop(1, color + '00');

        if (mainChart) {
            mainChart.data.labels = labels;
            mainChart.data.datasets[0].data = prices;
            mainChart.data.datasets[0].borderColor = color;
            mainChart.data.datasets[0].backgroundColor = gradient;
            mainChart.update('none');
        } else {
            mainChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        data: prices,
                        borderColor: color,
                        borderWidth: 2,
                        pointRadius: 0,
                        fill: true,
                        backgroundColor: gradient,
                        tension: 0.2
                    }]
                },
            options: {
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        enabled: true,
                        mode: 'index',
                        intersect: false,
                        backgroundColor: 'rgba(15, 23, 42, 0.95)',
                        titleColor: '#f8fafc',
                        bodyColor: '#94a3b8',
                        borderColor: 'rgba(255, 255, 255, 0.08)',
                        borderWidth: 1,
                        padding: 10,
                        displayColors: false,
                        callbacks: {
                            label: function(context) {
                                return `Value: ${context.parsed.y.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: {
                            color: 'rgba(255, 255, 255, 0.02)',
                            borderColor: 'transparent'
                        },
                        ticks: {
                            color: '#64748b',
                            font: { family: 'Outfit, sans-serif', size: 10 },
                            maxRotation: 0,
                            autoSkip: true,
                            maxTicksLimit: activePeriod === '1D' ? 6 : 8
                        }
                    },
                    y: {
                        position: 'right',
                        grid: {
                            color: 'rgba(255, 255, 255, 0.02)',
                            borderColor: 'transparent'
                        },
                        ticks: {
                            color: '#64748b',
                            font: { family: 'Outfit, sans-serif', size: 10 },
                            callback: function(val) {
                                return val.toLocaleString('en-IN', { maximumFractionDigits: 0 });
                            }
                        }
                    }
                },
                maintainAspectRatio: false,
                responsive: true
            }
        });
    }

        // Trigger header update once chart is fully drawn
        updateChartHeader();
    } catch (err) {
        console.error('Error rendering NEPSE line chart:', err);
    }
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
function formatCurrency(val) {
    if (val >= 1000000000000) return (val / 1000000000000).toFixed(2) + ' T';
    if (val >= 10000000) return (val / 10000000).toFixed(2) + ' Cr';
    if (val >= 100000) return (val / 100000).toFixed(2) + ' L';
    return val.toLocaleString();
}

function setText(id, val) {
    const el = document.getElementById(id);
    const newVal = String(val);
    if (el && el.innerText !== newVal) {
        el.innerText = newVal;
    }
}

function normalizeIndexData(rawArray) {
    if (!Array.isArray(rawArray)) return [];
    return rawArray.map(item => {
        const indexName = item.indexName || item.name || '';
        const indexValue = parseFloat(item.indexValue || item.currentValue || 0);
        const difference = parseFloat(item.difference !== undefined ? item.difference : (item.change !== undefined ? item.change : 0));
        const percentChange = parseFloat(item.percentChange !== undefined ? item.percentChange : (item.changePercent !== undefined ? item.changePercent : 0));
        
        return {
            ...item,
            indexName: indexName,
            indexValue: indexValue,
            difference: difference,
            percentChange: percentChange,
            name: indexName,
            currentValue: indexValue,
            change: difference,
            changePercent: percentChange
        };
    });
}

function findIndexData(symbol) {
    const isMain = ['NEPSE', 'Sensitive', 'Float', 'SenFloat'].includes(symbol);
    const matchName = symbol.toLowerCase();
    
    if (isMain) {
        if (!indexData || !Array.isArray(indexData)) return null;
        return indexData.find(i => {
            const name = (i.indexName || i.name || '').toLowerCase();
            if (matchName === 'nepse' && name.includes('nepse')) return true;
            if (matchName === 'sensitive' && name.includes('sensitive') && !name.includes('float')) return true;
            if (matchName === 'float' && name.includes('float') && !name.includes('sen') && !name.includes('sensitive')) return true;
            if (matchName === 'senfloat' && (name.includes('sen. float') || name.includes('sensitive float') || name.includes('senfloat'))) return true;
            return name === matchName;
        }) || null;
    } else {
        if (!subindexData || !Array.isArray(subindexData)) return null;
        const normalizedMatch = matchName.replace(/[^a-z0-9]/g, '');
        return subindexData.find(i => {
            const name = (i.indexName || i.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            return name === normalizedMatch || name.includes(normalizedMatch) || normalizedMatch.includes(name);
        }) || null;
    }
}

document.addEventListener('DOMContentLoaded', init);
