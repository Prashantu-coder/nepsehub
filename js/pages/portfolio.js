import globalState from '../state.js';
import { Layout } from '../layout.js';
import DataService from '../../services/dataService.js';
import StorageService from '../../services/storageService.js';
import FeeService from '../../services/feeService.js';
import PortfolioService from '../../services/portfolioService.js';
import { SymbolSearch } from '../components/symbolSearch.js';

let symbolSearch; // Portfolio modal symbol search instance

let marketData = [];
let allTransactions = [];      // Full ledger from DB
let computedHoldings = [];     // Derived: unsold units per symbol
let currentSellSymbol = null;
let performanceChart, sectorChart, growthChart;

let txCurrentPage = 1;
const txItemsPerPage = 10;
let chartsInitialized = false;



// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
async function init() {
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const tab = btn.dataset.tab;
            ['overview', 'analytics', 'transactions', 'reports'].forEach(t => {
                const el = document.getElementById(`tab-${t}`);
                if (el) el.style.display = t === tab ? 'block' : 'none';
            });
            if (tab === 'transactions') renderTransactions();
            if (tab === 'reports') renderTaxReport();
            if (tab === 'analytics') renderRiskAnalytics();
        };
    });

    document.getElementById('export-tax-csv').onclick = exportTaxCSV;

    // Add Transaction modal
    const modal = document.getElementById('portfolio-modal-overlay');

    // Initialize SymbolSearch inside the modal
    symbolSearch = new SymbolSearch({
        wrapperId: 'portfolio-symbol-search',
        inputId: 'input-symbol',
        placeholder: 'Type symbol or company name...',
        onSelect: () => updateBuyPreview()  // refresh preview when symbol chosen
    });

    document.getElementById('open-portfolio-modal').onclick = () => {
        modal.style.display = 'flex';
        document.getElementById('input-date').valueAsDate = new Date();
        symbolSearch.setData(marketData);   // feed latest market data
        symbolSearch.clear();
        updateBuyPreview();
    };
    document.getElementById('close-portfolio-modal').onclick = () => modal.style.display = 'none';
    document.getElementById('cancel-modal').onclick = () => modal.style.display = 'none';
    document.getElementById('save-holding-btn').onclick = handleSave;

    ['input-qty', 'input-price'].forEach(id =>
        document.getElementById(id).addEventListener('input', updateBuyPreview)
    );

    // Total Capital Config
    const capitalInput = document.getElementById('config-total-capital');
    if (capitalInput) {
        capitalInput.value = localStorage.getItem('nepse_total_capital') || 0;
        capitalInput.addEventListener('input', (e) => {
            localStorage.setItem('nepse_total_capital', e.target.value);
            renderRiskAnalytics(); // Refresh analytics with new capital
        });
    }

    // Sell modal
    const sellModal = document.getElementById('sell-modal-overlay');
    document.getElementById('close-sell-modal').onclick = () => sellModal.style.display = 'none';
    document.getElementById('confirm-sell-btn').onclick = handleSell;
    document.getElementById('sell-input-qty').oninput = updateSellPreview;
    document.getElementById('sell-input-price').oninput = updateSellPreview;

    // Layout & initial data
    globalState.setState({ activePage: 'portfolio' });
    try { await Layout.init(); } catch (e) { }

    // Chart Visibility Toggle
    const toggleChartsBtn = document.getElementById('toggle-charts');
    const chartsGrid = document.getElementById('charts-grid');
    if (toggleChartsBtn && chartsGrid) {
        let chartsVisible = localStorage.getItem('portfolio_charts_visible') !== 'false';

        const updateVisibility = () => {
            chartsGrid.style.display = chartsVisible ? 'grid' : 'none';
            toggleChartsBtn.innerHTML = chartsVisible
                ? '<i class="fas fa-eye-slash"></i> <span>Hide Charts</span>'
                : '<i class="fas fa-eye"></i> <span>Show Charts</span>';
        };

        updateVisibility();

        toggleChartsBtn.onclick = () => {
            chartsVisible = !chartsVisible;
            localStorage.setItem('portfolio_charts_visible', chartsVisible);
            updateVisibility();
            if (chartsVisible) initCharts(); // Re-init if showing to ensure proper sizing
        };
    }

    await refresh(true); // Pass true for initial load skeletons — fetches transactions + market data once
    // Only refresh market data periodically (transactions are loaded once on page load)
    setInterval(refreshMarketOnly, 60000);
}

// ─────────────────────────────────────────────
// DATA REFRESH
// ─────────────────────────────────────────────
async function refresh(isInitial = false) {
    if (isInitial) showSkeletons();

    try {
        const [txRes, mktRes] = await Promise.allSettled([
            StorageService.getTransactions(),
            DataService.getLiveMarket()
        ]);

        allTransactions = (txRes.status === 'fulfilled' && txRes.value && txRes.value.success)
            ? txRes.value.data : [];

        marketData = (mktRes.status === 'fulfilled' && mktRes.value)
            ? mktRes.value : [];

        computedHoldings = PortfolioService.computeHoldings(allTransactions).map(h => ({
            ...h,
            totalInvested: h.totalInvestment,
            quantity: h.qty
        }));

        renderHoldings();
        updateSummaryCards();
        initCharts();
    } catch (error) {
        console.error("Refresh failed:", error);
    }
}

// Refresh only market prices (no transactions re-fetch)
async function refreshMarketOnly() {
    try {
        const mktRes = await DataService.getLiveMarket();
        if (mktRes) marketData = mktRes;

        computedHoldings = PortfolioService.computeHoldings(allTransactions).map(h => ({
            ...h,
            totalInvested: h.totalInvestment,
            quantity: h.qty
        }));

        renderHoldings();
        updateSummaryCards();
        initCharts();
    } catch (error) {
        console.error("Market refresh failed:", error);
    }
}

