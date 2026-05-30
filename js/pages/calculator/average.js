import globalState from "../../state.js";
import { Layout } from "../../layout.js";

const DCALogic = {
  getCommission(amount) {
    if (amount <= 50000) return Math.max(10, amount * 0.0036);
    if (amount <= 500000) return amount * 0.0033;
    if (amount <= 2000000) return amount * 0.0031;
    if (amount <= 10000000) return amount * 0.0027;
    return amount * 0.0024;
  },

  calculate() {
    const rows = document.querySelectorAll(".entry-row");
    let totalInvestment = 0;
    let totalShares = 0;
    let totalCommission = 0;
    let totalSebon = 0;
    let totalDp = 0;

    rows.forEach((row) => {
      const priceInput = row.querySelector(".buy-price");
      const qtyInput = row.querySelector(".buy-qty");
      if (!priceInput || !qtyInput) return;

      const price = parseFloat(priceInput.value) || 0;
      const qty = parseFloat(qtyInput.value) || 0;

      if (price > 0 && qty > 0) {
        const amount = price * qty;
        const comm = this.getCommission(amount);
        const sebon = amount * 0.00015;
        const dp = 25;

        totalInvestment += amount + comm + sebon + dp;
        totalShares += qty;
        totalCommission += comm;
        totalSebon += sebon;
        totalDp += dp;
      }
    });

    const averagePrice = totalShares > 0 ? totalInvestment / totalShares : 0;

    const resultsArea = document.getElementById("dcaResults");
    if (resultsArea) {
      resultsArea.innerHTML = `
          <div style="display: flex; justify-content: space-between; margin-bottom: 0.8rem;">
            <span style="color: var(--text-secondary);">Total Units:</span>
            <span style="font-weight: 600;">${totalShares.toLocaleString()} Shares</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 0.8rem;">
            <span style="color: var(--text-secondary);">Total Investment (inc. fees):</span>
            <span style="font-weight: 600;">Rs. ${totalInvestment.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
          <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 1rem;">
              (Comm: Rs. ${totalCommission.toFixed(2)} | Fees: Rs. ${(totalSebon + totalDp).toFixed(2)})
          </div>
          <hr style="border: none; border-top: 1px solid var(--surface-border); margin: 1rem 0;">
          <div style="text-align: center;">
              <div style="font-size: 0.9rem; color: var(--text-secondary);">Break-even Average Price (WACC)</div>
              <div style="font-size: 2.2rem; font-weight: 800; color: var(--secondary);">Rs. ${averagePrice.toFixed(4)}</div>
          </div>
        `;
    }

    this.calculateAnalysis(averagePrice, totalShares);
  },

  calculateAnalysis(avgPrice, shares) {
    const ltpInput = document.getElementById("currentLtp");
    if (!ltpInput) return;

    const ltp = parseFloat(ltpInput.value) || 0;
    const container = document.getElementById("profitAnalysis");
    if (!container) return;

    if (ltp <= 0 || avgPrice <= 0) {
      container.innerHTML = "";
      return;
    }

    const diff = ltp - avgPrice;
    const percent = (diff / avgPrice) * 100;
    const totalPL = diff * shares;

    container.innerHTML = `
      <div class="glass" style="padding: 1rem; border-radius: 12px; background: ${diff >= 0 ? "rgba(16, 185, 129, 0.05)" : "rgba(239, 68, 68, 0.05)"}; border: 1px solid ${diff >= 0 ? "var(--secondary)" : "var(--danger)"}">
          <div style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                  <div style="font-size: 0.75rem; color: var(--text-secondary);">Est. Profit/Loss</div>
                  <div style="font-size: 1.1rem; font-weight: 700; color: ${diff >= 0 ? "var(--secondary)" : "var(--danger)"};">
                      Rs. ${totalPL.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
              </div>
              <div style="text-align: right;">
                  <div style="font-size: 1.1rem; font-weight: 700; color: ${diff >= 0 ? "var(--secondary)" : "var(--danger)"};">
                      ${diff >= 0 ? "+" : ""}${percent.toFixed(2)}%
                  </div>
                  <div style="font-size: 0.75rem; color: var(--text-secondary);">vs Average</div>
              </div>
          </div>
      </div>
    `;
  },

  addEntry() {
    const container = document.getElementById("entries-container");
    if (!container) return;

    const div = document.createElement("div");
    div.className = "entry-row";
    div.innerHTML = `
      <div class="form-group" style="margin-bottom: 0;">
          <input type="number" class="buy-price" placeholder="Price">
      </div>
      <div class="form-group" style="margin-bottom: 0;">
          <input type="number" class="buy-qty" placeholder="Qty">
      </div>
      <div class="remove-btn"><i class="fas fa-times-circle"></i></div>
    `;

    div.querySelector(".remove-btn").onclick = () => {
      div.remove();
      this.calculate();
    };

    div.querySelectorAll("input").forEach((input) => {
      input.oninput = () => this.calculate();
    });

    container.appendChild(div);
  },
};

async function init() {
  globalState.setState({ activePage: "average" });
  await Layout.init();

  const addBtn = document.getElementById("addEntryBtn");
  if (addBtn) addBtn.onclick = () => DCALogic.addEntry();

  const ltpInput = document.getElementById("currentLtp");
  if (ltpInput) ltpInput.oninput = () => DCALogic.calculate();

  // Initial listeners
  document.querySelectorAll(".entry-row input").forEach((input) => {
    input.oninput = () => DCALogic.calculate();
  });

  DCALogic.calculate();
}

document.addEventListener("DOMContentLoaded", init);
