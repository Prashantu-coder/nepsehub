import globalState from '../state.js';
import { Layout } from '../layout.js';
import DataService from '../../services/dataService.js';
import StorageService from '../../services/storageService.js';
import FeeService from '../../services/feeService.js';
import { SymbolSearch } from '../components/symbolSearch.js';

let symbolSearch; // Portfolio modal symbol search instance

let marketData = [];
let allTransactions = [];      // Full ledger from DB
let computedHoldings = [];     // Derived: unsold units per symbol
let currentSellSymbol = null;
let performanceChart, sectorChart;

// ─────────────────────────────────────────────
// CORE: Compute holdings from the transaction ledger
// Holdings = SUM(BUY qty) - SUM(SELL qty) per symbol
// WACC     = weighted average of BUY total_amount / total_buy_qty
// ─────────────────────────────────────────────
function computeHoldingsFromTransactions(transactions) {
    const symbolMap = {};

    // Sort oldest first for running average
    const sorted = [...transactions].sort((a, b) => {
        if (a.transaction_date < b.transaction_date) return -1;
        if (a.transaction_date > b.transaction_date) return 1;
        return (a.id || 0) - (b.id || 0);
    });

    sorted.forEach(t => {
        const sym = t.symbol.toUpperCase();
        const type = t.type ? t.type.toUpperCase() : '';
        
        if (!symbolMap[sym]) {
            symbolMap[sym] = { qty: 0, totalInvestment: 0, wacc: 0 };
        }
        
        const h = symbolMap[sym];
        
        if (type === 'BUY') {
            // New Total Investment = Previous Total Investment + New Amount (Price*Qty + Fees)
            h.totalInvestment = Number((h.totalInvestment + t.total_amount).toFixed(4));
            // New Total Quantity = Previous Quantity + New Quantity
            h.qty += t.quantity;
            // New WACC = Total Investment / Total Quantity
            h.wacc = h.qty > 0 ? Number((h.totalInvestment / h.qty).toFixed(4)) : 0;
        } else if (type === 'SELL') {
            // When selling, WACC remains the same. 
            // But we must reduce the Total Investment by the cost-value of sold shares.
            const costOfSoldShares = Number((h.wacc * t.quantity).toFixed(4));
            h.totalInvestment = Number((h.totalInvestment - costOfSoldShares).toFixed(4));
            h.qty -= t.quantity;
            
            // Clean up if position closed
            if (h.qty <= 0.0001) {
                h.qty = 0; h.totalInvestment = 0; h.wacc = 0;
            }
        }
    });

    return Object.entries(symbolMap)
        .filter(([sym, data]) => data.qty > 0.0001)
        .map(([sym, data]) => ({
            symbol: sym,
            quantity: data.qty,
            totalInvested: data.totalInvestment,
            wacc: data.wacc
        }));
}

function computeHoldingsWithRisk(transactions) {
    const holdings = computeHoldingsFromTransactions(transactions);
    
    // Enrich with latest Stop Loss from ledger
    return holdings.map(h => {
        const lastBuy = transactions
            .filter(t => t.symbol === h.symbol && t.type === 'BUY' && t.stop_loss)
            .sort((a,b) => new Date(b.transaction_date) - new Date(a.transaction_date))[0];
        
        return {
            ...h,
            stopLoss: lastBuy ? lastBuy.stop_loss : null
        };
    });
}

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
        wrapperId:   'portfolio-symbol-search',
        inputId:     'input-symbol',
        placeholder: 'Type symbol or company name...',
        onSelect:    () => updateBuyPreview()  // refresh preview when symbol chosen
    });

    document.getElementById('open-portfolio-modal').onclick = () => {
        modal.style.display = 'flex';
        document.getElementById('input-date').valueAsDate = new Date();
        symbolSearch.setData(marketData);   // feed latest market data
        symbolSearch.clear();
        updateBuyPreview();
    };
    document.getElementById('close-portfolio-modal').onclick = () => modal.style.display = 'none';
    document.getElementById('cancel-modal').onclick             = () => modal.style.display = 'none';
    document.getElementById('save-holding-btn').onclick         = handleSave;

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
    document.getElementById('close-sell-modal').onclick   = () => sellModal.style.display = 'none';
    document.getElementById('confirm-sell-btn').onclick   = handleSell;
    document.getElementById('sell-input-qty').oninput     = updateSellPreview;
    document.getElementById('sell-input-price').oninput   = updateSellPreview;

    // Layout & initial data
    globalState.setState({ activePage: 'portfolio' });
    try { await Layout.init(); } catch(e) {}

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

    await refresh(true); // Pass true for initial load skeletons
    setInterval(refresh, 60000);
}