function showSkeletons() {
    // 1. Stats Grid — shimmer the summary values
    const statIds = ['stat-total-inv', 'stat-current-val', 'stat-unrealized-pnl', 'stat-realized-pnl', 'stat-today-change'];
    statIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '<div class="skeleton skeleton-text" style="width:100px; margin:0.5rem 0;"></div>';
    });

    // 2. Holdings table — re-show wrapper, show HTML shimmer tbody, hide real tbody
    const tableWrap = document.getElementById('holdings-table-wrap');
    const shimmer   = document.getElementById('holdings-shimmer-body');
    const dataBody  = document.getElementById('portfolio-list-body');
    if (tableWrap) tableWrap.style.display = '';   // ensure table is visible
    if (shimmer)   shimmer.style.display   = '';   // show shimmer rows
    if (dataBody)  dataBody.classList.add('pf-loading');

    // 3. Hide empty card while loading
    const emptyCard = document.getElementById('portfolio-empty-msg');
    if (emptyCard) emptyCard.style.display = 'none';
}

// ─────────────────────────────────────────────
// RENDER HOLDINGS TABLE
// ─────────────────────────────────────────────
function renderHoldings() {
    const body        = document.getElementById('portfolio-list-body');
    const shimmer     = document.getElementById('holdings-shimmer-body');
    const tableWrap   = document.getElementById('holdings-table-wrap');
    const emptyCard   = document.getElementById('portfolio-empty-msg');
    if (!body) return;

    // Always hide shimmer tbody once data is ready
    if (shimmer)   shimmer.style.display   = 'none';
    body.classList.remove('pf-loading');

    if (computedHoldings.length === 0) {
        body.innerHTML = '';
        // Hide the whole table, show only the empty card
        if (tableWrap) tableWrap.style.display = 'none';
        if (emptyCard) emptyCard.style.display  = 'flex';
        return;
    }

    // Has data — show table, hide empty card
    if (tableWrap) tableWrap.style.display = '';
    if (emptyCard) emptyCard.style.display  = 'none';

    body.innerHTML = computedHoldings.map(h => {
        const stock = marketData.find(s => s.symbol.toUpperCase() === h.symbol.toUpperCase());
        const ltp = stock ? stock.price : h.wacc;
        const curVal = ltp * h.quantity;
        const pnl = curVal - h.totalInvested;
        const pnlPct = h.totalInvested > 0 ? (pnl / h.totalInvested) * 100 : 0;

        const dayChgVal = stock ? (stock.change * h.quantity) : 0;
        const dayChgPct = stock ? stock.changePercent : 0;

        return `
        <tr>
            <td>
                <div class="symbol-cell-content" style="display: flex; align-items: center; gap: 0.75rem;">
                  <div class="symbol-logo-wrapper" style="position: relative; width: 32px; height: 32px; border-radius: 50%; overflow: hidden; background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                    <img src="../images/stocks/${h.symbol.toUpperCase()}.png" 
                         onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" 
                         alt="${h.symbol}" 
                         style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" />
                    <div class="symbol-avatar" style="display: none; position: absolute; inset: 0; align-items: center; justify-content: center; font-size: 0.8rem; font-weight: 700; text-transform: uppercase; color: #fff; background: linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%); border-radius: 50%; letter-spacing: -0.2px;">
                      ${h.symbol.substring(0, 2)}
                    </div>
                  </div>
                  <div>
                    <div style="font-weight:800; cursor:pointer; color:var(--text-primary); font-size:1rem;" onclick="showSymbolDetails('${h.symbol}')">${h.symbol}</div>
                    <div style="font-size:0.7rem; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.5px;">${stock ? stock.sector : 'Other'}</div>
                  </div>
                </div>
            </td>
            <td style="font-weight:600;">${h.quantity.toFixed(0)}</td>
            <td style="color:var(--text-secondary);">Rs. ${h.wacc.toFixed(2)}</td>
            <td style="font-weight:700;">Rs. ${ltp.toFixed(1)}</td>
            <td style="color:var(--text-secondary);">Rs. ${fmt(h.totalInvested)}</td>
            <td style="font-weight:700;">Rs. ${fmt(curVal)}</td>
            <td>
                <div class="${dayChgVal >= 0 ? 'price-up' : 'price-down'}" style="font-weight:700;">
                    ${dayChgVal >= 0 ? '+' : ''}${fmt(dayChgVal)}
                </div>
                <div style="font-size:0.7rem; opacity:0.8;">${dayChgPct.toFixed(2)}% today</div>
            </td>
            <td>
                <div class="pnl-badge ${pnl >= 0 ? 'pnl-positive' : 'pnl-negative'}">
                    <i class="fas ${pnl >= 0 ? 'fa-caret-up' : 'fa-caret-down'}"></i>
                    <span>${pnlPct.toFixed(2)}%</span>
                </div>
                <div style="font-size:0.75rem; font-weight:600; margin-top:4px; color:${pnl >= 0 ? 'var(--secondary)' : 'var(--danger)'}">
                    ${pnl >= 0 ? '+' : ''}Rs. ${fmt(pnl)}
                </div>
            </td>
            <td>
                <button class="btn-sell-action" onclick="window.openSellModal('${h.symbol}')">
                    <i class="fas fa-hand-holding-dollar"></i> Sell
                </button>
            </td>
        </tr>`;
    }).join('');
}

