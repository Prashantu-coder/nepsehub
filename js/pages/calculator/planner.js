import globalState from "../../state.js";
import { Layout } from "../../layout.js";
import StorageService from "../../../services/storageService.js";
import NotificationService from "../../../services/notificationService.js";
import DataService from "../../../services/dataService.js";

const PlannerLogic = {
  calculate() {
    const entryInput = document.getElementById("entryPrice");
    const slInput = document.getElementById("stopLoss");
    const targetInput = document.getElementById("targetPrice");
    const capitalInput = document.getElementById("capital");
    const riskModeInput = document.getElementById("riskMode");
    const riskValInput = document.getElementById("riskValue");

    if (!entryInput || !slInput || !targetInput || !capitalInput || !riskModeInput || !riskValInput) return;

    const entry = parseFloat(entryInput.value) || 0;
    const sl = parseFloat(slInput.value) || 0;
    const target = parseFloat(targetInput.value) || 0;
    const capital = parseFloat(capitalInput.value) || 0;
    const riskMode = riskModeInput.value;
    const riskVal = parseFloat(riskValInput.value) || 0;

    const warning = document.getElementById("warningArea");
    if (warning) warning.innerText = "";

    // Validations
    if (entry <= sl) {
      if (warning) warning.innerText = "Stop Loss must be below Entry Price.";
      this.renderEmpty();
      return;
    }
    if (target <= entry) {
      if (warning) warning.innerText = "Target must be above Entry Price.";
      this.renderEmpty();
      return;
    }
    if (entry <= 0 || sl <= 0 || target <= 0 || capital <= 0) {
      this.renderEmpty();
      return;
    }

    const riskPerShare = entry - sl;
    const rewardPerShare = target - entry;
    const rrRatio = rewardPerShare / riskPerShare;

    let totalRiskAmount = 0;
    if (riskMode === "percent") {
      totalRiskAmount = capital * (riskVal / 100);
    } else {
      totalRiskAmount = riskVal;
    }

    const positionSize = Math.floor(totalRiskAmount / riskPerShare);
    const capitalRequired = positionSize * entry;
    const maxProfit = positionSize * rewardPerShare;

    const saveBtn = document.getElementById('savePlanBtn');
    if (saveBtn) saveBtn.disabled = false;

    const resultsArea = document.getElementById("plannerResults");
    if (resultsArea) {
        resultsArea.innerHTML = `
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 2rem;">
              <div>
                  <div style="color: var(--text-secondary); font-size: 0.8rem;">Risk Per Share</div>
                  <div style="font-weight: 700; font-size: 1.2rem;">Rs. ${riskPerShare.toFixed(2)}</div>
              </div>
              <div>
                  <div style="color: var(--text-secondary); font-size: 0.8rem;">Reward Per Share</div>
                  <div style="font-weight: 700; font-size: 1.2rem;">Rs. ${rewardPerShare.toFixed(2)}</div>
              </div>
          </div>

          <div style="text-align: center; margin-bottom: 2rem;">
              <div style="font-size: 0.9rem; color: var(--text-secondary);">Risk-Reward Ratio</div>
              <div style="font-size: 2.5rem; font-weight: 800;">1 : ${rrRatio.toFixed(2)}</div>
          </div>

          <div style="background: rgba(255,255,255,0.05); padding: 1.5rem; border-radius: 12px; margin-bottom: 1.5rem;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                  <span style="color: var(--text-secondary);">Position Size:</span>
                  <span style="font-weight: 700; color: var(--primary);">${positionSize} Shares</span>
              </div>
              <div style="display: flex; justify-content: space-between;">
                  <span style="color: var(--text-secondary);">Capital Required:</span>
                  <span style="font-weight: 700;">Rs. ${capitalRequired.toLocaleString()}</span>
              </div>
          </div>

          <div style="display: flex; justify-content: space-between; font-size: 0.9rem;">
              <div style="color: var(--danger);"><i class="fas fa-arrow-down"></i> Max Loss: Rs. ${totalRiskAmount.toLocaleString()}</div>
              <div style="color: var(--secondary);"><i class="fas fa-arrow-up"></i> Max Profit: Rs. ${maxProfit.toLocaleString()}</div>
          </div>
        `;
    }

    this.renderDecision(rrRatio);
  },

  renderDecision(rr) {
    const badge = document.getElementById("decisionBadge");
    if (!badge) return;
    
    if (rr < 1.5) {
      badge.style.background = "rgba(239, 68, 68, 0.1)";
      badge.style.color = "var(--danger)";
      badge.style.border = "2px solid var(--danger)";
      badge.innerHTML = '<i class="fas fa-times-circle"></i> Avoid Trade';
    } else if (rr <= 2) {
      badge.style.background = "rgba(245, 158, 11, 0.1)";
      badge.style.color = "var(--warning)";
      badge.style.border = "2px solid var(--warning)";
      badge.innerHTML = '<i class="fas fa-info-circle"></i> Neutral Setup';
    } else {
      badge.style.background = "rgba(16, 185, 129, 0.1)";
      badge.style.color = "var(--secondary)";
      badge.style.border = "2px solid var(--secondary)";
      badge.innerHTML = '<i class="fas fa-check-circle"></i> Good Setup';
    }
  },

  renderEmpty() {
    const resultsArea = document.getElementById("plannerResults");
    if (resultsArea) {
        resultsArea.innerHTML = `
              <div style="text-align: center; padding: 2rem; color: var(--text-secondary);">
                  <i class="fas fa-search" style="font-size: 2rem; margin-bottom: 1rem;"></i>
                  <p>Enter trade parameters to evaluate your setup.</p>
              </div>
          `;
    }
    const badge = document.getElementById("decisionBadge");
    if (badge) {
        badge.style.background = "rgba(255,255,255,0.05)";
        badge.style.color = "var(--text-secondary)";
        badge.style.border = "none";
        badge.innerText = "NO ANALYSIS";
    }
  },
};

