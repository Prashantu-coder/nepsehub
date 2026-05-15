import globalState from "../../state.js";
import { Layout } from "../../layout.js";
import DataService from "../../../services/dataService.js";
import StorageService from "../../../services/storageService.js";

let marketData = [];
let filteredData = [];
let watchlistSymbols = [];
let currentCategory = "all";
let currentSector = "all";
let sortConfig = { key: null, direction: 'asc' };

async function fetchMarket() {
  const [data, watchlist] = await Promise.all([
    DataService.getLiveMarket(),
    StorageService.getWatchlist()
  ]);
  
  if (data && data.length > 0) {
    marketData = data;
    watchlistSymbols = watchlist;
    applyFilter();
  }
}

function applyFilter() {
  const query = document.getElementById("marketSearch").value.toUpperCase();
  filteredData = marketData.filter((stock) => {
    const matchesSearch =
      stock.symbol.toUpperCase().includes(query) ||
      (stock.name &&
        stock.name.toUpperCase().includes(query));

    const change = parseFloat(stock.change);
    let matchesCategory = true;
    if (currentCategory === "advances") matchesCategory = change > 0;
    else if (currentCategory === "declines") matchesCategory = change < 0;
    else if (currentCategory === "neutral")
      matchesCategory = change === 0;

    const matchesSector = currentSector === 'all' || stock.sector === currentSector;

    return matchesSearch && matchesCategory && matchesSector;
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

    // Parse numbers if possible
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

window.renderTable = function() {
  const body = document.getElementById("marketBody");
  const totalCount = document.getElementById("totalCount");
  const filteredCount = document.getElementById("filteredCount");
  const advancesCount = document.getElementById("advancesCount");
  const declinesCount = document.getElementById("declinesCount");
  const neutralCount = document.getElementById("neutralCount");

  if (!body) return;

  // Update stats
  if (totalCount) totalCount.textContent = marketData.length;
  if (filteredCount) filteredCount.textContent = filteredData.length;
  if (advancesCount) advancesCount.textContent = marketData.filter(s => parseFloat(s.change) > 0).length;
  if (declinesCount) declinesCount.textContent = marketData.filter(s => parseFloat(s.change) < 0).length;
  if (neutralCount) neutralCount.textContent = marketData.filter(s => parseFloat(s.change) === 0).length;

  body.innerHTML = filteredData.map((stock) => {
      const change = parseFloat(stock.change);
      const changeClass = change >= 0 ? "price-up" : "price-down";
      const inWatchlist = watchlistSymbols.includes(stock.symbol);
      const starClass = inWatchlist ? 'fas active' : 'far';

      const cols = {
          symbol: `
              <td class="symbol-cell" title="${stock.name}">
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                  ${stock.symbol}
                </div>
              </td>`,
          price: `<td style="font-weight: 700;">${stock.price}</td>`,
          ltq: `<td>${stock.ltq}</td>`,
          changePercent: `<td class="${changeClass}">${stock.change} (${stock.changePercent}%)</td>`,
          open: `<td>${stock.open}</td>`,
          high: `<td>${stock.high}</td>`,
          low: `<td>${stock.low}</td>`,
          volume: `<td>${parseInt(stock.volume).toLocaleString()}</td>`,
          previousClose: `<td>${stock.previousClose}</td>`
      };

      return `<tr class="fade-in" onclick="window.openQuickPanel('${stock.symbol}')" style="cursor: pointer;">
          ${Object.keys(cols).filter(k => visibleCols.includes(k)).map(k => cols[k]).join('')}
      </tr>`;
  }).join("");
};

window.openQuickPanel = async function(symbol) {
  const stock = marketData.find(s => s.symbol === symbol);
  if (!stock) return;

  const panel = document.getElementById('quickPanel');
  const overlay = document.getElementById('panelOverlay');
  const content = document.getElementById('panelContent');
  const inWatchlist = await StorageService.isInWatchlist(stock.symbol);

  content.innerHTML = `
    <div style="margin-top: 1rem;">
      <h3 style="color: var(--primary); margin-bottom: 0.2rem;">${stock.symbol}</h3>
      <p style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 1.5rem;">${stock.name}</p>
      
      <div class="glass" style="padding: 1rem; margin-bottom: 1.5rem;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
          <span style="color: var(--text-secondary);">LTP</span>
          <span style="font-weight: 700;">Rs. ${stock.price}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: var(--text-secondary);">Change</span>
          <span class="${parseFloat(stock.change) >= 0 ? 'price-up' : 'price-down'}">${stock.change} (${stock.changePercent}%)</span>
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
        <button class="btn btn-secondary">
          <i class="fas fa-pen"></i> Add Note
        </button>
      </div>
    </div>
  `;

  panel.classList.add('active');
  overlay.classList.add('active');
}

// Note: Watchlist is now managed from the Watchlist page directly.

function closeQuickPanel() {
  document.getElementById('quickPanel').classList.remove('active');
  document.getElementById('panelOverlay').classList.remove('active');
}

// Column Customization Logic
let visibleCols = ['symbol', 'price', 'ltq', 'changePercent', 'open', 'high', 'low', 'volume', 'previousClose'];

async function initColumnVisibility() {
    const saved = await StorageService.load('market_visible_cols');
    if (saved) visibleCols = saved;
    applyColumnVisibility();
}

function applyColumnVisibility() {
    // Header visibility
    document.querySelectorAll('th[data-sort]').forEach(th => {
        const col = th.dataset.sort;
        th.style.display = visibleCols.includes(col) ? 'table-cell' : 'none';
    });
    // Symbol is always visible
    const symbolTh = document.querySelector('th[data-sort="symbol"]');
    if (symbolTh) symbolTh.style.display = 'table-cell';
    
    renderTable();
}

async function init() {
  globalState.setState({ activePage: "live-market" });
  await Layout.init();
  await initColumnVisibility();

  const searchInput = document.getElementById("marketSearch");
  if (searchInput) searchInput.addEventListener("input", applyFilter);

  // Header Sorting
  document.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (sortConfig.key === key) {
        sortConfig.direction = sortConfig.direction === 'asc' ? 'desc' : 'asc';
      } else {
        sortConfig.key = key;
        sortConfig.direction = 'desc'; // Default to desc for financial data
      }

      // Update UI classes
      document.querySelectorAll('th.sortable').forEach(h => h.classList.remove('asc', 'desc'));
      th.classList.add(sortConfig.direction);
      
      applyFilter();
    });
  });

  // Sector filtering
  const sectorFilter = document.getElementById('sectorFilter');
  if (sectorFilter) {
    sectorFilter.addEventListener('change', (e) => {
      currentSector = e.target.value;
      applyFilter();
    });
  }

  // Panel Close
  const closePanelBtn = document.getElementById('closePanel');
  const panelOverlay = document.getElementById('panelOverlay');
  if (closePanelBtn) closePanelBtn.addEventListener('click', closeQuickPanel);
  if (panelOverlay) panelOverlay.addEventListener('click', closeQuickPanel);

  // Column Customization Logic
  const settingsBtn = document.getElementById('columnSettingsBtn');
  const settingsPopup = document.getElementById('columnSettingsPopup');
  
  if (settingsBtn) {
    settingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        settingsPopup.classList.toggle('active');
    });
  }

  document.addEventListener('click', (e) => {
      if (settingsPopup && !settingsPopup.contains(e.target)) settingsPopup.classList.remove('active');
  });

  document.querySelectorAll('.column-option input').forEach(cb => {
      const col = cb.dataset.col;
      cb.checked = visibleCols.includes(col);
      
      cb.addEventListener('change', () => {
          if (cb.checked) {
              if (!visibleCols.includes(col)) visibleCols.push(col);
          } else {
              visibleCols = visibleCols.filter(c => c !== col);
          }
          StorageService.save('market_visible_cols', visibleCols);
          applyColumnVisibility();
      });
  });

  // Category filtering
  document.querySelectorAll(".summary-item").forEach((item) => {
    item.addEventListener("click", () => {
      document
        .querySelectorAll(".summary-item")
        .forEach((i) => i.classList.remove("active"));
      item.classList.add("active");
      
      currentCategory = item.classList.contains("advances")
        ? "advances"
        : item.classList.contains("declines")
        ? "declines"
        : item.classList.contains("neutral")
        ? "neutral"
        : "all";

      applyFilter();
    });
  });

  applyColumnVisibility();

  // Initial fetch
  const marketBody = document.getElementById("marketBody");
  if (marketBody) {
    marketBody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 3rem;"><i class="fas fa-spinner fa-spin"></i> Loading live market data...</td></tr>`;
  }
  await fetchMarket();

  // Refresh every 30 seconds
  setInterval(fetchMarket, 30000);
}

document.addEventListener("DOMContentLoaded", init);
