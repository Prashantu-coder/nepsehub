import globalState from '../state.js';
import { Layout } from '../layout.js';
import DataService from '../../services/dataService.js';
import StorageService from '../../services/storageService.js';
import NotificationService from '../../services/notificationService.js';
import { SymbolSearch } from '../components/symbolSearch.js';

let wlSymbolSearch;   // SymbolSearch instance for modal

let marketData      = [];
let watchlistData   = [];
let watchlistLoaded = false;

// ─────────────────────────────────────────────
// SHIMMER HELPERS — operate on HTML tbody elements
// ─────────────────────────────────────────────
function showShimmer() {
    const shimmer = document.getElementById('shimmer-body');
    const data    = document.getElementById('watchlistBody');
    if (shimmer) shimmer.classList.remove('loaded');   // show skeleton rows
    if (data)    data.classList.add('loading');        // hide real rows
}

function hideShimmer() {
    const shimmer = document.getElementById('shimmer-body');
    const data    = document.getElementById('watchlistBody');
    if (shimmer) shimmer.classList.add('loaded');      // hide skeleton rows
    if (data)    data.classList.remove('loading');     // show real rows
}

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
async function init() {
    globalState.setState({ activePage: 'watchlist' });
    await Layout.init();

    // Symbol search inside the modal
    wlSymbolSearch = new SymbolSearch({
        wrapperId:   'wl-symbol-search',
        inputId:     'wl-symbol',
        placeholder: 'Type symbol or company name...'
    });

    // ── Modal wiring ──
    const modal = document.getElementById('wl-modal');
    document.getElementById('open-wl-modal').onclick   = () => openModal();
    document.getElementById('close-wl-modal').onclick  = () => modal.style.display = 'none';
    document.getElementById('cancel-wl-modal').onclick = () => modal.style.display = 'none';
    document.getElementById('save-wl-btn').onclick     = handleSave;

    // ── Empty-state add button ──
    const emptyAddBtn = document.getElementById('empty-add-btn');
    if (emptyAddBtn) emptyAddBtn.onclick = () => openModal();

    // ── Enable-Notifications button ──
    const notifBtn = document.getElementById('enable-notifications');
    if (notifBtn) {
        if (Notification.permission === 'granted') {
            notifBtn.innerHTML = '<i class="fas fa-check"></i> Alerts Active';
            notifBtn.classList.add('btn-success');
        }
        notifBtn.onclick = async () => {
            if (Notification.permission === 'granted') {
                alert('Notifications are already enabled for this browser.');
                return;
            }
            const granted = await NotificationService.requestPermission();
            if (granted) {
                alert('Notifications Enabled! You will receive alerts when target prices are reached.');
                notifBtn.innerHTML = '<i class="fas fa-check"></i> Alerts Active';
                notifBtn.classList.add('btn-success');
            } else if (Notification.permission === 'denied') {
                alert('Permission denied. Please enable notifications in your browser settings.');
            }
        };
    }

    // ── Columns dropdown toggle — starts HIDDEN in HTML ──
    const toggleColsBtn = document.getElementById('toggle-columns-btn');
    const colsDropdown  = document.getElementById('columns-dropdown');
    if (toggleColsBtn && colsDropdown) {
        toggleColsBtn.onclick = (e) => {
            e.stopPropagation();
            colsDropdown.classList.toggle('hidden');
        };
        // Close when clicking outside
        document.addEventListener('click', (e) => {
            if (!toggleColsBtn.contains(e.target) && !colsDropdown.contains(e.target)) {
                colsDropdown.classList.add('hidden');
            }
        });
    }

    // ── CSV download ──
    const csvBtn = document.getElementById('download-csv-btn');
    if (csvBtn) csvBtn.onclick = downloadCSV;

    // ── Column checkboxes — restore saved prefs ──
    const colCheckboxes = document.querySelectorAll('.col-toggle-input');
    const savedCols     = JSON.parse(localStorage.getItem('watchlist_visible_cols') || '{}');

    colCheckboxes.forEach(cb => {
        const col = cb.dataset.col;
        if (savedCols[col] !== undefined) cb.checked = savedCols[col];

        cb.onchange = () => {
            savedCols[col] = cb.checked;
            localStorage.setItem('watchlist_visible_cols', JSON.stringify(savedCols));
            applyColumnVisibility();
        };
    });

    // ── Initial load & auto-refresh ──
    showShimmer();
    await refresh(true);
    setInterval(() => refresh(false), 30000);
}