// ─────────────────────────────────────────────
// SUMMARY CARDS
// ─────────────────────────────────────────────
function updateSummaryCards() {
    let totalInv = 0, totalCur = 0, todayChange = 0;

    computedHoldings.forEach(h => {
        const stock = marketData.find(s => s.symbol.toUpperCase() === h.symbol.toUpperCase());
        const ltp = stock ? stock.price : h.wacc;
        const prevClose = stock ? (stock.previousClose || ltp) : ltp;

        totalInv += h.totalInvested;
        totalCur += ltp * h.quantity;
        todayChange += (ltp - prevClose) * h.quantity;
    });

    const pnl = totalCur - totalInv;
    const pnlPct = totalInv > 0 ? (pnl / totalInv) * 100 : 0;
    const dayPct = (totalCur - todayChange) > 0 ? (todayChange / (totalCur - todayChange)) * 100 : 0;

    // Calculate Realized P&L from SELL transactions (FIFO)
    const { totalRealizedPnL } = calculateRealizedData(allTransactions);

    setText('stat-total-inv', `Rs. ${fmt(totalInv)}`);
    setText('stat-current-val', `Rs. ${fmt(totalCur)}`);
    setText('stat-total-pnl-pct', `${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}% unrealized`);

    const realizedPnLEl = document.getElementById('stat-realized-pnl');
    if (realizedPnLEl) {
        realizedPnLEl.innerText = `Rs. ${fmt(totalRealizedPnL)}`;
        realizedPnLEl.className = `summary-value ${totalRealizedPnL >= 0 ? 'price-up' : 'price-down'}`;
    }

    const pnlEl = document.getElementById('stat-unrealized-pnl');
    if (pnlEl) {
        pnlEl.innerText = `${pnl >= 0 ? '+' : ''}Rs. ${fmt(pnl)}`;
        pnlEl.className = `summary-value ${pnl >= 0 ? 'price-up' : 'price-down'}`;
    }

    const dayEl = document.getElementById('stat-today-change');
    if (dayEl) {
        dayEl.innerText = `${todayChange >= 0 ? '+' : ''}Rs. ${fmt(todayChange)}`;
        dayEl.className = `summary-value ${todayChange >= 0 ? 'price-up' : 'price-down'}`;
    }
    setText('stat-today-pct', `${dayPct >= 0 ? '+' : ''}${dayPct.toFixed(2)}%`);
}

// ─────────────────────────────────────────────
// CHARTS
// ─────────────────────────────────────────────
function initCharts() {
    const perfCard = document.querySelector('.chart-card:nth-child(1)');
    const sectCard = document.querySelector('.chart-card:nth-child(2)');
    if (!perfCard || !sectCard) return;

    // Clear skeletons
    perfCard.querySelectorAll('.skeleton').forEach(s => s.remove());
    sectCard.querySelectorAll('.skeleton').forEach(s => s.remove());
    perfCard.querySelectorAll('.empty-msg').forEach(s => s.remove());
    sectCard.querySelectorAll('.empty-msg').forEach(s => s.remove());

    let perfCanvas = perfCard.querySelector('canvas');
    let sectCanvas = sectCard.querySelector('canvas');

    // Restore canvas if hidden or missing
    if (!perfCanvas) {
        perfCanvas = document.createElement('canvas');
        perfCanvas.id = 'performanceChart';
        perfCard.appendChild(perfCanvas);
    }
    if (!sectCanvas) {
        sectCanvas = document.createElement('canvas');
        sectCanvas.id = 'sectorChart';
        sectCard.appendChild(sectCanvas);
    }
    perfCanvas.style.display = 'block';
    sectCanvas.style.display = 'block';
    perfCanvas.style.height = '320px';
    sectCanvas.style.height = '320px';

    if (performanceChart) performanceChart.destroy();
    if (sectorChart) sectorChart.destroy();

    // Performance: plot cumulative invested vs current value per symbol
    const labels = computedHoldings.map(h => h.symbol);
    const invested = computedHoldings.map(h => +h.totalInvested.toFixed(2));
    const current = computedHoldings.map(h => {
        const stock = marketData.find(s => s.symbol.toUpperCase() === h.symbol.toUpperCase());
        return +((stock ? stock.price : h.wacc) * h.quantity).toFixed(2);
    });

    if (labels.length === 0) {
        // Empty state
        perfCanvas.parentElement.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-secondary);">Add a transaction to see your portfolio performance</div>';
        sectCanvas.parentElement.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-secondary);">No holdings yet</div>';
        return;
    }

    performanceChart = new Chart(perfCanvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels,
            datasets: [
                { label: 'Invested', data: invested, backgroundColor: 'rgba(99,102,241,0.6)', borderRadius: 6 },
                { label: 'Current', data: current, backgroundColor: 'rgba(16,185,129,0.6)', borderRadius: 6 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            layout: { padding: { bottom: 35, left: 10, right: 10, top: 10 } },
            plugins: {
                legend: {
                    position: 'top',
                    labels: { color: '#8b949e', font: { size: 11, weight: '600' }, padding: 25 }
                }
            },
            scales: {
                x: {
                    ticks: { color: '#8b949e', font: { size: 10 }, padding: 12 },
                    grid: { display: false }
                },
                y: {
                    ticks: { color: '#8b949e', font: { size: 10 }, padding: 8, callback: (v) => v >= 1000 ? v / 1000 + 'k' : v },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                }
            }
        }
    });

    // Sector Allocation by current value
    const sectorMap = {};
    computedHoldings.forEach(h => {
        const stock = marketData.find(s => s.symbol.toUpperCase() === h.symbol.toUpperCase());
        const sector = stock?.sector || 'Other';
        const val = (stock ? stock.price : h.wacc) * h.quantity;
        sectorMap[sector] = (sectorMap[sector] || 0) + val;
    });

    sectorChart = new Chart(sectCanvas.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: Object.keys(sectorMap),
            datasets: [{
                data: Object.values(sectorMap),
                backgroundColor: ['#6366f1', '#10b981', '#f59e0b', '#f43f5e', '#8b949e', '#06b6d4'],
                borderWidth: 0,
                hoverOffset: 15
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            cutout: '65%',
            layout: { padding: { bottom: 40, top: 20, left: 10, right: 10 } },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#8b949e', padding: 30, font: { size: 11, weight: '600' } }
                }
            }
        }
    });
}