// ─────────────────────────────────────────────
// DATA REFRESH
// ─────────────────────────────────────────────
async function refresh(isInitial = false) {
    if (isInitial) showSkeletons();

    const [txRes, mktRes] = await Promise.allSettled([
        StorageService.getTransactions(),
        DataService.getLiveMarket()
    ]);

    allTransactions = (txRes.status === 'fulfilled' && txRes.value.success)
        ? txRes.value.data : [];

    marketData = (mktRes.status === 'fulfilled')
        ? (mktRes.value || []) : [];

    computedHoldings = computeHoldingsFromTransactions(allTransactions);

    renderHoldings();
    updateSummaryCards();
    initCharts();
}

function showSkeletons() {
    // 1. Stats Grid
    const statIds = ['stat-total-inv', 'stat-current-val', 'stat-unrealized-pnl', 'stat-realized-pnl', 'stat-today-change'];
    statIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '<div class="skeleton skeleton-text" style="width: 100px; margin: 0.5rem 0;"></div>';
    });

    // 2. Table
    const body = document.getElementById('portfolio-list-body');
    if (body) {
        body.innerHTML = Array(3).fill(0).map(() => `
            <tr>
                <td><div class="skeleton skeleton-text" style="width: 60px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width: 40px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width: 70px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width: 70px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width: 80px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width: 80px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width: 90px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width: 90px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width: 50px;"></div></td>
            </tr>
        `).join('');
    }

    // 3. Charts (if visible)
    const perfCanvas = document.getElementById('performanceChart');
    const sectCanvas = document.getElementById('sectorChart');
    if (perfCanvas) perfCanvas.parentElement.innerHTML = '<div class="skeleton skeleton-chart"></div>';
    if (sectCanvas) sectCanvas.parentElement.innerHTML = '<div class="skeleton skeleton-chart"></div>';
}

