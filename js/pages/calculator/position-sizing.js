import globalState from "../../state.js";
import { Layout } from "../../layout.js";

const SizingLogic = {
  calculate() {
    const balanceInput = document.getElementById('balance');
    const riskPercentInput = document.getElementById('riskPercent');
    const entryPriceInput = document.getElementById('entryPrice');
    const stopLossInput = document.getElementById('stopLoss');

    if (!balanceInput || !riskPercentInput || !entryPriceInput || !stopLossInput) return;

    const balance = parseFloat(balanceInput.value) || 0;
    const riskPercent = parseFloat(riskPercentInput.value) || 0;
    const entry = parseFloat(entryPriceInput.value) || 0;
    const sl = parseFloat(stopLossInput.value) || 0;

    if (balance <= 0 || riskPercent <= 0 || entry <= 0 || sl <= 0 || sl >= entry) {
      this.renderError();
      return;
    }

    const riskAmount = balance * (riskPercent / 100);
    const riskPerShare = entry - sl;
    const units = Math.floor(riskAmount / riskPerShare);
    const totalInvestment = units * entry;
    const portfolioRisk = (totalInvestment / balance) * 100;

    const resultsArea = document.getElementById('sizingResults');
    if (resultsArea) {
        resultsArea.innerHTML = `
          <div style="display: flex; justify-content: space-between; margin-bottom: 0.8rem;">
            <span style="color: var(--text-secondary);">Amount at Risk:</span>
            <span style="font-weight: 600; color: var(--danger);">Rs. ${riskAmount.toLocaleString()}</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 0.8rem;">
            <span style="color: var(--text-secondary);">Risk Per Share:</span>
            <span style="font-weight: 600;">Rs. ${riskPerShare.toFixed(2)}</span>
          </div>
          <hr style="border: none; border-top: 1px solid var(--surface-border); margin: 1rem 0;">
          <div style="text-align: center; margin-bottom: 1rem;">
            <div style="font-size: 0.9rem; color: var(--text-secondary);">Recommended Units</div>
            <div style="font-size: 2.5rem; font-weight: 800; color: var(--primary);">${units}</div>
            <div style="font-size: 0.8rem; color: var(--text-secondary);">Shares</div>
          </div>
          <div style="display: flex; justify-content: space-between; margin-top: 1rem; font-size: 0.95rem;">
            <span style="color: var(--text-secondary);">Total Investment:</span>
            <span style="font-weight: 600;">Rs. ${totalInvestment.toLocaleString()}</span>
          </div>
        `;
    }

    const warning = document.getElementById('riskWarning');
    if (warning) {
      warning.style.display = 'block';
      if (totalInvestment > balance) {
        warning.style.background = 'rgba(239, 68, 68, 0.1)';
        warning.style.color = 'var(--danger)';
        warning.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Caution: Required investment exceeds your balance. Consider reducing risk or increasing capital.`;
      } else {
        warning.style.background = 'rgba(16, 185, 129, 0.1)';
        warning.style.color = 'var(--secondary)';
        warning.innerHTML = `<i class="fas fa-check-circle"></i> Safe: This trade takes up ${portfolioRisk.toFixed(1)}% of your total portfolio value.`;
      }
    }
  },
  renderError() {
    const resultsArea = document.getElementById('sizingResults');
    if (resultsArea) {
        resultsArea.innerHTML = `
          <div style="text-align: center; padding: 2rem; color: var(--text-secondary);">
            <i class="fas fa-info-circle" style="font-size: 2rem; margin-bottom: 1rem;"></i>
            <p>Please enter valid numbers.<br>Entry price must be greater than Stop Loss.</p>
          </div>
        `;
    }
    const warning = document.getElementById('riskWarning');
    if (warning) warning.style.display = 'none';
  }
};

async function init() {
  globalState.setState({ activePage: 'position-sizing' });
  await Layout.init();

  const inputs = ['balance', 'riskPercent', 'entryPrice', 'stopLoss'];
  inputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => SizingLogic.calculate());
  });

  SizingLogic.calculate();
}

document.addEventListener('DOMContentLoaded', init);