// ─────────────────────────────────────────────
// TRANSACTION HISTORY TABLE
// ─────────────────────────────────────────────
function renderTransactions() {
    const body      = document.getElementById('transaction-history-body');
    const shimmer   = document.getElementById('tx-shimmer-body');
    const emptyCard = document.getElementById('tx-empty-msg');
    if (!body) return;

    // Hide shimmer tbody once called
    if (shimmer) shimmer.style.display = 'none';
    body.classList.remove('pf-loading');

    if (allTransactions.length === 0) {
        body.innerHTML = '';
        if (emptyCard) emptyCard.style.display = 'flex';
        return;
    }
    if (emptyCard) emptyCard.style.display = 'none';

    const totalFees = allTransactions.reduce((s, t) => s + (t.broker_commission + t.sebon_fee + t.dp_charge), 0);
    const buyTotal = allTransactions.filter(t => t.type?.toUpperCase() === 'BUY').reduce((s, t) => s + t.total_amount, 0);
    const sellTotal = allTransactions.filter(t => t.type?.toUpperCase() === 'SELL').reduce((s, t) => s + t.total_amount, 0);

    // Update summary badges if they exist
    const buyBadge = document.getElementById('tx-buy-total');
    const sellBadge = document.getElementById('tx-sell-total');
    if (buyBadge) buyBadge.innerText = `Buys: Rs. ${fmt(buyTotal)} (${allTransactions.filter(t => t.type?.toUpperCase() === 'BUY').length})`;
    if (sellBadge) sellBadge.innerText = `Sells: Rs. ${fmt(sellTotal)} (${allTransactions.filter(t => t.type?.toUpperCase() === 'SELL').length})`;

    body.innerHTML = allTransactions.map(t => {
        const fees = t.broker_commission + t.sebon_fee + t.dp_charge;
        const isBuy = t.type?.toUpperCase() === 'BUY';
        return `
        <tr>
            <td>${new Date(t.transaction_date).toLocaleDateString()}</td>
            <td>
                <span style="background:${isBuy ? 'rgba(16,185,129,0.15)' : 'rgba(244,63,94,0.15)'};
                    color:${isBuy ? '#10b981' : '#f43f5e'};
                    padding:2px 8px;border-radius:4px;font-size:0.72rem;font-weight:600;">
                    ${t.type}
                </span>
            </td>
            <td style="cursor:pointer;" onclick="showSymbolDetails('${t.symbol}')">
                <div class="symbol-cell-content" style="display: flex; align-items: center; gap: 0.75rem;">
                  <div class="symbol-logo-wrapper" style="position: relative; width: 32px; height: 32px; border-radius: 50%; overflow: hidden; background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                    <img src="../images/stocks/${t.symbol.toUpperCase()}.png" 
                         onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" 
                         alt="${t.symbol}" 
                         style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" />
                    <div class="symbol-avatar" style="display: none; position: absolute; inset: 0; align-items: center; justify-content: center; font-size: 0.8rem; font-weight: 700; text-transform: uppercase; color: #fff; background: linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%); border-radius: 50%; letter-spacing: -0.2px;">
                      ${t.symbol.substring(0, 2)}
                    </div>
                  </div>
                  <div style="display: flex; flex-direction: column;">
                    <span style="font-weight: 700; color: var(--primary);">${t.symbol}</span>
                  </div>
                </div>
            </td>
            <td>${t.quantity}</td>
            <td>Rs. ${t.price.toFixed(2)}</td>
            <td style="color:var(--text-secondary);">Rs. ${fees.toFixed(2)}</td>
            <td style="font-weight:600;">Rs. ${fmt(t.total_amount)}</td>
            <td>
                <button onclick="window.deleteTx(${t.id})"
                    style="background:none;border:none;color:var(--text-secondary);cursor:pointer;">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>`;
    }).join('');
}

// ─────────────────────────────────────────────
// BUY MODAL — FEE PREVIEW
// ─────────────────────────────────────────────
function updateBuyPreview() {
    const qty = parseFloat(document.getElementById('input-qty').value) || 0;
    const price = parseFloat(document.getElementById('input-price').value) || 0;
    const calc = FeeService.calculateBuy(price, qty);

    setText('preview-value', `Rs. ${fmt(calc.purchaseAmount)}`);
    setText('preview-broker', `Rs. ${calc.brokerCommission.toFixed(2)}`);
    setText('preview-sebon', `Rs. ${calc.sebonFee.toFixed(2)}`);
    setText('preview-total-cost', `Rs. ${fmt(calc.totalCost)}`);
    setText('preview-wacc', `Rs. ${calc.wacc.toFixed(2)}`);
}

