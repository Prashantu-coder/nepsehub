import StorageService from '../services/storageService.js';
import DataService from '../services/dataService.js';

// ticker.js - Continuous right-to-left scrolling watchlist ticker
// Refactored as ES Module to fetch watchlist symbols and live prices

// Configuration
const REFRESH_INTERVAL_MS = 8000;   // 8 seconds (from HTML footer)
const SCROLL_SPEED_SEC = 40;        // seconds for one full scroll (lower = faster)

let tickerTrack = null;
let currentSymbols = [];
let currentMarketData = [];
let refreshTimer = null;

// Helper: format price (2 decimals)
function formatPrice(val) {
    if (val === undefined || val === null) return '—';
    let n = parseFloat(val);
    return isNaN(n) ? '—' : `Rs. ${n.toFixed(2)}`;
}

// Helper: format change percentage
function formatChange(changePercent) {
    if (changePercent === undefined || changePercent === null) return '—';
    let p = parseFloat(changePercent);
    if (isNaN(p)) return '—';
    let sign = p >= 0 ? '+' : '';
    return `${sign}${p.toFixed(2)}%`;
}

// Build HTML for a single ticker item
function createTickerItem(symbol, stock) {
    const ltp = stock?.price ? parseFloat(stock.price) : null;
    const change = stock?.changePercent ? parseFloat(stock.changePercent) : null;

    const priceClass = (change !== null && change >= 0) ? 'positive' : (change !== null && change < 0 ? 'negative' : 'neutral');
    const changeClass = (change !== null && change >= 0) ? 'positive' : (change !== null && change < 0 ? 'negative' : 'neutral');
    const borderColor = (change !== null && change >= 0) ? '#4ade80' : (change !== null && change < 0 ? '#f87171' : '#6b7280');

    return `
        <div class="ticker-item" style="border-left-color: ${borderColor};">
            <span class="symbol">${escapeHtml(symbol)}</span>
            <span class="price ${priceClass}">${ltp ? formatPrice(ltp) : '—'}</span>
            <span class="change ${changeClass}">${change ? formatChange(change) : '—'}</span>
            <span class="separator"></span>
        </div>
    `;
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// Render the ticker: duplicate items for seamless loop
function renderTicker() {
    if (!tickerTrack) return;

    if (!currentSymbols.length) {
        tickerTrack.innerHTML = '<div class="ticker-placeholder">✨ Add stocks to watchlist to display here ✨</div>';
        tickerTrack.style.animation = 'none';
        return;
    }

    // Build single set of items
    let repeatCount = 1;
    if (currentSymbols.length > 0) {
        // We want at least 15 items to ensure seamless marquee scrolling across all screen widths
        repeatCount = Math.ceil(15 / currentSymbols.length);
    }

    let singleSetHtml = '';
    for (let r = 0; r < repeatCount; r++) {
        for (const sym of currentSymbols) {
            const stock = currentMarketData.find(s => s.symbol.toUpperCase() === sym.toUpperCase());
            singleSetHtml += createTickerItem(sym, stock);
        }
    }

    // Duplicate for infinite scroll effect
    tickerTrack.innerHTML = singleSetHtml + singleSetHtml;

    // Calculate animation duration dynamically to maintain a constant, readable speed (3.5 seconds per item)
    const totalItems = currentSymbols.length * repeatCount;
    const duration = totalItems * 3.5;

    // Reset animation to avoid glitch
    tickerTrack.style.animation = 'none';
    tickerTrack.offsetHeight; // force reflow
    tickerTrack.style.animation = `scrollTicker ${duration}s linear infinite`;
}

// Update live status badge and timestamp info
function updateStatusDOM(marketOpen) {
    const liveDot = document.querySelector('.ticker-live-dot');
    const liveStatus = document.getElementById('liveStatus');
    const timestampInfo = document.getElementById('timestampInfo');

    if (marketOpen) {
        if (liveDot) liveDot.style.backgroundColor = '#10b981';
        if (liveStatus) liveStatus.innerText = 'LIVE';
    } else {
        if (liveDot) liveDot.style.backgroundColor = '#f43f5e';
        if (liveStatus) liveStatus.innerText = 'CLOSED';
    }

    if (timestampInfo) {
        const now = new Date();
        const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        timestampInfo.innerText = `Updated: ${timeString}`;
    }
}

// Fetch fresh watchlist and market data, then re-render
async function refreshTicker() {
    try {
        const [watchlist, market, marketOpen] = await Promise.all([
            StorageService.getWatchlist(),
            DataService.getLiveMarket(),
            DataService.checkMarketStatus()
        ]);
        currentSymbols = (watchlist || []).map(item => item.symbol.toUpperCase());
        currentMarketData = market || [];
        renderTicker();
        updateStatusDOM(marketOpen);
    } catch (err) {
        console.error('Ticker refresh failed:', err);
    }
}

// Dynamically inject critical ticker styling (since they are deleted from layout.css)
function injectTickerCSS() {
    if (document.getElementById('ticker-inserted-styles')) return;
    const style = document.createElement('style');
    style.id = 'ticker-inserted-styles';
    style.textContent = `
        .ticker-wrapper {
            height: var(--ticker-height, 46px);
            left: 48px;
            right: 0;
            bottom: 0;
            overflow-x: hidden;
            position: fixed;
            background: var(--surface-hover);
            border-top: 1px solid rgba(56, 189, 248, 0.25);
            border-bottom: 1px solid rgba(56, 189, 248, 0.25);
            border-radius: 0;
            z-index: 999;
            display: flex;
            align-items: center;
        }
        .ticker-track {
            display: flex;
            flex-wrap: nowrap;
            will-change: transform;
            animation: scrollTicker 10s linear infinite;
            width: max-content;
            min-height: 40px !important;
        }
        .ticker-wrapper:hover .ticker-track {
            animation-play-state: paused !important;
            cursor: pointer;
        }
        .ticker-item {
            display: inline-flex;
            align-items: center;
            gap: 0.8rem;
            background: rgba(20, 30, 55, 0.7);
            backdrop-filter: blur(4px);
            padding: 0.4rem 1rem;
            margin-right: 1rem;
            border-radius: 48px;
            border-left: 3px solid;
            transition: all 0.1s ease;
            font-size: 0.7rem;
            font-weight: 500;
            white-space: nowrap;
            box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
        }
        .ticker-item .symbol {
            font-weight: 700;
            color: #e2e8f0;
            letter-spacing: 0.3px;
        }
        .ticker-item .price {
            font-weight: 700;
            font-family: 'JetBrains Mono', monospace;
        }
        .ticker-item .change {
            font-weight: 600;
            font-size: 0.8rem;
            padding: 2px 6px;
            border-radius: 24px;
            background: rgba(0, 0, 0, 0.3);
        }
        .ticker-item .positive {
            color: #4ade80;
        }
        .ticker-item .negative {
            color: #f87171;
        }
        .ticker-item .neutral {
            color: #cbd5e6;
        }
        .ticker-item .separator {
            width: 1px;
            height: 24px;
            background: #2d3a60;
            margin: 0 4px;
        }
        .ticker-placeholder {
            text-align: center;
            padding: 0.5rem;
            color: #8ba0c0;
            width: 100%;
            min-height: 45px !important;
        }
        @keyframes scrollTicker {
            0% { transform: translateX(0%); }
            100% { transform: translateX(-50%); }
        }
    `;
    document.head.appendChild(style);
}

// Public initializer
export function initTicker() {
    tickerTrack = document.getElementById('tickerTrack');
    if (!tickerTrack) {
        console.warn('Ticker track element (#tickerTrack) not found. Retrying in 100ms...');
        setTimeout(initTicker, 100);
        return;
    }
    injectTickerCSS();
    refreshTicker();
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(refreshTicker, REFRESH_INTERVAL_MS);
}

// Optional: stop ticker (e.g., on page unload)
export function stopTicker() {
    if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
    }
    if (tickerTrack) tickerTrack.style.animation = 'none';
}

// Expose functions globally for backward compatibility
window.initTicker = initTicker;
window.stopTicker = stopTicker;

// Auto-run on load/DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTicker);
} else {
    initTicker();
}
