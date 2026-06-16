import globalState from "../../state.js";
import { Layout } from "../../layout.js";

let lastCalculatedWacc = 500;

const CalcLogic = {
  getCommission(amount) {
    if (amount <= 50000) return Math.max(10, amount * 0.0036);
    if (amount <= 500000) return amount * 0.0033;
    if (amount <= 2000000) return amount * 0.0031;
    if (amount <= 10000000) return amount * 0.0027;
    return amount * 0.0024;
  },
  calculateBuy() {
    const buyQtyInput = document.getElementById("buyQty");
    const buyPriceInput = document.getElementById("buyPrice");
    if (!buyQtyInput || !buyPriceInput) return;

    const qtyInput = buyQtyInput.value;
    const priceInput = buyPriceInput.value;
    const isEmpty = qtyInput === "" || priceInput === "";

    const qty = parseFloat(qtyInput) || 0;
    const price = parseFloat(priceInput) || 0;
    const shareAmount = qty * price;

    const commission = isEmpty ? 0 : this.getCommission(shareAmount);
    const sebonFee = isEmpty ? 0 : shareAmount * 0.00015;
    const dpFee = isEmpty ? 0 : 25;
    const total = shareAmount + commission + sebonFee + dpFee;

    const wacc = qty > 0 ? total / qty : 0;
    lastCalculatedWacc = wacc;

    const resultsArea = document.getElementById("buyResults");
    if (resultsArea) {
        resultsArea.innerHTML = this.formatResults(
          [
            { label: "Share Amount", value: shareAmount },
            { label: "Broker Commission", value: commission },
            { label: "SEBON Fee", value: sebonFee },
            { label: "DP Fee", value: dpFee },
          ],
          "Total Cost",
          total,
          "negative",
          wacc,
        );
    }

    // If in auto mode, sync units and update sell calc
    const waccMode = document.getElementById("waccMode");
    if (waccMode && waccMode.value === "auto") {
      this.syncSellQty();
      this.calculateSell();
    }
  },
  syncSellQty() {
    const modeEl = document.getElementById("waccMode");
    if (modeEl && modeEl.value === "auto") {
      const buyQtyEl = document.getElementById("buyQty");
      const sellQtyEl = document.getElementById("sellQty");
      if (buyQtyEl && sellQtyEl) {
          sellQtyEl.value = buyQtyEl.value;
      }
    }
  },
  calculateSell() {
    const sellQtyInput = document.getElementById("sellQty");
    const sellPriceInput = document.getElementById("sellPrice");
    const waccModeInput = document.getElementById("waccMode");
    if (!sellQtyInput || !sellPriceInput || !waccModeInput) return;

    const qtyInput = sellQtyInput.value;
    const priceInput = sellPriceInput.value;
    const isEmpty = qtyInput === "" || priceInput === "";

    const qty = parseFloat(qtyInput) || 0;
    const price = parseFloat(priceInput) || 0;
    const mode = waccModeInput.value;

    let wacc = 0;
    if (mode === "auto") {
      wacc = lastCalculatedWacc;
    } else {
      const manualInput = document.getElementById("manualWacc");
      if (manualInput) {
          wacc = parseFloat(parseFloat(manualInput.value).toFixed(4)) || 0;
      }
    }

    const shareAmount = qty * price;
    const commission = isEmpty ? 0 : this.getCommission(shareAmount);
    const sebonFee = isEmpty ? 0 : shareAmount * 0.00015;
    const dpFee = isEmpty ? 0 : 25;

    const costBasis = qty * wacc;
    const grossProfit = shareAmount - commission - sebonFee - dpFee;
    const taxableProfit =
      shareAmount - commission - sebonFee - dpFee - costBasis;

    const capitalGainTax = taxableProfit > 0 ? taxableProfit * 0.05 : 0;
    const receivableAmount =
      shareAmount - commission - sebonFee - dpFee - capitalGainTax;
    const netProfit = receivableAmount - costBasis;

    const resultsArea = document.getElementById("sellResults");
    if (resultsArea) {
        resultsArea.innerHTML = `
                  <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 1rem; padding-bottom: 0.5rem; border-bottom: 1px dashed var(--surface-border);">
                      Using WACC: <span style="color: var(--text-primary); font-weight: 600;">Rs. ${wacc.toFixed(4)}</span>
                  </div>
                  ${this.formatResults(
                    [
                      { label: "Share Amount", value: shareAmount },
                      { label: "Broker Commission", value: commission },
                      { label: "SEBON Fee", value: sebonFee },
                      { label: "DP Fee", value: dpFee },
                      {
                        label: "Capital Gain Tax (5%)",
                        value: capitalGainTax,
                      },
                    ],
                    "Receivable Amount",
                    receivableAmount,
                    "positive",
                    receivableAmount / qty,
                  )}
                  <div style="margin-top: 1rem; padding: 1rem; border-radius: 10px; background: ${netProfit >= 0 ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)"}; text-align: center;">
                      <div style="font-size: 0.8rem; color: var(--text-secondary);">Net Profit / Loss</div>
                      <div style="font-size: 1.25rem; font-weight: 700; color: ${netProfit >= 0 ? "var(--secondary)" : "var(--danger)"};">
                          Rs. ${netProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </div>
                  </div>
              `;
    }
  },
  formatResults(items, totalLabel, totalValue, totalClass, perShare) {
    return `
              ${items
                .map(
                  (item) => `
                  <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.9rem;">
                      <span style="color: var(--text-secondary);">${item.label}:</span>
                      <span style="font-weight: 500;">Rs. ${item.value.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
              `,
                )
                .join("")}
              <hr style="border: none; border-top: 1px solid var(--surface-border); margin: 0.75rem 0;">
              <div style="display: flex; justify-content: space-between; font-weight: 700; font-size: 1.05rem;">
                  <span>${totalLabel}:</span>
                  <span class="${totalClass}">Rs. ${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.5rem; text-align: right;">
                  Per Unit: Rs. ${perShare.toFixed(2)}
              </div>
          `;
  },
};

async function init() {
  globalState.setState({ activePage: "calculator" });
  await Layout.init();

  const params = new URLSearchParams(window.location.search);
  const symbol = params.get("symbol");
  const price = params.get("price");
  const qty = params.get("qty");

  if (symbol) {
    const headers = document.querySelectorAll(".tools-grid h3");
    headers.forEach(h => {
      if (h.textContent.includes("Buy Calculator")) {
        h.innerHTML = `Buy Calculator <span style="font-size: 0.9rem; color: var(--text-secondary); font-weight: 500; margin-left: 0.5rem;">(${symbol.toUpperCase()})</span>`;
      } else if (h.textContent.includes("Sell Calculator")) {
        h.innerHTML = `Sell Calculator <span style="font-size: 0.9rem; color: var(--text-secondary); font-weight: 500; margin-left: 0.5rem;">(${symbol.toUpperCase()})</span>`;
      }
    });
  }

  if (qty) {
    const buyQty = document.getElementById("buyQty");
    const sellQty = document.getElementById("sellQty");
    if (buyQty) buyQty.value = qty;
    if (sellQty) sellQty.value = qty;
  }

  if (price) {
    const buyPrice = document.getElementById("buyPrice");
    const sellPrice = document.getElementById("sellPrice");
    if (buyPrice) buyPrice.value = price;
    if (sellPrice) sellPrice.value = price;
  }

  const inputs = [
    "buyQty",
    "buyPrice",
    "sellQty",
    "sellPrice",
    "manualWacc",
  ];
  inputs.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
        el.addEventListener("input", () => {
          if (id.startsWith("buy")) {
            CalcLogic.calculateBuy();
          } else {
            CalcLogic.calculateSell();
          }
        });
    }
  });

  const waccMode = document.getElementById("waccMode");
  if (waccMode) {
      waccMode.addEventListener("change", (e) => {
        const manualContainer = document.getElementById("manualWaccContainer");
        const isManual = e.target.value === "manual";
        if (manualContainer) manualContainer.style.display = isManual ? "block" : "none";
        
        if (!isManual) {
          CalcLogic.syncSellQty();
        }
        
        CalcLogic.calculateSell();
      });
  }

  const manualWaccInput = document.getElementById("manualWacc");
  if (manualWaccInput) {
      manualWaccInput.addEventListener("blur", (e) => {
        // Enforce 4 decimal places on focus out
        if (e.target.value) {
          e.target.value = parseFloat(e.target.value).toFixed(4);
        }
      });
  }

  // Initial calc
  CalcLogic.calculateBuy();
  CalcLogic.calculateSell();
}

document.addEventListener("DOMContentLoaded", init);
