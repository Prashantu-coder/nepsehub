import globalState from "../../state.js";
import { Layout } from "../../layout.js";
import StorageService from "../../../services/storageService.js";

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
          symbol: document.getElementById('stockName').value || 'Unknown',
          entry: parseFloat(document.getElementById('entryPrice').value),
          sl: parseFloat(document.getElementById('stopLoss').value),
          target: parseFloat(document.getElementById('targetPrice').value)
        };
        
        const result = await StorageService.saveTradePlan(plan);
        if (result && result.success) {
            alert(`Trade plan for ${plan.symbol} saved to database!`);
        } else {
            alert('Error saving trade plan.');
        }
      });
  }
}

document.addEventListener("DOMContentLoaded", init);
