import globalState from '../state.js';
import { Layout } from '../layout.js';
import DataService from '../../services/dataService.js';
import StorageService from '../../services/storageService.js';

let marketData = [];
let marketSummary = null;
let indexData = null;
let subindexData = [];

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
    
    await refresh();
    setInterval(refresh, 60000);
}

// ─────────────────────────────────────────────
// DATA REFRESH
// ─────────────────────────────────────────────
async function refresh() {
    try {
        const [liveData, summary, indices, subindices] = await Promise.allSettled([
            DataService.getLiveMarket(),
            DataService.getMarketSummary(),
            DataService.getIndices(),
            DataService.getSectorIndices()
        ]);
        
        marketData = liveData.status === 'fulfilled' ? (liveData.value || []) : [];
        marketSummary = summary.status === 'fulfilled' ? summary.value : null;
        
        // Parse index response: { statusCode, message, result: [...] }
        if (indices.status === 'fulfilled' && indices.value) {
            const raw = indices.value;
            indexData = raw.result || raw.data || (Array.isArray(raw) ? raw : null);
        }

        if (subindices.status === 'fulfilled' && subindices.value) {
            const raw = subindices.value;
            subindexData = raw.result || raw.data || (Array.isArray(raw) ? raw : []);
        }

        render();
    } catch (error) {
        console.error('Error refreshing dashboard:', error);
    }
}

// ─────────────────────────────────────────────
// RENDER
// ─────────────────────────────────────────────
function render() {
    renderIndexHero();
    renderWatchlistCard();
    renderSubindexTable();
    renderPulseCards();
    renderMarketCards();
}

// ─────────────────────────────────────────────
// 1. NEPSE INDEX HERO
// ─────────────────────────────────────────────
function renderIndexHero() {
    if (!indexData || !Array.isArray(indexData)) return;

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
        container.innerHTML = others.map(idx => {
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
    }
}

async function renderWatchlistCard() {
    const container = document.getElementById('hero-watchlist-pills');
    if (!container) return;
    
    const watchlist = await StorageService.getWatchlist();
    if (!watchlist || watchlist.length === 0) {
        container.innerHTML = `<div class="text-secondary" style="font-size: 0.75rem;">No stocks in watchlist</div>`;
        return;
    }

    const pillsHtml = watchlist.map(item => {
        // Find live market data for this symbol to get LTP and change
        const live = marketData.find(m => m.symbol === item.symbol) || {};
        const ltp = live.price || 0;
        const change = live.change || 0;
        const isUp = change >= 0;
        
        return `
            <div class="wl-pill" onclick="window.location.href='/pages/technical.html?symbol=${item.symbol}'">
                <span class="wl-sym">${item.symbol}</span>
                <span class="wl-ltp ${isUp ? 'up' : 'down'}">${ltp.toLocaleString('en-IN', {minimumFractionDigits: 1})}</span>
            </div>
        `;
    }).join('');

    container.innerHTML = pillsHtml;
}

// ─────────────────────────────────────────────
// 2. SECTOR SUBINDEX TABLE
// ─────────────────────────────────────────────
function renderSubindexTable() {
    const tbody = document.getElementById('subindex-body');
    if (!tbody || !subindexData || subindexData.length === 0) return;

    // Update timestamp badge
    if (subindexData[0]?.asOfDateString) {
        const ts = document.getElementById('subindex-timestamp');
        if (ts) ts.innerText = subindexData[0].asOfDateString.replace('As of ', '');
    }

    // Sort by turnover descending for prominence
    const sorted = [...subindexData].sort((a, b) => (b.turnover || 0) - (a.turnover || 0));

    tbody.innerHTML = sorted.map(s => {
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
}

// ─────────────────────────────────────────────
// 3. PULSE SUMMARY CARDS
// ─────────────────────────────────────────────
function renderPulseCards() {
    let totalTurnover = 0;
    let totalVolume = 0;
    let scripCount = marketData.length;
    let adv = 0, dec = 0, unc = 0;

    // Use index data for official numbers if available
    if (indexData && Array.isArray(indexData)) {
        const nepse = indexData.find(i => i.indexName === 'Nepse');
        if (nepse) {
            adv = nepse.noOfGainers || 0;
            dec = nepse.noOfLosers || 0;
            unc = nepse.noOfUnchanged || 0;
            totalTurnover = nepse.turnover || 0;
            totalVolume = nepse.volume || 0;
            scripCount = nepse.noOfTradedCompanies || scripCount;
        }
    } else {
        // Fallback to market data
        marketData.forEach(s => {
            const cp = parseFloat(s.changePercent) || 0;
            if (cp > 0) adv++;
            else if (cp < 0) dec++;
            else unc++;
            totalTurnover += (parseFloat(s.turnover) || 0);
            totalVolume += (parseFloat(s.volume) || 0);
        });
    }

    const sentimentEl = document.getElementById('pulse-sentiment');
    const turnoverEl = document.getElementById('pulse-turnover');
    const volumeEl = document.getElementById('pulse-volume');
    const companiesEl = document.getElementById('pulse-companies');

    if (sentimentEl) {
        sentimentEl.innerHTML = `
            <span class="price-up">${adv}</span> / 
            <span class="price-down">${dec}</span> / 
            <span style="color:var(--text-secondary)">${unc}</span>
        `;
    }
    if (turnoverEl) turnoverEl.innerText = `Rs. ${formatCurrency(totalTurnover)}`;
    if (volumeEl) volumeEl.innerText = totalVolume.toLocaleString();
    if (companiesEl) companiesEl.innerText = scripCount;
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

    tbody.innerHTML = data.map(stock => {
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
    if (el) el.innerText = val;
}

document.addEventListener('DOMContentLoaded', init);