// ─────────────────────────────────────────────
// SELL MODAL
// ─────────────────────────────────────────────
window.openSellModal = (symbol) => {
    const holding = computedHoldings.find(h => h.symbol === symbol);
    if (!holding) return;
    currentSellSymbol = symbol;

    document.getElementById('sell-modal-title').innerText = `Sell ${symbol}`;
    document.getElementById('sell-max-label').innerText = `Quantity (Max: ${holding.quantity.toFixed(2)})`;
    document.getElementById('sell-input-qty').value = holding.quantity;

    const stock = marketData.find(s => s.symbol.toUpperCase() === symbol.toUpperCase());
    document.getElementById('sell-input-price').value = stock ? stock.price : '';

    const sellDateInput = document.getElementById('sell-input-date');
    if (sellDateInput) {
        sellDateInput.valueAsDate = new Date();
    }

    document.getElementById('sell-modal-overlay').style.display = 'flex';
    updateSellPreview();
};

function updateSellPreview() {
    const holding = computedHoldings.find(h => h.symbol === currentSellSymbol);
    if (!holding) return;

    const qty = parseFloat(document.getElementById('sell-input-qty').value) || 0;
    const price = parseFloat(document.getElementById('sell-input-price').value) || 0;
    const calc = FeeService.calculateSell(price, qty, holding.wacc);

    document.getElementById('sell-fee-preview').innerHTML = `
        <div style="display:flex;align-items:center;gap:0.5rem;color:#f43f5e;margin-bottom:0.75rem;font-weight:600;">
            <i class="fas fa-receipt"></i> Sell Calculation
        </div>
        <div class="fee-row"><span>Receivable (before tax)</span><span>Rs. ${fmt(calc.salesAmount - calc.brokerCommission - calc.sebonFee - calc.dpCharge)}</span></div>
        <div class="fee-row"><span>Broker Commission</span><span>Rs. ${calc.brokerCommission.toFixed(2)}</span></div>
        <div class="fee-row"><span>SEBON Fee</span><span>Rs. ${calc.sebonFee.toFixed(2)}</span></div>
        <div class="fee-row"><span>DP Charge</span><span>Rs. ${calc.dpCharge.toFixed(2)}</span></div>
        <div class="fee-row" style="color:#f59e0b;"><span>CGT (7.5%)</span><span>Rs. ${calc.cgt.toFixed(2)}</span></div>
        <hr style="border:none;border-top:1px solid rgba(244,63,94,0.2);margin:0.5rem 0;">
        <div class="fee-row" style="font-weight:700;font-size:0.95rem;color:${calc.totalProfit >= 0 ? '#10b981' : '#f43f5e'};">
            <span>Net Receivable</span><span>Rs. ${fmt(calc.netReceivable)}</span>
        </div>
        <div class="fee-row" style="font-size:0.75rem;color:${calc.totalProfit >= 0 ? '#10b981' : '#f43f5e'};">
            <span>Profit / Loss</span><span>${calc.totalProfit >= 0 ? '+' : ''}Rs. ${fmt(calc.totalProfit)}</span>
        </div>`;
}

// ─────────────────────────────────────────────
// SAVE BUY TRANSACTION
// ─────────────────────────────────────────────
async function handleSave() {
    const sym = symbolSearch ? symbolSearch.getValue() : document.getElementById('input-symbol')?.value.toUpperCase().trim();
    const qty = parseFloat(document.getElementById('input-qty').value);
    const prc = parseFloat(document.getElementById('input-price').value);
    const date = document.getElementById('input-date').value;
    const source = document.getElementById('input-source').value;

    if (!sym) { alert('Please select a symbol from the dropdown.'); return; }
    if (isNaN(qty) || qty <= 0) { alert('Please enter a valid quantity.'); return; }
    if (isNaN(prc) || prc <= 0) { alert('Please enter a valid price.'); return; }

    const calc = FeeService.calculateBuy(prc, qty);

    const res = await StorageService.addTransaction({
        symbol: sym,
        type: 'BUY',
        quantity: qty,
        price: prc,
        source: source,
        stop_loss: parseFloat(document.getElementById('input-stop-loss').value) || null,
        broker_commission: calc.brokerCommission,
        sebon_fee: calc.sebonFee,
        dp_charge: calc.dpCharge,
        total_amount: calc.totalCost,
        wacc: calc.wacc,
        transaction_date: date || new Date().toISOString()
    });

    if (res.success) {
        document.getElementById('portfolio-modal-overlay').style.display = 'none';
        symbolSearch?.clear();
        document.getElementById('input-qty').value = '';
        document.getElementById('input-price').value = '';
        document.getElementById('input-stop-loss').value = '';
        await refresh();
    } else {
        alert('Save failed: ' + res.error);
    }
}

// ─────────────────────────────────────────────
// SAVE SELL TRANSACTION
// ─────────────────────────────────────────────
async function handleSell() {
    const holding = computedHoldings.find(h => h.symbol === currentSellSymbol);
    if (!holding) return;

    const qty = parseFloat(document.getElementById('sell-input-qty').value);
    const price = parseFloat(document.getElementById('sell-input-price').value);
    const date = document.getElementById('sell-input-date').value;

    if (isNaN(qty) || qty <= 0 || qty > holding.quantity) {
        alert(`Cannot sell more than ${holding.quantity} units of ${currentSellSymbol}`);
        return;
    }

    const calc = FeeService.calculateSell(price, qty, holding.wacc);

    const res = await StorageService.addTransaction({
        symbol: currentSellSymbol,
        type: 'SELL',
        quantity: qty,
        price: price,
        broker_commission: calc.brokerCommission,
        sebon_fee: calc.sebonFee,
        dp_charge: calc.dpCharge,
        capital_gain_tax: calc.cgt,
        profit_loss: calc.totalProfit,
        total_amount: calc.netReceivable,
        transaction_date: date || new Date().toISOString()
    });

    if (res.success) {
        document.getElementById('sell-modal-overlay').style.display = 'none';
        await refresh();
    }
}

