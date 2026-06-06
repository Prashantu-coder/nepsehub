import globalState from "../../state.js";
import { Layout } from "../../layout.js";
import DataService from "../../../services/dataService.js";
import StorageService from "../../../services/storageService.js";
import { getStockImageUrl } from "../../stockImageProvider.js";

let marketData = [];
let computedData = [];
let filteredData = [];
let currentFilter = "all";
let currentSector = "all";
let sortConfig = { key: "toUpper", direction: "asc" }; // Default sorting by proximity to upper circuit

// Formatting helpers
const formatPrice = (val) => parseFloat(val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatPercent = (val) => {
  const num = parseFloat(val || 0);
  return `${num.toFixed(2)}%`;
};

function formatTimestamp(lastUpdatedStr) {
  if (!lastUpdatedStr) {
    const now = new Date();
    let hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    return `As of: ${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()} ${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
  }
  try {
    const date = new Date(lastUpdatedStr);
    if (isNaN(date.getTime())) {
      return `As of: ${lastUpdatedStr}`;
    }
    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    return `As of: ${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()} ${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
  } catch (e) {
    return `As of: ${lastUpdatedStr}`;
  }
}

async function fetchMarket() {
  const data = await DataService.getLiveMarket();

  if (data && data.length > 0) {
    marketData = data;
    computeCircuitLevels();
    applyFilter();

    // Update timestamp
    const timestampEl = document.getElementById("circuitTimestamp");
    if (timestampEl) {
      timestampEl.textContent = formatTimestamp(data[0].lastUpdated);
    }
  }
}

function computeCircuitLevels() {
  computedData = marketData.map(stock => {
    const prevClose = parseFloat(stock.previousClose) || parseFloat(stock.price) || 0;
    const ltp = parseFloat(stock.price) || 0;

    // Circuit limits at ±15%, rounded to nearest 0.10 tick size (Upper limit rounded down, Lower limit rounded up)
    const upperLimit = Math.floor(Math.round(prevClose * 1.15 * 100) / 10) / 10;
    const lowerLimit = Math.ceil(Math.round(prevClose * 0.85 * 100) / 10) / 10;

    // Proximity to limits (distance as percentage of limit)
    // Distance to Upper: % difference between LTP and upper circuit
    // e.g. if LTP is 97 and Upper is 100, distance is ((100-97)/97)*100 = 3.09%
    let toUpper = 0;
    if (ltp > 0 && upperLimit > 0) {
      toUpper = Math.max(0, ((upperLimit - ltp) / ltp) * 100);
    }

    // Distance to Lower: % difference between LTP and lower circuit
    let toLower = 0;
    if (ltp > 0 && lowerLimit > 0) {
      toLower = Math.max(0, ((ltp - lowerLimit) / ltp) * 100);
    }

    // Determine status
    // Tick size in NEPSE is 0.10 Rs, so we consider "hit" if within 0.10 Rs of the limit.
    const isHitUpper = upperLimit > 0 && ltp >= (upperLimit - 0.1);
    const isHitLower = lowerLimit > 0 && ltp <= (lowerLimit + 0.1);
    
    // Near circuit is within 3% distance
    const isNearUpper = !isHitUpper && toUpper <= 3.0;
    const isNearLower = !isHitLower && toLower <= 3.0;

    let status = "Normal";
    let statusClass = "badge-normal";
    if (isHitUpper) {
      status = "Hit Upper Limit";
      statusClass = "badge-hit-upper";
    } else if (isHitLower) {
      status = "Hit Lower Limit";
      statusClass = "badge-hit-lower";
    } else if (isNearUpper) {
      status = "Near Upper";
      statusClass = "badge-near-upper";
    } else if (isNearLower) {
      status = "Near Lower";
      statusClass = "badge-near-lower";
    }

    return {
      ...stock,
      prevClose,
      ltp,
      upperLimit,
      lowerLimit,
      toUpper,
      toLower,
      status,
      statusClass,
      isHitUpper,
      isHitLower,
      isNearUpper,
      isNearLower
    };
  });

  updateMetricCards();
}

function updateMetricCards() {
  const upperHits = computedData.filter(s => s.isHitUpper).length;
  const lowerHits = computedData.filter(s => s.isHitLower).length;
  const nearUpper = computedData.filter(s => s.isNearUpper).length;
  const nearLower = computedData.filter(s => s.isNearLower).length;

  document.getElementById("upperHitsCount").textContent = upperHits;
  document.getElementById("lowerHitsCount").textContent = lowerHits;
  document.getElementById("nearUpperCount").textContent = nearUpper;
  document.getElementById("nearLowerCount").textContent = nearLower;
}

function applyFilter() {
  const searchQuery = document.getElementById("circuitSearch").value.toUpperCase();
  
  filteredData = computedData.filter(stock => {
    // Search query matches Symbol or Name
    const matchesSearch = stock.symbol.toUpperCase().includes(searchQuery) ||
                          (stock.name && stock.name.toUpperCase().includes(searchQuery));
    
    // Sector filter
    const matchesSector = currentSector === "all" || stock.sector === currentSector;

    // Tab filter
    let matchesTab = true;
    if (currentFilter === "near-upper") matchesTab = stock.isNearUpper;
    else if (currentFilter === "near-lower") matchesTab = stock.isNearLower;
    else if (currentFilter === "hit-upper") matchesTab = stock.isHitUpper;
    else if (currentFilter === "hit-lower") matchesTab = stock.isHitLower;

    return matchesSearch && matchesSector && matchesTab;
  });

  if (sortConfig.key) {
    sortData(sortConfig.key, sortConfig.direction);
  }

  renderTable();
}

function sortData(key, direction) {
  filteredData.sort((a, b) => {
    let valA = a[key];
    let valB = b[key];

    // Numbers check
    const numA = parseFloat(valA);
    const numB = parseFloat(valB);
    if (!isNaN(numA) && !isNaN(numB)) {
      valA = numA;
      valB = numB;
    }

    if (valA < valB) return direction === 'asc' ? -1 : 1;
    if (valA > valB) return direction === 'asc' ? 1 : -1;
    return 0;
  });
}

function renderTable() {
  const body = document.getElementById("circuitTableBody");
  const totalCount = document.getElementById("totalCount");
  const filteredCount = document.getElementById("filteredCount");

  if (!body) return;

  if (totalCount) totalCount.textContent = computedData.length;
  if (filteredCount) filteredCount.textContent = filteredData.length;

  if (filteredData.length === 0) {
    body.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; padding: 3rem; color: var(--text-secondary);">
          <i class="fas fa-search" style="font-size: 2rem; margin-bottom: 1rem; opacity: 0.5;"></i>
          <p>No stocks found matching the criteria.</p>
        </td>
      </tr>
    `;
    return;
  }

  body.innerHTML = filteredData.map(stock => {
    const isUp = stock.change >= 0;
    const ltpClass = isUp ? "price-up" : "price-down";

    return `
      <tr onclick="window.openQuickPanel('${stock.symbol}')">
        <td class="symbol-cell" style="font-weight: 700; color: var(--primary);">${stock.symbol}</td>
        <td style="color: var(--text-secondary); max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${stock.name}</td>
        <td class="${ltpClass}" style="font-weight: 700;">${formatPrice(stock.price)}</td>
        <td>${formatPrice(stock.prevClose)}</td>
        <td class="text-danger" style="opacity: 0.85;">${formatPrice(stock.lowerLimit)}</td>
        <td class="text-success" style="opacity: 0.85;">${formatPrice(stock.upperLimit)}</td>
        <td class="text-right" style="font-weight: 600;">${stock.isHitUpper ? '0.00%' : formatPercent(stock.toUpper)}</td>
        <td class="text-right" style="font-weight: 600;">${stock.isHitLower ? '0.00%' : formatPercent(stock.toLower)}</td>
        <td class="text-center">
          <span class="status-badge ${stock.statusClass}">${stock.status}</span>
        </td>
      </tr>
    `;
  }).join("");
}

// Quick panel trigger details (loads panel content and slides in)
window.openQuickPanel = async function (symbol) {
  const stock = computedData.find(s => s.symbol === symbol);
  if (!stock) return;

  const panel = document.getElementById('quickPanel');
  const overlay = document.getElementById('panelOverlay');
  const content = document.getElementById('panelContent');

  content.innerHTML = `
    <div style="margin-top: 1rem;">
      <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem;">
        <div class="symbol-logo-wrapper" style="position: relative; width: 44px; height: 44px; border-radius: 50%; overflow: hidden; background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
          <img src="${getStockImageUrl(stock.symbol, '../../', stock.name)}" 
               onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" 
               alt="${stock.symbol}" 
               style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" />
          <div class="symbol-avatar" style="display: none; position: absolute; inset: 0; align-items: center; justify-content: center; font-size: 1.1rem; font-weight: 700; text-transform: uppercase; color: #fff; background: linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%); border-radius: 50%; letter-spacing: -0.2px;">
            ${stock.symbol.substring(0, 2)}
          </div>
        </div>
        <div style="flex: 1;">
          <h3 style="color: var(--primary); margin: 0; font-weight: 800; font-size: 1.5rem; line-height: 1.2;">${stock.symbol}</h3>
          <p style="color: var(--text-secondary); font-size: 0.85rem; line-height: 1.4; margin: 0.2rem 0 0 0;">${stock.name}</p>
        </div>
      </div>
      
      <div class="glass" style="padding: 1.2rem; margin-bottom: 1.5rem;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 0.75rem;">
          <span style="color: var(--text-secondary); font-size: 0.9rem;">LTP</span>
          <span style="font-weight: 700; font-size: 0.95rem;">Rs. ${formatPrice(stock.price)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 0.75rem;">
          <span style="color: var(--text-secondary); font-size: 0.9rem;">Prev. Close</span>
          <span style="font-weight: 600; font-size: 0.9rem; color: var(--text-secondary);">Rs. ${formatPrice(stock.prevClose)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 0.75rem; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 0.75rem;">
          <span style="color: var(--text-secondary); font-size: 0.9rem;">Lower Limit (-15%)</span>
          <span class="text-danger" style="font-weight: 700;">Rs. ${formatPrice(stock.lowerLimit)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 0.75rem;">
          <span style="color: var(--text-secondary); font-size: 0.9rem;">Upper Limit (+15%)</span>
          <span class="text-success" style="font-weight: 700;">Rs. ${formatPrice(stock.upperLimit)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 0.75rem; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 0.75rem;">
          <span style="color: var(--text-secondary); font-size: 0.9rem;">Distance to Upper</span>
          <span style="font-weight: 700; color: #f59e0b;">${stock.isHitUpper ? '0.00%' : formatPercent(stock.toUpper)}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: var(--text-secondary); font-size: 0.9rem;">Distance to Lower</span>
          <span style="font-weight: 700; color: #a855f7;">${stock.isHitLower ? '0.00%' : formatPercent(stock.toLower)}</span>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.8rem;">
        <button class="btn btn-primary" onclick="window.location.href='../calculator/buy-sell.html?symbol=${stock.symbol}'">
          <i class="fas fa-calculator"></i> Calculator
        </button>
        <button class="btn btn-secondary" onclick="window.location.href='../watchlist.html'">
          <i class="fas fa-eye"></i> Watchlist
        </button>
        <button class="btn btn-secondary" onclick="window.location.href='../calculator/position-sizing.html?symbol=${stock.symbol}'">
          <i class="fas fa-shield-halved"></i> Risk Analysis
        </button>
        <button class="btn btn-secondary" onclick="window.location.href='stock-details.html?symbol=${stock.symbol}'">
          <i class="fas fa-chart-line"></i> Full Details
        </button>
      </div>
    </div>
  `;

  panel.classList.add('active');
  overlay.classList.add('active');
}

function closeQuickPanel() {
  document.getElementById('quickPanel').classList.remove('active');
  document.getElementById('panelOverlay').classList.remove('active');
}

async function init() {
  globalState.setState({ activePage: "circuit-level" });
  await Layout.init();

  // Search input typing
  const searchInput = document.getElementById("circuitSearch");
  if (searchInput) searchInput.addEventListener("input", applyFilter);

  // Sector filter change
  const sectorFilter = document.getElementById("circuitSectorFilter");
  if (sectorFilter) {
    sectorFilter.addEventListener("change", (e) => {
      currentSector = e.target.value;
      applyFilter();
    });
  }

  // Filter Tabs
  document.querySelectorAll(".circuit-tab").forEach(tab => {
    tab.addEventListener("click", (e) => {
      document.querySelectorAll(".circuit-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      currentFilter = tab.dataset.filter;
      applyFilter();
    });
  });

  // Table Sorting
  document.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (sortConfig.key === key) {
        sortConfig.direction = sortConfig.direction === 'asc' ? 'desc' : 'asc';
      } else {
        sortConfig.key = key;
        sortConfig.direction = key === 'symbol' || key === 'name' ? 'asc' : 'desc';
      }

      // Update header UI indicator classes
      document.querySelectorAll('th.sortable').forEach(h => h.classList.remove('asc', 'desc'));
      th.classList.add(sortConfig.direction);

      applyFilter();
    });
  });

  // Setup quick panel listeners
  const closePanelBtn = document.getElementById('closePanel');
  const panelOverlay = document.getElementById('panelOverlay');
  if (closePanelBtn) closePanelBtn.addEventListener('click', closeQuickPanel);
  if (panelOverlay) panelOverlay.addEventListener('click', closeQuickPanel);

  // Loading animation placeholder
  const tableBody = document.getElementById("circuitTableBody");
  if (tableBody) {
    tableBody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 3rem;"><i class="fas fa-spinner fa-spin"></i> Loading daily circuit data...</td></tr>`;
  }

  // Initial data fetch
  await fetchMarket();

  // Polling every 5 seconds
  setInterval(fetchMarket, 5000);
}

document.addEventListener("DOMContentLoaded", init);
