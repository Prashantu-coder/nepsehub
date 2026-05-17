import globalState from '../state.js';
import { Layout } from '../layout.js';
import DataService from '../../services/dataService.js';
import StorageService from '../../services/storageService.js';
import NotificationService from '../../services/notificationService.js';
import { SymbolSearch } from '../components/symbolSearch.js';

let wlSymbolSearch; // Watchlist modal symbol search instance

let marketData = [];
let watchlistData = []; // full rows from DB

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
async function init() {
    globalState.setState({ activePage: 'watchlist' });
    await Layout.init();

    // Initialize SymbolSearch (mounts into #wl-symbol-search)
    wlSymbolSearch = new SymbolSearch({
        wrapperId:   'wl-symbol-search',
        inputId:     'wl-symbol',
        placeholder: 'Type symbol or company name...'
    });

    // Modal
    const modal = document.getElementById('wl-modal');
    document.getElementById('open-wl-modal').onclick     = () => openModal();
    document.getElementById('close-wl-modal').onclick    = () => modal.style.display = 'none';
    document.getElementById('cancel-wl-modal').onclick   = () => modal.style.display = 'none';
    document.getElementById('save-wl-btn').onclick       = handleSave;
    
    const notifBtn = document.getElementById('enable-notifications');
    if (notifBtn) {
        // Reflect current permission status on load
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
                alert('Permission denied. Please enable notifications in your browser settings (click the lock icon in address bar).');
            }
        };
    }
    
    const emptyAddBtn = document.getElementById('empty-add-btn');
    if (emptyAddBtn) emptyAddBtn.onclick = () => openModal();

    // Symbol input → uppercase
    const symInput = document.getElementById('wl-symbol');
    if (symInput) symInput.oninput = () => { symInput.value = symInput.value.toUpperCase(); };

    // Initial load
    await refresh();
    setInterval(refresh, 30000);
}

// ─────────────────────────────────────────────
// DATA REFRESH
// ─────────────────────────────────────────────
async function refresh() {
    const [watchlist, stocks] = await Promise.allSettled([
        StorageService.getWatchlist(),
        DataService.getLiveMarket()
    ]);

    watchlistData = watchlist.status === 'fulfilled' ? (watchlist.value || []) : [];
    marketData    = stocks.status === 'fulfilled'    ? (stocks.value   || []) : [];

    render();
}

