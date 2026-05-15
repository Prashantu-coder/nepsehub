import globalState from "../../state.js";
import { Layout } from "../../layout.js";

const DivLogic = {
  calculate() {
    const currentInput = document.getElementById("currentPrice");
    const dividendInput = document.getElementById("annualDividend");
    const buyInput = document.getElementById("buyPrice");

    if (!currentInput || !dividendInput || !buyInput) return;

    const current = parseFloat(currentInput.value) || 0;
    const dividend = parseFloat(dividendInput.value) || 0;
    const buy = parseFloat(buyInput.value) || 0;

    if (current <= 0) {
      this.renderEmpty();
      return;
    }

    const yieldPercent = (dividend / current) * 100;
    const capGain = buy > 0 ? ((current - buy) / buy) * 100 : 0;
    const totalReturn = yieldPercent + capGain;

    const isHighYield = yieldPercent >= 5;

    const resultsArea = document.getElementById("divResults");
    if (resultsArea) {
        resultsArea.innerHTML = `
          <div style="text-align: center; margin-bottom: 2rem;">
              <div style="font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 0.5rem;">Dividend Yield</div>
              <div style="font-size: 3rem; font-weight: 800; color: ${isHighYield ? "var(--secondary)" : "var(--text-primary)"};">
                  ${yieldPercent.toFixed(2)}%
              </div>
              ${isHighYield ? '<div style="color: var(--secondary); font-size: 0.8rem; font-weight: 600;"><i class="fas fa-fire"></i> High Yield Stock</div>' : ""}
          </div>

          <div style="display: flex; justify-content: space-between; margin-bottom: 0.8rem;">
            <span style="color: var(--text-secondary);">Capital Gain:</span>
            <span style="font-weight: 600; color: ${capGain >= 0 ? "var(--secondary)" : "var(--danger)"};">${capGain.toFixed(2)}%</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-weight: 700; font-size: 1.1rem; margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--surface-border);">
            <span>Total Return:</span>
            <span style="color: ${totalReturn >= 0 ? "var(--secondary)" : "var(--danger)"};">${totalReturn.toFixed(2)}%</span>
          </div>
        `;
    }

    this.renderSplit(yieldPercent, capGain);
  },

  renderSplit(yieldP, capGainP) {
    const summary = document.getElementById("returnSummary");
    if (!summary) return;

    if (yieldP <= 0 && capGainP <= 0) {
      summary.innerHTML = "";
      return;
    }

    // Normalize for bar (handle negative capital gains by treating them as 0 for the split ratio)
    const g = Math.max(0, capGainP);
    const total = yieldP + g;
    const yieldWeight = total > 0 ? (yieldP / total) * 100 : 0;
    const growthWeight = total > 0 ? (g / total) * 100 : 0;

    summary.innerHTML = `
      <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.5rem; display: flex; justify-content: space-between;">
          <span>Income vs Growth Split</span>
          <span>Ratio: ${yieldWeight.toFixed(0)}:${growthWeight.toFixed(0)}</span>
      </div>
      <div class="split-bar">
          <div class="income-segment" style="width: ${yieldWeight}%" title="Income (Yield)"></div>
          <div class="growth-segment" style="width: ${growthWeight}%" title="Growth (Cap Gain)"></div>
      </div>
      <div style="display: flex; gap: 1rem; font-size: 0.75rem;">
          <div style="display: flex; align-items: center; gap: 0.4rem;">
              <div style="width: 10px; height: 10px; background: var(--secondary); border-radius: 2px;"></div>
              <span>Income (Dividends)</span>
          </div>
          <div style="display: flex; align-items: center; gap: 0.4rem;">
              <div style="width: 10px; height: 10px; background: var(--primary); border-radius: 2px;"></div>
              <span>Growth (Price Apprec.)</span>
          </div>
      </div>
    `;
  },

  renderEmpty() {
    const resultsArea = document.getElementById("divResults");
    if (resultsArea) {
        resultsArea.innerHTML = `
          <div style="text-align: center; padding: 2rem; color: var(--text-secondary);">
              <i class="fas fa-piggy-bank" style="font-size: 2rem; margin-bottom: 1rem;"></i>
              <p>Enter stock price and dividend details to see your return analysis.</p>
          </div>
        `;
    }
    const summary = document.getElementById("returnSummary");
    if (summary) summary.innerHTML = "";
  },
};

async function init() {
  globalState.setState({ activePage: "dividend" });
  await Layout.init();

  // Populate Stock Datalist
  const stockList = document.getElementById('stockList');
  const stocks = globalState.getState().stocks || [];
  if (stockList && stocks.length > 0) {
      stockList.innerHTML = stocks.map(s => `<option value="${s.symbol}">${s.name || s.securityName}</option>`).join('');
  }

  const stockInput = document.getElementById('stockName');
  if (stockInput) {
      stockInput.addEventListener('change', () => {
          const symbol = stockInput.value.toUpperCase();
          const stock = stocks.find(s => s.symbol.toUpperCase() === symbol);
          if (stock) {
              const currentInput = document.getElementById('currentPrice');
              if (currentInput) {
                  currentInput.value = stock.price || stock.lastTradedPrice || "";
                  DivLogic.calculate();
              }
          }
      });
  }

  const inputs = ["currentPrice", "annualDividend", "buyPrice"];
  inputs.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("input", () => DivLogic.calculate());
  });

  DivLogic.calculate();
}

document.addEventListener("DOMContentLoaded", init);