// ─────────────────────────────────────────────
// DELETE TRANSACTION
// ─────────────────────────────────────────────
window.deleteTx = async (id) => {
    if (!confirm('Delete this transaction? Holdings will be recalculated.')) return;
    await StorageService.deleteTransaction(id);
    await refresh();
    renderTransactions();
};

// ─────────────────────────────────────────────
// TAX REPORT GENERATOR
// ─────────────────────────────────────────────
function renderTaxReport() {
    const tbody = document.getElementById('tax-report-body');
    if (!tbody) return;

    const { reportData } = calculateRealizedData(allTransactions);

    if (reportData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:3rem;color:var(--text-secondary);">No realized trades found yet. Sell some stocks to see tax reports.</td></tr>`;
        return;
    }

    tbody.innerHTML = reportData.reverse().map(row => `
        <tr>
            <td style="cursor:pointer;" onclick="showSymbolDetails('${row.symbol}')">
                <div class="symbol-cell-content" style="display: flex; align-items: center; gap: 0.75rem;">
                  <div class="symbol-logo-wrapper" style="position: relative; width: 32px; height: 32px; border-radius: 50%; overflow: hidden; background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                    <img src="../images/stocks/${row.symbol.toUpperCase()}.png" 
                         onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" 
                         alt="${row.symbol}" 
                         style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" />
                    <div class="symbol-avatar" style="display: none; position: absolute; inset: 0; align-items: center; justify-content: center; font-size: 0.8rem; font-weight: 700; text-transform: uppercase; color: #fff; background: linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%); border-radius: 50%; letter-spacing: -0.2px;">
                      ${row.symbol.substring(0, 2)}
                    </div>
                  </div>
                  <div style="display: flex; flex-direction: column;">
                    <span style="font-weight: 700; color: var(--primary);">${row.symbol}</span>
                  </div>
                </div>
            </td>
            <td>${row.sellDate}</td>
            <td>
                <span class="badge ${row.holdDays > 365 ? 'badge-success' : 'badge-warning'}" style="font-size:0.65rem;">
                    ${row.holdDays} days (${row.holdDays > 365 ? 'LT' : 'ST'})
                </span>
            </td>
            <td>${row.qty}</td>
            <td>Rs. ${fmt(row.sellPrice)}</td>
            <td>Rs. ${fmt(row.wacc)}</td>
            <td style="color:${row.pnl >= 0 ? '#10b981' : '#f43f5e'};font-weight:600;">
                ${row.pnl >= 0 ? '+' : ''}${fmt(row.pnl)}
            </td>
            <td style="color:#f59e0b;font-weight:600;">Rs. ${fmt(row.tax)}</td>
        </tr>
    `).join('');
}

