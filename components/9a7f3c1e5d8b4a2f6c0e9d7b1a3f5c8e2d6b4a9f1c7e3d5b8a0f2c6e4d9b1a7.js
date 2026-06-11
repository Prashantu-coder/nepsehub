import StorageService from '../services/storageService.js';
import DataService from '../services/dataService.js';

// ticker.js - Continuous right-to-left scrolling watchlist ticker
// Refactored as ES Module to fetch watchlist symbols and live prices

// Configuration
const REFRESH_INTERVAL_MS = 8000;   // 8 seconds (from HTML footer)

let tickerTrack = null;
let currentSymbols = [];
let currentMarketData = [];
let refreshTimer = null;
let lastSymbolsJson = null;

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

    const trendClass = (change !== null && change >= 0) ? 'positive' : (change !== null && change < 0 ? 'negative' : 'neutral');
    const borderColor = (change !== null && change >= 0) ? '#4ade80' : (change !== null && change < 0 ? '#f87171' : '#6b7280');

    return `
        <div class="ticker-item" style="border-left-color: ${borderColor};">
            <span class="symbol">${escapeHtml(symbol)}</span>
            <span class="price ${trendClass}">${ltp ? formatPrice(ltp) : '—'}</span>
            <span class="change ${trendClass}">${change ? formatChange(change) : '—'}</span>
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
        lastSymbolsJson = null;
        return;
    }

    // We want at least 15 items to ensure seamless marquee scrolling across all screen widths
    const repeatCount = Math.ceil(15 / currentSymbols.length);
    const totalItems = currentSymbols.length * repeatCount;
    const duration = totalItems * 3.5;

    // Check if the symbol list has changed
    const currentSymbolsJson = JSON.stringify(currentSymbols);
    if (lastSymbolsJson === currentSymbolsJson) {
        const items = tickerTrack.querySelectorAll('.ticker-item');
        if (items.length === totalItems * 2) {
            items.forEach((item, index) => {
                const sym = currentSymbols[index % currentSymbols.length];
                const stock = currentMarketData.find(s => s.symbol.toUpperCase() === sym.toUpperCase());
                
                const ltp = stock?.price ? parseFloat(stock.price) : null;
                const change = stock?.changePercent ? parseFloat(stock.changePercent) : null;

                const trendClass = (change !== null && change >= 0) ? 'positive' : (change !== null && change < 0 ? 'negative' : 'neutral');
                const borderColor = (change !== null && change >= 0) ? '#4ade80' : (change !== null && change < 0 ? '#f87171' : '#6b7280');

                item.style.borderLeftColor = borderColor;

                const priceEl = item.querySelector('.price');
                if (priceEl) {
                    priceEl.className = `price ${trendClass}`;
                    priceEl.textContent = ltp ? formatPrice(ltp) : '—';
                }

                const changeEl = item.querySelector('.change');
                if (changeEl) {
                    changeEl.className = `change ${trendClass}`;
                    changeEl.textContent = change ? formatChange(change) : '—';
                }
            });
            return; // In-place update complete, no DOM rebuild or animation reset!
        }
    }

    // If symbols list changed or DOM structure is different, rebuild
    lastSymbolsJson = currentSymbolsJson;

    let singleSetHtml = '';
    for (let r = 0; r < repeatCount; r++) {
        for (const sym of currentSymbols) {
            const stock = currentMarketData.find(s => s.symbol.toUpperCase() === sym.toUpperCase());
            singleSetHtml += createTickerItem(sym, stock);
        }
    }

    // Duplicate for infinite scroll effect
    tickerTrack.innerHTML = singleSetHtml + singleSetHtml;

    // Update animation directly without resetting to 'none' to keep moving smoothly
    const expectedAnimation = `scrollTicker ${duration}s linear infinite`;
    if (tickerTrack.style.animation !== expectedAnimation) {
        tickerTrack.style.animation = expectedAnimation;
    }
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

    // Register event listener for watchlist modifications
    if (!window._tickerListenerAdded) {
        window.addEventListener('watchlistUpdated', () => {
            refreshTicker();
        });
        window._tickerListenerAdded = true;
    }
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