// ─────────────────────────────────────────────
// DATA REFRESH
// ─────────────────────────────────────────────
async function refresh(forceFetchWatchlist = false) {
    let wlPromise = (!watchlistLoaded || forceFetchWatchlist)
        ? StorageService.getWatchlist()
        : Promise.resolve(watchlistData);

    const [watchlist, stocks] = await Promise.allSettled([
        wlPromise,
        DataService.getLiveMarket()
    ]);

    if (!watchlistLoaded || forceFetchWatchlist) {
        watchlistData   = watchlist.status === 'fulfilled' ? (watchlist.value || []) : [];
        watchlistLoaded = true;
    }
    marketData = stocks.status === 'fulfilled' ? (stocks.value || []) : [];

    render();
    hideShimmer();  // hide skeleton, reveal data tbody
}

// ─────────────────────────────────────────────
// APPLY COLUMN VISIBILITY
// ─────────────────────────────────────────────
function applyColumnVisibility() {
    document.querySelectorAll('.col-toggle-input').forEach(cb => {
        const visible  = cb.checked;
        const colName  = cb.dataset.col;
        document.querySelectorAll(`[data-col="${colName}"]`).forEach(el => {
            el.style.display = visible ? '' : 'none';
        });
    });
}

// ─────────────────────────────────────────────
// DOWNLOAD WATCHLIST AS CSV
// ─────────────────────────────────────────────
function downloadCSV() {
    if (watchlistData.length === 0) {
        alert('No watchlist data to export.');
        return;
    }

    const headers = ['Symbol', 'LTP', 'Change %', 'Previous Close', 'Volume', 'Turnover', 'LTQ', 'Target Buy', 'Target Sell', 'Notes'];
    const rows = watchlistData.map(w => {
        const stock = marketData.find(s => s.symbol.toUpperCase() === w.symbol.toUpperCase());
        return [
            w.symbol,
            stock ? stock.price : '',
            stock ? `${stock.changePercent}%` : '',
            stock ? stock.previousClose : '',
            stock ? stock.volume : '',
            stock ? stock.turnover : '',
            stock ? (stock.ltq ?? '') : '',
            w.target_buy  || '',
            w.target_sell || '',
            w.notes       || ''
        ];
    });

    const escape = val => `"${String(val).replace(/"/g, '""')}"`;
    const csv    = [headers, ...rows].map(r => r.map(escape).join(',')).join('\n');
    const blob   = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url    = URL.createObjectURL(blob);
    const link   = Object.assign(document.createElement('a'), {
        href:     url,
        download: `NEPSE_Watchlist_${new Date().toISOString().split('T')[0]}.csv`
    });
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────
// RENDER TABLE ROWS
// ─────────────────────────────────────────────
function render() {
    const body       = document.getElementById('watchlistBody');
    const emptyDiv   = document.getElementById('wl-empty');
    const countEl    = document.getElementById('wl-count');
    const countTopEl = document.getElementById('wl-count-top');

    if (!body) return;

    const countText = `${watchlistData.length} stock${watchlistData.length !== 1 ? 's' : ''} watched`;
    if (countEl)    countEl.innerText    = countText;
    if (countTopEl) countTopEl.innerText = countText;

    if (watchlistData.length === 0) {
        body.innerHTML = '';
        if (emptyDiv) emptyDiv.style.display = 'block';
        return;
    }
    if (emptyDiv) emptyDiv.style.display = 'none';

    const newHtml = watchlistData.map(w => {
        const stock  = marketData.find(s => s.symbol.toUpperCase() === w.symbol.toUpperCase());
        const ltp    = stock ? parseFloat(stock.price)         : null;
        const change = stock ? parseFloat(stock.changePercent) : null;

        // ── Target hit flags ──
        const buyHit  = ltp && w.target_buy  && ltp <= w.target_buy;
        const sellHit = ltp && w.target_sell && ltp >= w.target_sell;

        // ── Row background: green tint ↑ / red tint ↓ / neutral ──
        let rowStyle = 'border-left: 3px solid transparent;';
        if (change !== null) {
            if (change > 0)
                rowStyle = 'background: rgba(16,185,129,0.04); border-left: 3px solid #10b981;';
            else if (change < 0)
                rowStyle = 'background: rgba(244,63,94,0.04); border-left: 3px solid #f43f5e;';
        }

        // ── Cell HTML helpers ──
        const dash = `<span style="color:var(--text-secondary);">—</span>`;

        const ltpHtml = ltp !== null
            ? `<span style="font-weight:700;">Rs.&nbsp;${ltp.toFixed(2)}</span>`
            : dash;

        const changeHtml = change !== null
            ? `<span class="${change >= 0 ? 'price-up' : 'price-down'}">${change >= 0 ? '+' : ''}${change.toFixed(2)}%</span>`
            : dash;

        const prevCloseHtml = stock?.previousClose !== undefined
            ? `<span>Rs.&nbsp;${parseFloat(stock.previousClose).toFixed(2)}</span>`
            : dash;

        const volumeHtml = stock?.volume !== undefined
            ? `<span>${Number(stock.volume).toLocaleString('en-IN')}</span>`
            : dash;

        const turnoverHtml = stock?.turnover !== undefined
            ? `<span>Rs.&nbsp;${Number(stock.turnover).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>`
            : dash;

        const ltqHtml = stock?.ltq !== undefined
            ? `<span>${Number(stock.ltq).toLocaleString('en-IN')}</span>`
            : dash;

        const targetBuyHtml = w.target_buy
            ? `<span class="target-badge target-buy-badge"
                    style="${buyHit ? 'animation:pulse 1s infinite; box-shadow:0 0 8px #10b981;' : ''}">
                    Rs.&nbsp;${w.target_buy}${buyHit ? ' 🎯' : ''}
               </span>`
            : `<span style="color:var(--text-secondary); font-size:0.8rem;">—</span>`;

        const targetSellHtml = w.target_sell
            ? `<span class="target-badge target-sell-badge"
                    style="${sellHit ? 'animation:pulse 1s infinite; box-shadow:0 0 8px #f43f5e;' : ''}">
                    Rs.&nbsp;${w.target_sell}${sellHit ? ' 🎯' : ''}
               </span>`
            : `<span style="color:var(--text-secondary); font-size:0.8rem;">—</span>`;

        const notesHtml = w.notes
            ? `<span class="notes-text" title="${w.notes.replace(/"/g, '&quot;')}">${w.notes}</span>`
            : dash;

        // ── Symbol initials (first 2 chars) for avatar fallback ──
        const initials = w.symbol.substring(0, 2).toUpperCase();

        return `
        <tr style="${rowStyle}">
            <!-- Symbol — clickable → stock details -->
            <td data-col="symbol" style="cursor:pointer;"
                onclick="window.location.href='./market/stock-details.html?symbol=${encodeURIComponent(w.symbol)}'">
                <div class="sym-link">
                    <div class="sym-avatar-wrap">
                        <img src="../images/stocks/${w.symbol}.png"
                             alt="${w.symbol}"
                             onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                        <div class="sym-avatar-fallback">${initials}</div>
                    </div>
                    <div style="display:flex; flex-direction:column;">
                        <span class="sym-name">${w.symbol}</span>
                    </div>
                </div>
            </td>

            <td data-col="ltp">${ltpHtml}</td>
            <td data-col="change">${changeHtml}</td>
            <td data-col="prevClose">${prevCloseHtml}</td>
            <td data-col="volume">${volumeHtml}</td>
            <td data-col="turnover">${turnoverHtml}</td>
            <td data-col="ltq">${ltqHtml}</td>
            <td data-col="targetBuy">${targetBuyHtml}</td>
            <td data-col="targetSell">${targetSellHtml}</td>
            <td data-col="notes">${notesHtml}</td>

            <!-- Actions -->
            <td>
                <div style="display:flex; gap:0.5rem; justify-content:flex-end;">
                    <button onclick="window.editWatchlistItem(${w.id})"
                        style="background:rgba(99,102,241,0.1); color:#6366f1; border:1px solid rgba(99,102,241,0.3); padding:4px 10px; border-radius:6px; font-size:0.78rem; cursor:pointer;"
                        title="Edit">
                        <i class="fas fa-pen"></i>
                    </button>
                    <button onclick="window.removeFromWatchlist('${w.symbol}')"
                        style="background:rgba(244,63,94,0.1); color:#f43f5e; border:1px solid rgba(244,63,94,0.3); padding:4px 10px; border-radius:6px; font-size:0.78rem; cursor:pointer;"
                        title="Remove">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>`;
    }).join('');

    if (body.innerHTML !== newHtml) {
        body.innerHTML = newHtml;
    }

    // Re-apply saved column visibility after every render
    applyColumnVisibility();
}

// ─────────────────────────────────────────────
// MODAL — Open (Add or Edit)
// ─────────────────────────────────────────────
function openModal(item = null) {
    document.getElementById('wl-edit-id').value = item ? item.id : '';

    if (item) {
        wlSymbolSearch.setValue(item.symbol);
        document.getElementById('wl-symbol').disabled = true;
    } else {
        wlSymbolSearch.setData(marketData);
        wlSymbolSearch.clear();
        document.getElementById('wl-symbol').disabled = false;
    }

    document.getElementById('wl-target-buy').value  = item?.target_buy  ?? '';
    document.getElementById('wl-target-sell').value = item?.target_sell ?? '';
    document.getElementById('wl-notes').value        = item?.notes       ?? '';
    document.getElementById('wl-modal-title').innerText = item ? `Edit ${item.symbol}` : 'Add to Watchlist';
    document.getElementById('wl-modal').style.display   = 'flex';
}

// ─────────────────────────────────────────────
// SAVE — Add or Update
// ─────────────────────────────────────────────
async function handleSave() {
    const editId     = document.getElementById('wl-edit-id').value;
    const symbol     = wlSymbolSearch
        ? wlSymbolSearch.getValue()
        : document.getElementById('wl-symbol')?.value.toUpperCase().trim();
    const targetBuy  = parseFloat(document.getElementById('wl-target-buy').value)  || null;
    const targetSell = parseFloat(document.getElementById('wl-target-sell').value) || null;
    const notes      = document.getElementById('wl-notes').value.trim() || null;

    if (!editId && !symbol) { alert('Please select a symbol from the dropdown.'); return; }

    const finalSymbol = editId
        ? watchlistData.find(w => w.id === parseInt(editId))?.symbol
        : symbol;

    if (!finalSymbol) { alert('Symbol not found.'); return; }

    if (editId) {
        await StorageService.updateWatchlistItem(parseInt(editId), { target_buy: targetBuy, target_sell: targetSell, notes });
    } else {
        await StorageService.addToWatchlist({ symbol: finalSymbol, target_buy: targetBuy, target_sell: targetSell, notes });
    }

    document.getElementById('wl-modal').style.display = 'none';
    wlSymbolSearch?.clear();
    showShimmer();
    await refresh(true);
}

// ─────────────────────────────────────────────
// GLOBAL HANDLERS (called from inline onclick)
// ─────────────────────────────────────────────
window.editWatchlistItem = (id) => {
    const item = watchlistData.find(w => w.id === id);
    if (item) openModal(item);
};

window.removeFromWatchlist = async (symbol) => {
    if (!confirm(`Remove ${symbol} from watchlist?`)) return;
    await StorageService.removeFromWatchlist(symbol);
    showShimmer();
    await refresh(true);
};

// ─────────────────────────────────────────────
// BOOTSTRAP
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
