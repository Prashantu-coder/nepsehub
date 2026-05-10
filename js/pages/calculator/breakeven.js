import globalState from "../../state.js";
import { Layout } from "../../layout.js";

const BELogic = {
  getCommission(amount) {
    if (amount <= 50000) return Math.max(10, amount * 0.0036);
    if (amount <= 500000) return amount * 0.0033;
    if (amount <= 2000000) return amount * 0.0031;
    if (amount <= 10000000) return amount * 0.0027;
    return amount * 0.0024;
  },
  calculate() {
    const qtyInput = document.getElementById('buyQty');
    const priceInput = document.getElementById('buyPrice');
    if (!qtyInput || !priceInput) return;

    const qty = parseFloat(qtyInput.value) || 0;
    const price = parseFloat(priceInput.value) || 0;

    if (qty <= 0 || price <= 0) {
      this.renderEmpty();
      return;
    }

    const shareAmount = qty * price;
    const buyComm = this.getCommission(shareAmount);
    const buySebon = shareAmount * 0.00015;
    const dpFee = 25;

    const totalBuyingCost = shareAmount + buyComm + buySebon + dpFee;
    const costPerShare = totalBuyingCost / qty;

    // Iterative calculation for break-even selling price
    let breakEvenPrice = costPerShare;
    let diff = 1;
    let iterations = 0;

    while (Math.abs(diff) > 0.001 && iterations < 10) {
      const currentAmount = breakEvenPrice * qty;
      const comm = this.getCommission(currentAmount);
      const sebon = currentAmount * 0.00015;
      const proceeds = currentAmount - comm - sebon - dpFee;
      
      diff = totalBuyingCost - proceeds;
      breakEvenPrice += diff / (qty * 0.996); 
      iterations++;
    }

    const percentNeeded = ((breakEvenPrice - price) / price) * 100;

    const resultsArea = document.getElementById('beResults');
    if (resultsArea) {
        resultsArea.innerHTML = `
          <div style="display: flex; justify-content: space-between; margin-bottom: 0.8rem;">
            <span style="color: var(--text-secondary);">Total Buying Cost:</span>
            <span style="font-weight: 600;">Rs. ${totalBuyingCost.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 0.8rem;">
            <span style="color: var(--text-secondary);">Cost Per Share (WACC):</span>
            <span style="font-weight: 600;">Rs. ${costPerShare.toFixed(2)}</span>
          </div>
          <hr style="border: none; border-top: 1px solid var(--surface-border); margin: 1.5rem 0;">
          <div style="text-align: center; padding: 1.5rem; border-radius: 16px; background: rgba(255,255,255,0.05);">
              <div style="font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 0.5rem;">Break-even Selling Price</div>
              <div style="font-size: 2.5rem; font-weight: 800; color: var(--secondary);">Rs. ${breakEvenPrice.toFixed(2)}</div>
              <div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.5rem;">
                  Must increase by <span style="color: var(--warning); font-weight: 700;">${percentNeeded.toFixed(2)}%</span>
              </div>
          </div>
        `;
    }

    this.calculateAnalysis(totalBuyingCost, qty);
  },

  calculateAnalysis(totalBuyingCost, qty) {
    const ltpInput = document.getElementById('compareLtp');
    if (!ltpInput) return;

    const ltp = parseFloat(ltpInput.value) || 0;
    const container = document.getElementById('ltpAnalysis');
    if (!container) return;
    
    if (ltp <= 0) {
      container.innerHTML = '';
      return;
    }

    const sellAmount = ltp * qty;
    const comm = this.getCommission(sellAmount);
    const sebon = sellAmount * 0.00015;
    const dp = 25;
    const netProceeds = sellAmount - comm - sebon - dp;

    const pnl = netProceeds - totalBuyingCost;
    const pnlPercent = (pnl / totalBuyingCost) * 100;

    container.innerHTML = `
      <div style="padding: 1.25rem; border-radius: 12px; background: ${pnl >= 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)'}; border: 1px solid ${pnl >= 0 ? 'var(--secondary)' : 'var(--danger)'}">
          <div style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                  <div style="font-size: 0.75rem; color: var(--text-secondary);">Net P&L (if sold at Rs. ${ltp})</div>
                  <div style="font-size: 1.2rem; font-weight: 700; color: ${pnl >= 0 ? 'var(--secondary)' : 'var(--danger)'};">
                      Rs. ${pnl.toLocaleString(undefined, {minimumFractionDigits: 2})}
                  </div>
              </div>
              <div style="text-align: right;">
                  <div style="font-size: 1.2rem; font-weight: 700; color: ${pnl >= 0 ? 'var(--secondary)' : 'var(--danger)'};">
                      ${pnl >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%
                  </div>
                  <div style="font-size: 0.75rem; color: var(--text-secondary);">Return on Investment</div>
              </div>
          </div>
      </div>
    `;
  },

  renderEmpty() {
    const resultsArea = document.getElementById('beResults');
    if (resultsArea) {
        resultsArea.innerHTML = `
          <div style="text-align: center; padding: 2rem; color: var(--text-secondary);">
              <i class="fas fa-info-circle" style="font-size: 2rem; margin-bottom: 1rem;"></i>
              <p>Enter buying details to calculate your break-even point.</p>
          </div>
        `;
    }
    const container = document.getElementById('ltpAnalysis');
    if (container) container.innerHTML = '';
  }
};

async function init() {
  globalState.setState({ activePage: 'breakeven' });
  await Layout.init();

  const inputs = ['buyQty', 'buyPrice', 'compareLtp'];
  inputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => BELogic.calculate());
  });

  BELogic.calculate();
}

document.addEventListener('DOMContentLoaded', init);