async function init() {
  globalState.setState({ activePage: "planner" });
  await Layout.init();

  // Check for Symbol in URL
  const urlParams = new URLSearchParams(window.location.search);
  const querySymbol = urlParams.get('symbol');
  
  if (querySymbol) {
      const stockInput = document.getElementById('stockName');
      if (stockInput) {
          stockInput.value = querySymbol.toUpperCase();
          // Trigger change manually to load price
          stockInput.dispatchEvent(new Event('change'));
      }
  }

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
              const entryInput = document.getElementById('entryPrice');
              if (entryInput) {
                  entryInput.value = stock.price || stock.lastTradedPrice || "";
                  PlannerLogic.calculate();
              }
          }
      });
  }

  const inputs = [
    "entryPrice",
    "stopLoss",
    "targetPrice",
    "capital",
    "riskValue",
    "riskMode",
  ];

  inputs.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
        el.addEventListener("input", () => {
          if (id === "riskMode") {
            const label = document.getElementById("riskLabel");
            if (label) {
                label.innerText = document.getElementById("riskMode").value === "percent"
                    ? "Risk Amount (%)"
                    : "Risk Amount (NPR)";
            }
          }
          PlannerLogic.calculate();
        });
    }
  });

  PlannerLogic.calculate();

  // Save Plan logic
  const savePlanBtn = document.getElementById('savePlanBtn');
  if (savePlanBtn) {
      savePlanBtn.addEventListener('click', async () => {
        const plan = {
          symbol: (document.getElementById('stockName').value || 'Unknown').toUpperCase(),
          entry: parseFloat(document.getElementById('entryPrice').value) || 0,
          sl: parseFloat(document.getElementById('stopLoss').value) || 0,
          target: parseFloat(document.getElementById('targetPrice').value) || 0
        };

        if (!plan.symbol || plan.symbol === 'UNKNOWN') {
            NotificationService.showToast("Invalid Stock", "Please select or enter a valid stock symbol.", "stoploss");
            return;
        }
        if (plan.entry <= 0 || plan.sl <= 0 || plan.target <= 0) {
            NotificationService.showToast("Invalid Values", "Please fill entry, stop loss, and target values.", "stoploss");
            return;
        }
        if (plan.entry <= plan.sl) {
            NotificationService.showToast("Invalid Setup", "Stop Loss must be below Entry Price.", "stoploss");
            return;
        }
        if (plan.target <= plan.entry) {
            NotificationService.showToast("Invalid Setup", "Target must be above Entry Price.", "stoploss");
            return;
        }
        
        const result = await StorageService.saveTradePlan(plan);
        if (result && result.success) {
            NotificationService.showToast("Plan Saved", `Trade plan for ${plan.symbol} saved to database!`, "buy");
            loadSavedPlans();
        } else {
            NotificationService.showToast("Save Failed", "Error saving trade plan.", "stoploss");
        }
      });
  }

  // Auto-Setup from Technical Indicators
  const generateSetupBtn = document.getElementById('generateSetupBtn');
  if (generateSetupBtn) {
      generateSetupBtn.addEventListener('click', async () => {
          const symbolInput = document.getElementById('stockName');
          if (!symbolInput || !symbolInput.value.trim()) {
              NotificationService.showToast("Stock Symbol Required", "Please select or type a stock symbol first.", "stoploss");
              return;
          }

          const symbol = symbolInput.value.trim().toUpperCase();
          const originalHtml = generateSetupBtn.innerHTML;
          generateSetupBtn.disabled = true;
          generateSetupBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Analyzing...`;

          try {
              const stockData = await DataService.getTechnicalIndicators(symbol);
              if (!stockData || !stockData.indicators) {
                  // Fallback if indicators are not found in the screener
                  NotificationService.showToast("No Signals Found", `Indicators for ${symbol} not in screener database. Using fallback parameters.`, "info");
                  
                  // Try to find current market price from globalState
                  const stocks = globalState.getState().stocks || [];
                  const stockObj = stocks.find(s => s.symbol.toUpperCase() === symbol);
                  const entryPrice = stockObj ? (stockObj.price || stockObj.lastTradedPrice || 0) : 0;
                  
                  if (entryPrice <= 0) {
                      NotificationService.showToast("Price Required", `Could not retrieve current market price for ${symbol}. Please enter manually.`, "stoploss");
                      return;
                  }

                  const entryInput = document.getElementById('entryPrice');
                  const slInput = document.getElementById('stopLoss');
                  const targetInput = document.getElementById('targetPrice');

                  if (entryInput) entryInput.value = entryPrice;
                  if (slInput) slInput.value = (entryPrice * 0.95).toFixed(2); // default 5% stop loss
                  if (targetInput) targetInput.value = (entryPrice * 1.10).toFixed(2); // default 10% target, 1:2 R:R

                  PlannerLogic.calculate();
                  return;
              }

              const ind = stockData.indicators;
              const entry = parseFloat(ind.latest_close || ind.close || 0);
              const rsi = parseFloat(ind.rsi_14 || 50);
              const atr = parseFloat(ind.atr_14 || (entry * 0.03)); // Fallback to 3% of close if ATR is missing
              
              // Detect crossovers
              const mac = ind.moving_average_crossovers || {};
              const hasGoldenCross = mac.golden_cross_death_cross?.signal === 'golden_cross';
              const hasDeathCross = mac.golden_cross_death_cross?.signal === 'death_cross';
              
              // Evaluate crossover trend
              const statuses = [
                  mac.golden_cross_death_cross?.status,
                  mac.short_term_cross?.status,
                  mac.swing_trading_cross?.status,
                  mac.medium_term_cross?.status
              ].filter(Boolean);
              const bullishMA = statuses.filter(s => s === 'bullish').length;
              const bearishMA = statuses.filter(s => s === 'bearish').length;
              const isTrendBullish = bullishMA > bearishMA;

              const entryInput = document.getElementById('entryPrice');
              const slInput = document.getElementById('stopLoss');
              const targetInput = document.getElementById('targetPrice');

              if (entryInput) entryInput.value = entry;

              // Rule A: Golden cross + RSI 40-60 + ATR Setup -> Long Setup
              if ((hasGoldenCross || isTrendBullish) && rsi >= 40 && rsi <= 60) {
                  const sl = entry - 1.5 * atr;
                  const target = entry + 3.0 * atr; // Perfect 1:2 R:R

                  if (slInput) slInput.value = sl.toFixed(2);
                  if (targetInput) targetInput.value = target.toFixed(2);

                  PlannerLogic.calculate();
                  NotificationService.showToast("Setup Generated", `🎯 Golden Cross & RSI Bullish setup calculated for ${symbol}!`, "buy");
              }
              // Rule B: Death cross + RSI > 60 -> Avoid Setup / Bearish Setup
              else if (hasDeathCross || (rsi > 60 && bearishMA > bullishMA)) {
                  const sl = entry - 1.5 * atr;
                  const target = entry + 3.0 * atr;

                  if (slInput) slInput.value = sl.toFixed(2);
                  if (targetInput) targetInput.value = target.toFixed(2);

                  PlannerLogic.calculate();
                  NotificationService.showToast("Avoid Setup ⚠️", `Death Cross & Overbought RSI (${rsi.toFixed(1)}) detected. Caution advised!`, "stoploss");
              }
              // Rule C: General Crossover Setup (Fallback indicator setup)
              else {
                  const sl = entry - 1.5 * atr;
                  // target is computed dynamically based on trend
                  const multiplier = isTrendBullish ? 3.0 : 2.5; 
                  const target = entry + multiplier * atr;

                  if (slInput) slInput.value = sl.toFixed(2);
                  if (targetInput) targetInput.value = target.toFixed(2);

                  PlannerLogic.calculate();
                  NotificationService.showToast("Setup Generated", `Neutral indicators for ${symbol}. ATR setup applied.`, "info");
              }

          } catch (err) {
              console.error('Error during auto-setup:', err);
              NotificationService.showToast("Execution Error", "An error occurred while generating the setup.", "stoploss");
          } finally {
              generateSetupBtn.disabled = false;
              generateSetupBtn.innerHTML = originalHtml;
          }
      });
  }

  // Load plans initial load
  await loadSavedPlans();
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
}

async function loadSavedPlans() {
  const container = document.getElementById("savedPlansContainer");
  const countEl = document.getElementById("savedPlansCount");
  if (!container) return;

  try {
    const plans = await StorageService.getTradePlans();
    
    if (countEl) {
      countEl.innerText = plans.length === 1 ? "1 plan saved" : `${plans.length} plans saved`;
    }

    if (!plans || plans.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 3rem 1rem; color: var(--text-secondary);">
          <i class="fas fa-clipboard" style="font-size: 2.5rem; margin-bottom: 1rem; color: rgba(255,255,255,0.15);"></i>
          <h4 style="color: var(--text-primary); margin-bottom: 0.25rem;">No Saved Plans Yet</h4>
          <p style="font-size: 0.85rem;">Create and evaluate trade setups above, then save them here.</p>
        </div>
      `;
      return;
    }

    let rowsHtml = plans.map(plan => {
      const entry = parseFloat(plan.entry) || 0;
      const sl = parseFloat(plan.sl) || 0;
      const target = parseFloat(plan.target) || 0;
      
      const riskPerShare = entry - sl;
      const rewardPerShare = target - entry;
      const rrRatio = riskPerShare > 0 ? (rewardPerShare / riskPerShare) : 0;
      
      let badgeStyle = '';
      let badgeLabel = '';
      
      if (rrRatio < 1.5) {
        badgeStyle = 'background: rgba(239, 68, 68, 0.1); color: var(--danger); border: 1px solid rgba(239, 68, 68, 0.2);';
        badgeLabel = 'Avoid';
      } else if (rrRatio <= 2) {
        badgeStyle = 'background: rgba(245, 158, 11, 0.1); color: var(--warning); border: 1px solid rgba(245, 158, 11, 0.2);';
        badgeLabel = 'Neutral';
      } else {
        badgeStyle = 'background: rgba(16, 185, 129, 0.1); color: var(--primary); border: 1px solid rgba(16, 185, 129, 0.2);';
        badgeLabel = 'Good';
      }

      const formattedDate = plan.created_at 
        ? new Date(plan.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : 'N/A';

      return `
        <tr style="transition: var(--transition-fast);">
          <td style="text-align: left; font-weight: 700; color: var(--text-primary);">${escapeHtml(plan.symbol)}</td>
          <td>Rs. ${entry.toFixed(2)}</td>
          <td>Rs. ${sl.toFixed(2)}</td>
          <td>Rs. ${target.toFixed(2)}</td>
          <td>
            <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 2px;">
              <span style="font-weight: 600;">1 : ${rrRatio.toFixed(2)}</span>
              <span class="badge" style="padding: 1px 6px; font-size: 0.65rem; border-radius: 4px; ${badgeStyle}">${badgeLabel}</span>
            </div>
          </td>
          <td style="color: var(--text-secondary); font-size: 0.8rem;">${formattedDate}</td>
          <td>
            <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
              <button class="action-btn load-plan-btn" 
                      data-symbol="${escapeHtml(plan.symbol)}" 
                      data-entry="${entry}" 
                      data-sl="${sl}" 
                      data-target="${target}"
                      style="background: rgba(99, 102, 241, 0.15); color: var(--secondary); border: 1px solid rgba(99, 102, 241, 0.3); padding: 4px 10px; border-radius: 6px; font-size: 0.78rem;">
                <i class="fas fa-folder-open"></i> Load
              </button>
              <button class="action-btn delete-plan-btn" 
                      data-id="${plan.id}" 
                      data-symbol="${escapeHtml(plan.symbol)}" 
                      style="background: rgba(244, 63, 94, 0.08); color: var(--danger); border: 1px solid rgba(244, 63, 94, 0.2); padding: 4px 10px; border-radius: 6px; font-size: 0.78rem;">
                <i class="fas fa-trash-alt"></i> Delete
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join("");

    container.innerHTML = `
      <div class="data-table-container" style="overflow-x: auto; width: 100%;">
        <table class="data-table" style="width: 100%; border-collapse: collapse; text-align: right;">
          <thead>
            <tr>
              <th style="text-align: left; border-bottom: 1px solid var(--surface-border); padding: 0.85rem 1.25rem;">Symbol</th>
              <th style="border-bottom: 1px solid var(--surface-border); padding: 0.85rem 1.25rem;">Entry Price</th>
              <th style="border-bottom: 1px solid var(--surface-border); padding: 0.85rem 1.25rem;">Stop Loss</th>
              <th style="border-bottom: 1px solid var(--surface-border); padding: 0.85rem 1.25rem;">Target</th>
              <th style="border-bottom: 1px solid var(--surface-border); padding: 0.85rem 1.25rem;">Risk / Reward</th>
              <th style="border-bottom: 1px solid var(--surface-border); padding: 0.85rem 1.25rem;">Date Saved</th>
              <th style="text-align: right; border-bottom: 1px solid var(--surface-border); padding: 0.85rem 1.25rem;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    `;

    // Add load button event listeners
    container.querySelectorAll('.load-plan-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const symbol = btn.getAttribute('data-symbol');
        const entry = btn.getAttribute('data-entry');
        const sl = btn.getAttribute('data-sl');
        const target = btn.getAttribute('data-target');

        const symbolInput = document.getElementById('stockName');
        const entryInput = document.getElementById('entryPrice');
        const slInput = document.getElementById('stopLoss');
        const targetInput = document.getElementById('targetPrice');

        if (symbolInput) symbolInput.value = symbol;
        if (entryInput) entryInput.value = entry;
        if (slInput) slInput.value = sl;
        if (targetInput) targetInput.value = target;

        PlannerLogic.calculate();
        
        NotificationService.showToast("Setup Loaded", `Parameters for ${symbol} loaded successfully.`, "info");
      });
    });

    // Add delete button event listeners
    container.querySelectorAll('.delete-plan-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = btn.getAttribute('data-id');
        const symbol = btn.getAttribute('data-symbol');

        if (confirm(`Are you sure you want to delete the saved plan for ${symbol}?`)) {
          const success = await StorageService.deleteTradePlan(id);
          if (success) {
            NotificationService.showToast("Plan Deleted", `Trade plan for ${symbol} has been deleted.`, "stoploss");
            loadSavedPlans();
          } else {
            NotificationService.showToast("Delete Failed", `Could not delete trade plan for ${symbol}.`, "stoploss");
          }
        }
      });
    });

  } catch (err) {
    console.error("Error loading trade plans:", err);
    container.innerHTML = `
      <div style="text-align: center; padding: 2rem; color: var(--danger);">
        <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 1rem;"></i>
        <p>Failed to load saved plans. Please try again later.</p>
      </div>
    `;
  }
}

document.addEventListener("DOMContentLoaded", init);