function exportTaxCSV() {
    const table = document.querySelector('#tab-reports table');
    if (!table) return;

    let csv = [];
    const rows = table.querySelectorAll('tr');

    for (let i = 0; i < rows.length; i++) {
        const row = [], cols = rows[i].querySelectorAll('td, th');
        for (let j = 0; j < cols.length; j++) {
            row.push('"' + cols[j].innerText.replace(/"/g, '""') + '"');
        }
        csv.push(row.join(','));
    }

    const csvContent = "data:text/csv;charset=utf-8," + csv.join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `NEPSE_Tax_Report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// ─────────────────────────────────────────────
// RISK ANALYTICS RENDERING
// ─────────────────────────────────────────────
function renderRiskAnalytics() {
    const holdingsWithRisk = computeHoldingsWithRisk(allTransactions);
    let totalRiskStake = 0;
    let totalCurrentValue = 0;
    const sectorExposure = {};

    holdingsWithRisk.forEach(h => {
        const stock = marketData.find(s => s.symbol.toUpperCase() === h.symbol.toUpperCase());
        const ltp = stock ? stock.price : h.wacc;
        const curVal = ltp * h.quantity;

        totalCurrentValue += curVal;

        // Risk at Stake = (WACC - SL) * Qty
        if (h.stopLoss) {
            const riskPerShare = Math.max(0, h.wacc - h.stopLoss);
            totalRiskStake += riskPerShare * h.quantity;
        }

        // Sector mapping
        const sector = stock ? stock.sector : 'Unknown';
        if (!sectorExposure[sector]) sectorExposure[sector] = 0;
        sectorExposure[sector] += curVal;
    });

    // Update Top Cards
    const totalCapital = parseFloat(localStorage.getItem('nepse_total_capital')) || 0;
    const riskPctOfCap = totalCapital > 0 ? (totalRiskStake / totalCapital) * 100 : 0;

    setText('risk-total-stake', `Rs. ${fmt(totalRiskStake)}`);
    setText('risk-total-pct', `${totalCapital > 0 ? riskPctOfCap.toFixed(2) : '0.00'}% of total capital`);

    setText('risk-cap-exposure', `Rs. ${fmt(totalCurrentValue)}`);
    const exposurePct = totalCapital > 0 ? (totalCurrentValue / totalCapital) * 100 : 0;
    setText('risk-cap-pct', `${exposurePct.toFixed(1)}% of total capital`);

    const buyingPower = Math.max(0, totalCapital - totalCurrentValue);
    setText('risk-buying-power', `Rs. ${fmt(buyingPower)}`);

    const sectorCount = Object.keys(sectorExposure).length;
    setText('risk-sector-count', `across ${sectorCount} sectors`);
    setText('risk-diversification', sectorCount > 4 ? 'Excellent' : sectorCount > 2 ? 'Good' : 'Concentrated');

    // Sector Concentration List
    const concList = document.getElementById('sector-concentration-list');
    if (concList) {
        concList.innerHTML = Object.entries(sectorExposure)
            .sort((a, b) => b[1] - a[1])
            .map(([name, val]) => {
                const pct = totalCurrentValue > 0 ? (val / totalCurrentValue) * 100 : 0;
                return `
                    <div class="concentration-item">
                        <div class="concentration-info">
                            <span>${name}</span>
                            <span>${pct.toFixed(1)}%</span>
                        </div>
                        <div class="concentration-bar-bg">
                            <div class="concentration-bar-fill" style="width: ${pct}%; background: ${pct > 40 ? 'linear-gradient(90deg, var(--danger), #ff6b6b)' : 'linear-gradient(90deg, var(--secondary), #34d399)'};"></div>
                        </div>
                    </div>
                `;
            }).join('');
    }

    // Risk Warnings
    const warnings = [];
    Object.entries(sectorExposure).forEach(([name, val]) => {
        const pct = totalCurrentValue > 0 ? (val / totalCurrentValue) * 100 : 0;
        if (pct > 40) {
            warnings.push({
                type: 'danger',
                msg: `High Concentration: Your exposure to <strong>${name}</strong> is ${pct.toFixed(1)}%. Consider diversifying.`
            });
        }
    });

    if (riskPctOfCap > 5) {
        warnings.push({
            type: 'danger',
            msg: `High Portfolio Risk: You are risking ${riskPctOfCap.toFixed(1)}% of your capital. Standard limit is 1-2%.`
        });
    }

    if (sectorCount < 3 && totalCurrentValue > 0) {
        warnings.push({
            type: 'low',
            msg: `Low Diversification: You only have holdings in ${sectorCount} sectors. Explore other industries.`
        });
    }

    const warningEl = document.getElementById('risk-warnings-list');
    if (warningEl) {
        if (warnings.length === 0) {
            warningEl.innerHTML = '<div style="color:var(--text-secondary);font-size:0.85rem;padding:1rem;text-align:center;">No major risks detected. Trade safe!</div>';
        } else {
            warningEl.innerHTML = warnings.map(w => `
                <div class="warning-item ${w.type === 'low' ? 'warning-low' : ''}">
                    <i class="fas ${w.type === 'danger' ? 'fa-exclamation-circle' : 'fa-info-circle'}" 
                       style="color: ${w.type === 'danger' ? '#f43f5e' : '#f59e0b'};"></i>
                    <span>${w.msg}</span>
                </div>
            `).join('');
        }
    }

    renderGrowthAndCAGR();
}

function renderGrowthAndCAGR() {
    const canvas = document.getElementById('historicalGrowthChart');
    if (!canvas) return;

    if (growthChart) {
        growthChart.destroy();
    }

    if (allTransactions.length === 0) {
        canvas.parentElement.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-secondary);font-size:0.85rem;">Add buy transactions to see your growth curve & CAGR.</div>`;
        setText('stat-cagr-value', '0.00% CAGR');
        setText('analytics-total-invested', 'Rs. 0.00');
        setText('analytics-time-horizon', '0.00 Years');
        setText('analytics-alltime-perf', '0.00%');
        return;
    }

    // Sort transactions chronologically
    const sortedTx = [...allTransactions].sort((a,b) => new Date(a.transaction_date) - new Date(b.transaction_date));
    
    // Calculations
    const earliestDate = new Date(sortedTx[0].transaction_date);
    const timeHorizonYears = Math.max(0.01, (new Date() - earliestDate) / (1000 * 60 * 60 * 24 * 365.25));

    let totalInvested = 0;
    let totalCurrentValue = 0;
    computedHoldings.forEach(h => {
        totalInvested += h.totalInvested;
        const stock = marketData.find(s => s.symbol.toUpperCase() === h.symbol.toUpperCase());
        const ltp = stock ? stock.price : h.wacc;
        totalCurrentValue += ltp * h.quantity;
    });

    const absoluteReturn = totalInvested > 0 ? ((totalCurrentValue - totalInvested) / totalInvested) * 100 : 0;
    let cagr = 0;
    if (totalInvested > 0 && totalCurrentValue > 0) {
        cagr = (Math.pow((totalCurrentValue / totalInvested), (1 / timeHorizonYears)) - 1) * 100;
    }

    // Set texts
    const cagrEl = document.getElementById('stat-cagr-value');
    if (cagrEl) {
        cagrEl.innerText = `${cagr >= 0 ? '+' : ''}${cagr.toFixed(2)}% CAGR`;
        cagrEl.style.color = cagr >= 0 ? 'var(--secondary)' : 'var(--danger)';
    }
    setText('analytics-total-invested', `Rs. ${fmt(totalInvested)}`);
    setText('analytics-time-horizon', `${timeHorizonYears.toFixed(2)} Years`);
    
    const perfEl = document.getElementById('analytics-alltime-perf');
    if (perfEl) {
        perfEl.innerText = `${absoluteReturn >= 0 ? '+' : ''}${absoluteReturn.toFixed(2)}%`;
        perfEl.style.color = absoluteReturn >= 0 ? 'var(--secondary)' : 'var(--danger)';
    }

    // Prepare chart data
    let runningInvested = 0;
    let runningQty = {};
    let labels = [];
    let investedData = [];
    let valuationData = [];

    sortedTx.forEach(tx => {
        const dateStr = new Date(tx.transaction_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        labels.push(dateStr);

        const sym = tx.symbol.toUpperCase();
        if (tx.type?.toUpperCase() === 'BUY') {
            runningInvested += tx.total_amount;
            runningQty[sym] = (runningQty[sym] || 0) + tx.quantity;
        } else if (tx.type?.toUpperCase() === 'SELL') {
            const avgCost = runningQty[sym] > 0 ? (runningInvested / runningQty[sym]) : 0;
            runningInvested = Math.max(0, runningInvested - (tx.quantity * (tx.wacc || avgCost)));
            runningQty[sym] = Math.max(0, (runningQty[sym] || 0) - tx.quantity);
        }

        investedData.push(runningInvested);

        let currentVal = 0;
        Object.entries(runningQty).forEach(([s, q]) => {
            const stock = marketData.find(st => st.symbol.toUpperCase() === s);
            const ltp = stock ? stock.price : 0;
            currentVal += ltp * q;
        });
        valuationData.push(currentVal);
    });

    const ctx = canvas.getContext('2d');
    
    // Gradient fills
    const investedGrad = ctx.createLinearGradient(0, 0, 0, 240);
    investedGrad.addColorStop(0, 'rgba(99, 102, 241, 0.25)');
    investedGrad.addColorStop(1, 'rgba(99, 102, 241, 0.00)');

    const valuationGrad = ctx.createLinearGradient(0, 0, 0, 240);
    valuationGrad.addColorStop(0, 'rgba(16, 185, 129, 0.25)');
    valuationGrad.addColorStop(1, 'rgba(16, 185, 129, 0.00)');

    growthChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Invested Capital',
                    data: investedData,
                    borderColor: '#6366f1',
                    borderWidth: 2,
                    backgroundColor: investedGrad,
                    fill: true,
                    tension: 0.35,
                    pointRadius: 2,
                    pointHoverRadius: 5
                },
                {
                    label: 'Portfolio Valuation',
                    data: valuationData,
                    borderColor: '#10b981',
                    borderWidth: 2,
                    backgroundColor: valuationGrad,
                    fill: true,
                    tension: 0.35,
                    pointRadius: 2,
                    pointHoverRadius: 5
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: '#8b949e',
                        font: { size: 10, weight: '600' }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.95)',
                    titleColor: '#fff',
                    bodyColor: '#cbd5e1',
                    borderColor: 'rgba(255,255,255,0.08)',
                    borderWidth: 1,
                    padding: 10,
                    displayColors: true,
                    callbacks: {
                        label: function(context) {
                            return `${context.dataset.label}: Rs. ${Number(context.raw).toLocaleString('en-IN', { maximumFractionDigits: 1 })}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: '#8b949e', font: { size: 9 } },
                    grid: { display: false }
                },
                y: {
                    ticks: {
                        color: '#8b949e',
                        font: { size: 9 },
                        callback: (v) => v >= 1000 ? v / 1000 + 'k' : v
                    },
                    grid: { color: 'rgba(255, 255, 255, 0.04)' }
                }
            }
        }
    });
}

function computeHoldingsWithRisk(transactions) {
    return PortfolioService.computeHoldings(transactions).map(h => ({
        ...h,
        quantity: h.qty
    }));
}

function calculateRealizedData(transactions) {
    const sells = transactions.filter(t => t.type?.toUpperCase() === 'SELL').sort((a, b) => new Date(a.transaction_date) - new Date(b.transaction_date));
    const buys = transactions.filter(t => t.type?.toUpperCase() === 'BUY').sort((a, b) => new Date(a.transaction_date) - new Date(b.transaction_date));

    // Deep copy buys to track remaining quantities for FIFO
    let buyPool = buys.map(b => ({ ...b, remaining: b.quantity }));
    let reportData = [];
    let totalRealizedPnL = 0;

    sells.forEach(sell => {
        let qtyToMatch = sell.quantity;

        // Find matching buys for this sell
        for (let buy of buyPool) {
            if (qtyToMatch <= 0) break;
            if (buy.symbol !== sell.symbol || buy.remaining <= 0) continue;

            const matchedQty = Math.min(qtyToMatch, buy.remaining);
            const holdDays = Math.floor((new Date(sell.transaction_date) - new Date(buy.transaction_date)) / (1000 * 60 * 60 * 24));

            // Tax rate: 5% if > 365 days, 7.5% if <= 365 days
            const isLongTerm = holdDays > 365;
            const taxRate = isLongTerm ? 0.05 : 0.075;

            // Cost calculation (Buy Price includes fees)
            const buyCostPerUnit = buy.total_amount / buy.quantity;
            const totalCost = buyCostPerUnit * matchedQty;

            // Sale calculation (Net Receivable - Proportional Purchase Cost)
            const profit = sell.total_amount * (matchedQty / sell.quantity) - totalCost;
            const tax = profit > 0 ? profit * taxRate : 0;

            totalRealizedPnL += profit;

            reportData.push({
                symbol: sell.symbol,
                sellDate: new Date(sell.transaction_date).toLocaleDateString(),
                holdDays,
                qty: matchedQty,
                sellPrice: sell.price,
                wacc: buyCostPerUnit,
                pnl: profit,
                tax: tax
            });

            buy.remaining -= matchedQty;
            qtyToMatch -= matchedQty;
        }
    });

    return { reportData, totalRealizedPnL };
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
function fmt(n) { return Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 }); }
function setText(id, val) { const el = document.getElementById(id); if (el) el.innerText = val; }

document.addEventListener('DOMContentLoaded', init);