// ─────────────────────────────────────────────
// RENDER HOLDINGS TABLE
// ─────────────────────────────────────────────
function renderHoldings() {
    const body = document.getElementById('portfolio-list-body');
    const emptyMsg = document.getElementById('portfolio-empty-msg');
    if (!body) return;

    if (computedHoldings.length === 0) {
        body.innerHTML = '';
        if (emptyMsg) emptyMsg.style.display = 'block';
        return;
    }
    if (emptyMsg) emptyMsg.style.display = 'none';

    body.innerHTML = computedHoldings.map(h => {
        const stock   = marketData.find(s => s.symbol.toUpperCase() === h.symbol.toUpperCase());
        const ltp     = stock ? stock.price : h.wacc;
        const curVal  = ltp * h.quantity;
        const pnl     = curVal - h.totalInvested;
        const pnlPct  = h.totalInvested > 0 ? (pnl / h.totalInvested) * 100 : 0;

        const dayChgVal = stock ? (stock.change * h.quantity) : 0;
        const dayChgPct = stock ? stock.changePercent : 0;

        return `
        <tr>
            <td style="font-weight:700; cursor:pointer; color:var(--primary);" onclick="showSymbolDetails('${h.symbol}')">${h.symbol}</td>
            <td>${h.quantity.toFixed(2)}</td>
            <td>Rs. ${h.wacc.toFixed(2)}</td>
            <td>Rs. ${ltp.toFixed(2)}</td>
            <td>Rs. ${h.totalInvested.toLocaleString('en-IN', {maximumFractionDigits:2})}</td>
            <td>Rs. ${curVal.toLocaleString('en-IN', {maximumFractionDigits:2})}</td>
            <td class="${dayChgVal >= 0 ? 'price-up' : 'price-down'}">
                ${dayChgVal >= 0 ? '+' : ''}${dayChgVal.toLocaleString('en-IN', {maximumFractionDigits:2})}
                <div style="font-size:0.7rem;">(${dayChgPct.toFixed(2)}%)</div>
            </td>
            <td class="${pnl >= 0 ? 'price-up' : 'price-down'}">
                ${pnl >= 0 ? '+' : ''}${pnl.toLocaleString('en-IN', {maximumFractionDigits:2})}
                <div style="font-size:0.7rem;">(${pnlPct.toFixed(2)}%)</div>
            </td>
            <td>
                <button class="btn btn-sm"
                    style="background:rgba(244,63,94,0.1);color:var(--danger);border:1px solid rgba(244,63,94,0.3);padding:4px 10px;border-radius:6px;"
                    onclick="window.openSellModal('${h.symbol}')">SELL</button>
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
        const stock    = marketData.find(s => s.symbol.toUpperCase() === h.symbol.toUpperCase());
        const ltp      = stock ? stock.price : h.wacc;
        const prevClose= stock ? (stock.previousClose || ltp) : ltp;

        totalInv    += h.totalInvested;
        totalCur    += ltp * h.quantity;
        todayChange += (ltp - prevClose) * h.quantity;
    });

    const pnl    = totalCur - totalInv;
    const pnlPct = totalInv > 0 ? (pnl / totalInv) * 100 : 0;
    const dayPct = (totalCur - todayChange) > 0 ? (todayChange / (totalCur - todayChange)) * 100 : 0;

    // Calculate Realized P&L from SELL transactions (FIFO)
    const { totalRealizedPnL } = calculateRealizedData(allTransactions);

    setText('stat-total-inv',   `Rs. ${fmt(totalInv)}`);
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
    const perfCanvas = document.getElementById('performanceChart');
    const sectCanvas = document.getElementById('sectorChart');
    if (!perfCanvas || !sectCanvas) return;

    if (performanceChart) performanceChart.destroy();
    if (sectorChart) sectorChart.destroy();

    // Performance: plot cumulative invested vs current value per symbol
    const labels   = computedHoldings.map(h => h.symbol);
    const invested = computedHoldings.map(h => +h.totalInvested.toFixed(2));
    const current  = computedHoldings.map(h => {
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
                { label: 'Current',  data: current,  backgroundColor: 'rgba(16,185,129,0.6)', borderRadius: 6 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { labels: { color: '#8b949e' } } },
            scales: { x: { ticks: { color: '#8b949e' } }, y: { ticks: { color: '#8b949e' } } }
        }
    });

    // Sector Allocation by current value
    const sectorMap = {};
    computedHoldings.forEach(h => {
        const stock  = marketData.find(s => s.symbol.toUpperCase() === h.symbol.toUpperCase());
        const sector = stock?.sector || 'Other';
        const val    = (stock ? stock.price : h.wacc) * h.quantity;
        sectorMap[sector] = (sectorMap[sector] || 0) + val;
    });

    sectorChart = new Chart(sectCanvas.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: Object.keys(sectorMap),
            datasets: [{
                data: Object.values(sectorMap),
                backgroundColor: ['#6366f1','#10b981','#f59e0b','#f43f5e','#8b949e','#06b6d4'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { color: '#8b949e' } } }
        }
    });
}

// ─────────────────────────────────────────────
// TRANSACTION HISTORY TABLE
// ─────────────────────────────────────────────
function renderTransactions() {
    const body = document.getElementById('transaction-history-body');
    if (!body) return;

    if (allTransactions.length === 0) {
        body.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--text-secondary);">No transactions yet</td></tr>`;
        return;
    }

    const totalFees = allTransactions.reduce((s, t) => s + (t.broker_commission + t.sebon_fee + t.dp_charge), 0);
    const buyTotal  = allTransactions.filter(t => t.type?.toUpperCase() === 'BUY').reduce((s, t) => s + t.total_amount, 0);
    const sellTotal = allTransactions.filter(t => t.type?.toUpperCase() === 'SELL').reduce((s, t) => s + t.total_amount, 0);

    // Update summary badges if they exist
    const buyBadge = document.getElementById('tx-buy-total');
    const sellBadge = document.getElementById('tx-sell-total');
    if (buyBadge) buyBadge.innerText = `Buys: Rs. ${fmt(buyTotal)} (${allTransactions.filter(t=>t.type?.toUpperCase()==='BUY').length})`;
    if (sellBadge) sellBadge.innerText = `Sells: Rs. ${fmt(sellTotal)} (${allTransactions.filter(t=>t.type?.toUpperCase()==='SELL').length})`;

    body.innerHTML = allTransactions.map(t => {
        const fees   = t.broker_commission + t.sebon_fee + t.dp_charge;
        const isBuy  = t.type?.toUpperCase() === 'BUY';
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
            <td style="font-weight:700; cursor:pointer; color:var(--primary);" onclick="showSymbolDetails('${t.symbol}')">${t.symbol}</td>
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
    const qty   = parseFloat(document.getElementById('input-qty').value)   || 0;
    const price = parseFloat(document.getElementById('input-price').value) || 0;
    const calc  = FeeService.calculateBuy(price, qty);

    setText('preview-value',      `Rs. ${fmt(calc.purchaseAmount)}`);
    setText('preview-broker',     `Rs. ${calc.brokerCommission.toFixed(2)}`);
    setText('preview-sebon',      `Rs. ${calc.sebonFee.toFixed(2)}`);
    setText('preview-total-cost', `Rs. ${fmt(calc.totalCost)}`);
    setText('preview-wacc',       `Rs. ${calc.wacc.toFixed(2)}`);
}

// ─────────────────────────────────────────────
// SELL MODAL
// ─────────────────────────────────────────────
window.openSellModal = (symbol) => {
    const holding = computedHoldings.find(h => h.symbol === symbol);
    if (!holding) return;
    currentSellSymbol = symbol;

    document.getElementById('sell-modal-title').innerText = `Sell ${symbol}`;
    document.getElementById('sell-max-label').innerText   = `Quantity (Max: ${holding.quantity.toFixed(2)})`;
    document.getElementById('sell-input-qty').value       = holding.quantity;

    const stock = marketData.find(s => s.symbol.toUpperCase() === symbol.toUpperCase());
    document.getElementById('sell-input-price').value = stock ? stock.price : '';

    document.getElementById('sell-modal-overlay').style.display = 'flex';
    updateSellPreview();
};

function updateSellPreview() {
    const holding = computedHoldings.find(h => h.symbol === currentSellSymbol);
    if (!holding) return;

    const qty   = parseFloat(document.getElementById('sell-input-qty').value)   || 0;
    const price = parseFloat(document.getElementById('sell-input-price').value) || 0;
    const calc  = FeeService.calculateSell(price, qty, holding.wacc);

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
    const sym   = symbolSearch ? symbolSearch.getValue() : document.getElementById('input-symbol')?.value.toUpperCase().trim();
    const qty   = parseFloat(document.getElementById('input-qty').value);
    const prc   = parseFloat(document.getElementById('input-price').value);
    const date  = document.getElementById('input-date').value;
    const source = document.getElementById('input-source').value;

    if (!sym)              { alert('Please select a symbol from the dropdown.'); return; }
    if (isNaN(qty) || qty <= 0) { alert('Please enter a valid quantity.'); return; }
    if (isNaN(prc) || prc <= 0) { alert('Please enter a valid price.'); return; }

    const calc = FeeService.calculateBuy(prc, qty);

    const res = await StorageService.addTransaction({
        symbol:             sym,
        type:               'BUY',
        quantity:           qty,
        price:              prc,
        source:             source,
        stop_loss:          parseFloat(document.getElementById('input-stop-loss').value) || null,
        broker_commission:  calc.brokerCommission,
        sebon_fee:          calc.sebonFee,
        dp_charge:          calc.dpCharge,
        total_amount:       calc.totalCost,
        wacc:               calc.wacc,
        transaction_date:   date || new Date().toISOString()
    });

    if (res.success) {
        document.getElementById('portfolio-modal-overlay').style.display = 'none';
        symbolSearch?.clear();
        document.getElementById('input-qty').value   = '';
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

    const qty   = parseFloat(document.getElementById('sell-input-qty').value);
    const price = parseFloat(document.getElementById('sell-input-price').value);

    if (isNaN(qty) || qty <= 0 || qty > holding.quantity) {
        alert(`Cannot sell more than ${holding.quantity} units of ${currentSellSymbol}`);
        return;
    }

    const calc = FeeService.calculateSell(price, qty, holding.wacc);

    const res = await StorageService.addTransaction({
        symbol:             currentSellSymbol,
        type:               'SELL',
        quantity:           qty,
        price:              price,
        broker_commission:  calc.brokerCommission,
        sebon_fee:          calc.sebonFee,
        dp_charge:          calc.dpCharge,
        capital_gain_tax:   calc.cgt,
        profit_loss:        calc.totalProfit,
        total_amount:       calc.netReceivable,
        transaction_date:   new Date().toISOString()
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
            <td style="font-weight:700;color:var(--primary);">${row.symbol}</td>
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
            .sort((a,b) => b[1] - a[1])
            .map(([name, val]) => {
                const pct = totalCurrentValue > 0 ? (val / totalCurrentValue) * 100 : 0;
                return `
                    <div class="concentration-item">
                        <div class="concentration-info">
                            <span>${name}</span>
                            <span>${pct.toFixed(1)}%</span>
                        </div>
                        <div class="concentration-bar-bg">
                            <div class="concentration-bar-fill" style="width: ${pct}%; background: ${pct > 40 ? '#f43f5e' : '#10b981'};"></div>
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
}

function calculateRealizedData(transactions) {
    const sells = transactions.filter(t => t.type?.toUpperCase() === 'SELL').sort((a,b) => new Date(a.transaction_date) - new Date(b.transaction_date));
    const buys  = transactions.filter(t => t.type?.toUpperCase() === 'BUY').sort((a,b) => new Date(a.transaction_date) - new Date(b.transaction_date));

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