// ─────────────────────────────────────────────
// RENDER TABLE
// ─────────────────────────────────────────────
function render() {
    const body     = document.getElementById('watchlistBody');
    const emptyDiv = document.getElementById('wl-empty');
    const countEl  = document.getElementById('wl-count');

    if (!body) return;

    if (countEl) countEl.innerText = `${watchlistData.length} stock${watchlistData.length !== 1 ? 's' : ''} watched`;

    if (watchlistData.length === 0) {
        body.innerHTML = '';
        if (emptyDiv) emptyDiv.style.display = 'block';
        return;
    }
    if (emptyDiv) emptyDiv.style.display = 'none';

    body.innerHTML = watchlistData.map(w => {
        const stock  = marketData.find(s => s.symbol.toUpperCase() === w.symbol.toUpperCase());
        const ltp    = stock ? parseFloat(stock.price) : null;
        const change = stock ? parseFloat(stock.changePercent) : null;

        // Target alerts
        const buyHit  = ltp && w.target_buy  && ltp <= w.target_buy;
        const sellHit = ltp && w.target_sell && ltp >= w.target_sell;

        const ltpHtml = ltp !== null
            ? `<span style="font-weight:700;">${ltp.toFixed(2)}</span>`
            : `<span style="color:var(--text-secondary);">—</span>`;

        const changeHtml = change !== null
            ? `<span class="${change >= 0 ? 'price-up' : 'price-down'}">${change >= 0 ? '+' : ''}${change.toFixed(2)}%</span>`
            : `<span style="color:var(--text-secondary);">—</span>`;

        const targetBuyHtml = w.target_buy
            ? `<span class="target-badge target-buy-badge ${buyHit ? '' : ''}" 
                style="${buyHit ? 'animation:pulse 1s infinite;box-shadow:0 0 8px #10b981;' : ''}">
                Rs. ${w.target_buy} ${buyHit ? '🎯' : ''}
               </span>`
            : `<span style="color:var(--text-secondary); font-size:0.8rem;">—</span>`;

        const targetSellHtml = w.target_sell
            ? `<span class="target-badge target-sell-badge"
                style="${sellHit ? 'animation:pulse 1s infinite;box-shadow:0 0 8px #f43f5e;' : ''}">
                Rs. ${w.target_sell} ${sellHit ? '🎯' : ''}
               </span>`
            : `<span style="color:var(--text-secondary); font-size:0.8rem;">—</span>`;

        const notesHtml = w.notes
            ? `<span class="notes-text" title="${w.notes}">${w.notes}</span>`
            : `<span style="color:var(--text-secondary); font-size:0.8rem;">—</span>`;

        return `
        <tr style="border-left: 3px solid ${buyHit ? '#10b981' : sellHit ? '#f43f5e' : 'transparent'};">
            <td style="font-weight:700; color:var(--primary); cursor:pointer;" onclick="showSymbolDetails('${w.symbol}')">${w.symbol}</td>
            <td>${ltpHtml}</td>
            <td>${changeHtml}</td>
            <td>${targetBuyHtml}</td>
            <td>${targetSellHtml}</td>
            <td>${notesHtml}</td>
            <td>
                <div style="display:flex; gap:0.5rem; justify-content:flex-end;">
                    <button onclick="window.editWatchlistItem(${w.id})"
                        style="background:rgba(99,102,241,0.1);color:#6366f1;border:1px solid rgba(99,102,241,0.3);padding:4px 10px;border-radius:6px;font-size:0.78rem;cursor:pointer;">
                        <i class="fas fa-pen"></i>
                    </button>
                    <button onclick="window.removeFromWatchlist('${w.symbol}')"
                        style="background:rgba(244,63,94,0.1);color:#f43f5e;border:1px solid rgba(244,63,94,0.3);padding:4px 10px;border-radius:6px;font-size:0.78rem;cursor:pointer;">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

// ─────────────────────────────────────────────
// MODAL OPEN (Add or Edit)
// ─────────────────────────────────────────────
function openModal(item = null) {
    document.getElementById('wl-edit-id').value     = item ? item.id : '';

    if (item) {
        // Edit mode: show symbol as plain text, disable search
        wlSymbolSearch.setValue(item.symbol);
        document.getElementById('wl-symbol').disabled = true;
    } else {
        // Add mode: clear and enable search
        wlSymbolSearch.setData(marketData);
        wlSymbolSearch.clear();
        document.getElementById('wl-symbol').disabled = false;
    }

    document.getElementById('wl-target-buy').value  = item?.target_buy  ?? '';
    document.getElementById('wl-target-sell').value = item?.target_sell ?? '';
    document.getElementById('wl-notes').value        = item?.notes ?? '';
    document.getElementById('wl-modal-title').innerText = item ? `Edit ${item.symbol}` : 'Add to Watchlist';
    document.getElementById('wl-modal').style.display = 'flex';
}

// ─────────────────────────────────────────────
// SAVE
// ─────────────────────────────────────────────
async function handleSave() {
    const editId     = document.getElementById('wl-edit-id').value;
    const symbol     = wlSymbolSearch ? wlSymbolSearch.getValue() : document.getElementById('wl-symbol')?.value.toUpperCase().trim();
    const targetBuy  = parseFloat(document.getElementById('wl-target-buy').value)  || null;
    const targetSell = parseFloat(document.getElementById('wl-target-sell').value) || null;
    const notes      = document.getElementById('wl-notes').value.trim() || null;

    if (!editId && !symbol) { alert('Please select a symbol from the dropdown.'); return; }

    // On edit, use the existing symbol from the hidden field
    const finalSymbol = editId
        ? watchlistData.find(w => w.id === parseInt(editId))?.symbol
        : symbol;

    if (!finalSymbol) { alert('Symbol not found.'); return; }

    if (editId) {
        await StorageService.updateWatchlistItem(parseInt(editId), {
            target_buy: targetBuy, target_sell: targetSell, notes
        });
    } else {
        await StorageService.addToWatchlist({ symbol: finalSymbol, target_buy: targetBuy, target_sell: targetSell, notes });
    }

    document.getElementById('wl-modal').style.display = 'none';
    wlSymbolSearch?.clear();
    await refresh();
}

// ─────────────────────────────────────────────
// EDIT & DELETE (Global)
// ─────────────────────────────────────────────
window.editWatchlistItem = (id) => {
    const item = watchlistData.find(w => w.id === id);
    if (item) openModal(item);
};

window.removeFromWatchlist = async (symbol) => {
    if (!confirm(`Remove ${symbol} from watchlist?`)) return;
    await StorageService.removeFromWatchlist(symbol);
    await refresh();
};

document.addEventListener('DOMContentLoaded', init);
