import globalState from '../state.js';
import { Layout } from '../layout.js';
import DataService from '../../services/dataService.js';
import StorageService from '../../services/storageService.js';
import FeeService from '../../services/feeService.js';

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
    const map = {};

    // Process oldest → newest for correct FIFO-style WACC
    const sorted = [...transactions].sort((a, b) =>
        new Date(a.transaction_date) - new Date(b.transaction_date)
    );

    sorted.forEach(t => {
        if (!map[t.symbol]) {
            map[t.symbol] = { symbol: t.symbol, qty: 0, totalBuyCost: 0, totalBuyQty: 0 };
        }
        const h = map[t.symbol];

        if (t.type === 'BUY') {
            h.qty += t.quantity;
            h.totalBuyCost += t.total_amount;   // actual_cost including fees
            h.totalBuyQty  += t.quantity;
        } else if (t.type === 'SELL') {
            h.qty -= t.quantity;
        }
    });

    // Keep only symbols with remaining units
    return Object.values(map)
        .filter(h => h.qty > 0.0001)
        .map(h => ({
            symbol:       h.symbol,
            quantity:     h.qty,
            totalInvested: (h.totalBuyCost / h.totalBuyQty) * h.qty,  // cost of remaining units
            wacc:         h.totalBuyCost / h.totalBuyQty               // avg cost per share
        }));
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
            ['overview', 'analytics', 'transactions'].forEach(t => {
                document.getElementById(`tab-${t}`).style.display = t === tab ? 'block' : 'none';
            });
            if (tab === 'transactions') renderTransactions();
        };
    });

    // Add Transaction modal
    const modal = document.getElementById('portfolio-modal-overlay');
    document.getElementById('open-portfolio-modal').onclick = () => {
        modal.style.display = 'flex';
        document.getElementById('input-date').valueAsDate = new Date();
        // reset fee preview
        updateBuyPreview();
    };
    document.getElementById('close-portfolio-modal').onclick = () => modal.style.display = 'none';
    document.getElementById('cancel-modal').onclick             = () => modal.style.display = 'none';
    document.getElementById('save-holding-btn').onclick         = handleSave;

    ['input-qty', 'input-price'].forEach(id =>
        document.getElementById(id).addEventListener('input', updateBuyPreview)
    );

    // Sell modal
    const sellModal = document.getElementById('sell-modal-overlay');
    document.getElementById('close-sell-modal').onclick   = () => sellModal.style.display = 'none';
    document.getElementById('confirm-sell-btn').onclick   = handleSell;
    document.getElementById('sell-input-qty').oninput     = updateSellPreview;
    document.getElementById('sell-input-price').oninput   = updateSellPreview;

    // Layout & initial data
    globalState.setState({ activePage: 'portfolio' });
    try { await Layout.init(); } catch(e) {}

    await refresh();
    setInterval(refresh, 60000);
}

// ─────────────────────────────────────────────
// DATA REFRESH
// ─────────────────────────────────────────────
async function refresh() {
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
        const ltp     = stock ? parseFloat(stock.lastTradedPrice) : h.wacc;
        const curVal  = ltp * h.quantity;
        const pnl     = curVal - h.totalInvested;
        const pnlPct  = h.totalInvested > 0 ? (pnl / h.totalInvested) * 100 : 0;

        return `
        <tr>
            <td style="font-weight:700;">${h.symbol}</td>
            <td>${h.quantity.toFixed(2)}</td>
            <td>Rs. ${h.wacc.toFixed(2)}</td>
            <td>Rs. ${ltp.toFixed(2)}</td>
            <td>Rs. ${h.totalInvested.toLocaleString('en-IN', {maximumFractionDigits:2})}</td>
            <td>Rs. ${curVal.toLocaleString('en-IN', {maximumFractionDigits:2})}</td>
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
        const ltp      = stock ? parseFloat(stock.lastTradedPrice) : h.wacc;
        const prevClose= stock ? parseFloat(stock.previousClose || ltp) : ltp;

        totalInv    += h.totalInvested;
        totalCur    += ltp * h.quantity;
        todayChange += (ltp - prevClose) * h.quantity;
    });

    const pnl    = totalCur - totalInv;
    const pnlPct = totalInv > 0 ? (pnl / totalInv) * 100 : 0;
    const dayPct = (totalCur - todayChange) > 0 ? (todayChange / (totalCur - todayChange)) * 100 : 0;

    setText('stat-total-inv',   `Rs. ${fmt(totalInv)}`);
    setText('stat-current-val', `Rs. ${fmt(totalCur)}`);
    setText('stat-total-pnl-pct', `${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}% unrealized`);

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
        return +((stock ? parseFloat(stock.lastTradedPrice) : h.wacc) * h.quantity).toFixed(2);
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
        const sector = stock?.sectorName || 'Other';
        const val    = (stock ? parseFloat(stock.lastTradedPrice) : h.wacc) * h.quantity;
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
    const buyTotal  = allTransactions.filter(t => t.type === 'BUY').reduce((s, t) => s + t.total_amount, 0);
    const sellTotal = allTransactions.filter(t => t.type === 'SELL').reduce((s, t) => s + t.total_amount, 0);

    // Update summary badges if they exist
    const buyBadge = document.getElementById('tx-buy-total');
    const sellBadge = document.getElementById('tx-sell-total');
    if (buyBadge) buyBadge.innerText = `Buys: Rs. ${fmt(buyTotal)} (${allTransactions.filter(t=>t.type==='BUY').length})`;
    if (sellBadge) sellBadge.innerText = `Sells: Rs. ${fmt(sellTotal)} (${allTransactions.filter(t=>t.type==='SELL').length})`;

    body.innerHTML = allTransactions.map(t => {
        const fees   = t.broker_commission + t.sebon_fee + t.dp_charge;
        const isBuy  = t.type === 'BUY';
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
            <td style="font-weight:700;">${t.symbol}</td>
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
    document.getElementById('sell-input-price').value = stock ? stock.lastTradedPrice : '';

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
    const sym   = document.getElementById('input-symbol').value.toUpperCase().trim();
    const qty   = parseFloat(document.getElementById('input-qty').value);
    const prc   = parseFloat(document.getElementById('input-price').value);
    const date  = document.getElementById('input-date').value;

    if (!sym || isNaN(qty) || isNaN(prc) || qty <= 0 || prc <= 0) {
        alert('Please fill in all fields correctly.');
        return;
    }

    const calc = FeeService.calculateBuy(prc, qty);

    const res = await StorageService.addTransaction({
        symbol:             sym,
        type:               'BUY',
        quantity:           qty,
        price:              prc,
        broker_commission:  calc.brokerCommission,
        sebon_fee:          calc.sebonFee,
        dp_charge:          calc.dpCharge,
        total_amount:       calc.totalCost,
        transaction_date:   date || new Date().toISOString()
    });

    if (res.success) {
        document.getElementById('portfolio-modal-overlay').style.display = 'none';
        // Clear inputs
        ['input-symbol','input-qty','input-price'].forEach(id => document.getElementById(id).value = '');
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
// HELPERS
// ─────────────────────────────────────────────
function fmt(n) { return Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 }); }
function setText(id, val) { const el = document.getElementById(id); if (el) el.innerText = val; }

document.addEventListener('DOMContentLoaded', init);
