import globalState from "../../state.js";
import { Layout } from "../../layout.js";
import DataService from "../../../services/dataService.js";
import StorageService from "../../../services/storageService.js";
import { getStockImageUrl } from "../../stockImageProvider.js";

let marketData = [];
let prevMarketPrices = {}; // Cache to track previous prices for row flashing
let filteredData = [];
let watchlistSymbols = [];
let currentCategory = "all";
let currentSector = "all";
let sortConfig = { key: null, direction: 'asc' };
let isMarketOpen = null; // null = unknown (first load), true/false after first fetch

// Formatting helpers (en-IN for Nepali lakhs/crores formatting)
const formatPrice = (val) => parseFloat(val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatVolume = (val) => parseInt(val || 0).toLocaleString('en-IN');
const formatPercent = (val) => {
  const num = parseFloat(val || 0);
  const sign = num >= 0 ? '+' : '';
  return `${sign}${num.toFixed(2)}%`;
};
const formatPointChange = (val) => {
  const num = parseFloat(val || 0);
  return num.toFixed(2);
};

function formatTimestamp(lastUpdatedStr) {
  if (!lastUpdatedStr) {
    const now = new Date();
    let hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // the hour '0' should be '12'
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

async function updateMarketStatus() {
  const dot = document.getElementById("marketStatusDot");
  const title = document.querySelector(".live-market-title");
  if (!dot) return false;

  const setStatus = (open, isFallback = false) => {
    isMarketOpen = open;
    const titleText = isFallback ? " (Fallback Check)" : "";
    if (open) {
      dot.className = "status-dot-indicator status-dot-open";
      dot.setAttribute("title", `Market is Open${titleText}`);
      if (title) {
        title.classList.remove("text-status-closed");
        title.classList.add("text-status-open");
      }
    } else {
      dot.className = "status-dot-indicator status-dot-closed";
      dot.setAttribute("title", `Market is Closed${titleText}`);
      if (title) {
        title.classList.remove("text-status-open");
        title.classList.add("text-status-closed");
      }
    }
    return open;
  };

  try {
    const response = await fetch("https://marketstatus.onrender.com/market-status");
    if (response.ok) {
      const statusData = await response.json();
      if (statusData && statusData.status) {
        const statusStr = statusData.status.toLowerCase();
        const open = statusStr.includes("open") || statusStr === "open";
        return setStatus(open, false);
      }
    }
  } catch (e) {
    console.warn("⚠️ Market status fetch failed, falling back to time check:", e);
  }

  // Fallback to dynamic timezone checks
  const nepalDate = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kathmandu" }));
  const day = nepalDate.getDay();
  const hour = nepalDate.getHours();
  const min = nepalDate.getMinutes();
  const timeVal = hour * 60 + min;

  // Trading days: Sunday (0) to Thursday (4). Trading hours: 11:00 AM (660) to 3:00 PM (900)
  const isTradingDay = (day >= 0 && day <= 4);
  const isTradingHours = (timeVal >= 660 && timeVal <= 900);
  const open = isTradingDay && isTradingHours;

  return setStatus(open, true);
}

async function fetchMarket() {
  const [data, watchlist] = await Promise.all([
    DataService.getLiveMarket(),
    StorageService.getWatchlist()
  ]);

  if (data && data.length > 0) {
    // Keep track of current prices for flash detection
    const newPrices = {};
    data.forEach(s => {
      newPrices[s.symbol] = parseFloat(s.price) || 0;
    });

    // Check for price changes to trigger flashes
    const flashTriggers = {};
    if (Object.keys(prevMarketPrices).length > 0) {
      data.forEach(s => {
        const oldPrice = prevMarketPrices[s.symbol];
        const newPrice = newPrices[s.symbol];
        if (oldPrice !== undefined && oldPrice !== newPrice) {
          flashTriggers[s.symbol] = newPrice > oldPrice ? 'up' : 'down';
        }
      });
    }

    marketData = data;
    prevMarketPrices = newPrices;
    watchlistSymbols = watchlist || [];
    applyFilter();

    // Trigger row level visual flash animations
    setTimeout(() => {
      Object.keys(flashTriggers).forEach(sym => {
        const cell = document.getElementById(`price-cell-${sym}`);
        if (cell) {
          cell.classList.remove('flash-up', 'flash-down');
          void cell.offsetWidth; // Trigger reflow
          cell.classList.add(flashTriggers[sym] === 'up' ? 'flash-up' : 'flash-down');
        }
      });
    }, 100);

    // Update timestamp from first item
    const timestampEl = document.getElementById("liveTimestamp");
    if (timestampEl) {
      timestampEl.textContent = formatTimestamp(data[0].lastUpdated);
    }
    // Only re-check market status if market is open (avoid repeated API calls when closed)
    if (isMarketOpen !== false) {
      updateMarketStatus();
    }
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

window.renderTable = function () {
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

  // Differential in-place update check to prevent layout flashing
  const currentRows = Array.from(body.querySelectorAll('tr'));
  const currentSymbols = currentRows.map(tr => tr.dataset.symbol);
  const newSymbols = filteredData.map(s => s.symbol);
  const isSameOrder = currentSymbols.length === newSymbols.length && currentSymbols.every((s, i) => s === newSymbols[i]);

  if (isSameOrder) {
    filteredData.forEach(stock => {
      const row = document.getElementById(`row-${stock.symbol}`);
      if (!row) return;

      const change = parseFloat(stock.change) || 0;

      // Apply dynamic row class based on percent change
      const rowClass = change > 0 ? "tr-up" : (change < 0 ? "tr-down" : "tr-neutral");
      if (!row.classList.contains(rowClass)) {
        row.classList.remove("tr-up", "tr-down", "tr-neutral");
        row.classList.add(rowClass);
      }

      // Update each visible field individually without recreating the DOM
      visibleCols.forEach(col => {
        if (col === 'symbol') return;

        const cell = row.querySelector(`td[data-field="${col}"]`);
        if (!cell) return;

        let newContent = "";
        if (col === 'price') {
          newContent = formatPrice(stock.price);
        } else if (col === 'ltq') {
          newContent = formatPrice(stock.ltq);
        } else if (col === 'change') {
          newContent = formatPointChange(stock.change);
        } else if (col === 'changePercent') {
          newContent = formatPercent(stock.changePercent);
        } else if (col === 'open') {
          newContent = formatPrice(stock.open);
        } else if (col === 'high') {
          newContent = formatPrice(stock.high);
        } else if (col === 'low') {
          newContent = formatPrice(stock.low);
        } else if (col === 'previousClose') {
          newContent = formatPrice(stock.previousClose);
        } else if (col === 'volume') {
          newContent = formatVolume(stock.volume);
        } else if (col === 'turnover') {
          newContent = formatPrice(stock.turnover);
        }

        if (cell.innerHTML !== newContent) {
          cell.innerHTML = newContent;
        }
      });
    });
    return;
  }

  // Full table render only if filtering or sorting changes the rows
  body.innerHTML = filteredData.map((stock) => {
    const change = parseFloat(stock.change) || 0;
    const rowClass = change > 0 ? "tr-up" : (change < 0 ? "tr-down" : "tr-neutral");

    const cols = {
      symbol: `
              <td class="symbol-cell">
                <div class="symbol-cell-content" style="display: flex; align-items: center; gap: 0.75rem;">
                  <div class="symbol-logo-wrapper" style="position: relative; width: 32px; height: 32px; border-radius: 50%; overflow: hidden; background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                    <img src="${getStockImageUrl(stock.symbol, '../../', stock.name)}" 
                         onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" 
                         alt="${stock.symbol}" 
                         style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" />
                    <div class="symbol-avatar" style="display: none; position: absolute; inset: 0; align-items: center; justify-content: center; font-size: 0.8rem; font-weight: 700; text-transform: uppercase; color: #fff; background: linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%); border-radius: 50%; letter-spacing: -0.2px;">
                      ${stock.symbol.substring(0, 2)}
                    </div>
                  </div>
                  <div style="display: flex; flex-direction: column;">
                    <span style="font-weight: 700; color: #fff; padding-left: 3px;">${stock.symbol}</span>
                  </div>
                </div>
              </td>`,
      price: `<td id="price-cell-${stock.symbol}" data-field="price" style="font-weight: 700;">${formatPrice(stock.price)}</td>`,
      ltq: `<td data-field="ltq">${formatPrice(stock.ltq)}</td>`,
      change: `<td data-field="change">${formatPointChange(stock.change)}</td>`,
      changePercent: `<td data-field="changePercent">${formatPercent(stock.changePercent)}</td>`,
      open: `<td data-field="open">${formatPrice(stock.open)}</td>`,
      high: `<td data-field="high">${formatPrice(stock.high)}</td>`,
      low: `<td data-field="low">${formatPrice(stock.low)}</td>`,
      previousClose: `<td data-field="previousClose">${formatPrice(stock.previousClose)}</td>`,
      volume: `<td data-field="volume">${formatVolume(stock.volume)}</td>`,
      turnover: `<td data-field="turnover">${formatPrice(stock.turnover)}</td>`
    };

    return `<tr id="row-${stock.symbol}" data-symbol="${stock.symbol}" class="${rowClass}" onclick="window.openQuickPanel('${stock.symbol}')" style="cursor: pointer;" title="${stock.name}">
          ${Object.keys(cols).filter(k => visibleCols.includes(k)).map(k => cols[k]).join('')}
      </tr>`;
  }).join("");
};

window.openQuickPanel = async function (symbol) {
  const stock = marketData.find(s => s.symbol === symbol);
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
      
      <div class="glass" style="padding: 1rem; margin-bottom: 1.5rem;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
          <span style="color: var(--text-secondary);">LTP</span>
          <span style="font-weight: 700;">Rs. ${formatPrice(stock.price)}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: var(--text-secondary);">Change</span>
          <span class="${parseFloat(stock.change) >= 0 ? 'price-up' : 'price-down'}">${formatPointChange(stock.change)} (${formatPercent(stock.changePercent)})</span>
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

function closeQuickPanel() {
  document.getElementById('quickPanel').classList.remove('active');
  document.getElementById('panelOverlay').classList.remove('active');
}

// Column Customization Logic
let visibleCols = ['symbol', 'price', 'ltq', 'change', 'changePercent', 'open', 'high', 'low', 'previousClose', 'volume', 'turnover'];

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

  // Search filter typing
  const searchInput = document.getElementById("marketSearch");
  if (searchInput) searchInput.addEventListener("input", applyFilter);

  // Search button click
  const searchBtn = document.getElementById("searchBtn");
  if (searchBtn) searchBtn.addEventListener("click", applyFilter);

  // Clear button click
  const clearBtn = document.getElementById("clearBtn");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      if (searchInput) searchInput.value = "";
      const sectorFilter = document.getElementById('sectorFilter');
      if (sectorFilter) sectorFilter.value = "all";
      currentSector = "all";
      currentCategory = "all";
      document.querySelectorAll(".badge").forEach(b => b.classList.remove("active"));
      applyFilter();
    });
  }

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

  // Badge Category Filtering (Advances, Declines, Neutral)
  const setupBadgeFilter = (id, category) => {
    const badge = document.getElementById(id);
    if (badge) {
      badge.addEventListener("click", () => {
        const isActive = badge.classList.contains("active");
        document.querySelectorAll(".badge").forEach(b => b.classList.remove("active"));
        if (isActive) {
          currentCategory = "all";
        } else {
          badge.classList.add("active");
          currentCategory = category;
        }
        applyFilter();
      });
    }
  };
  setupBadgeFilter("filterAdvances", "advances");
  setupBadgeFilter("filterDeclines", "declines");
  setupBadgeFilter("filterNeutral", "neutral");

  applyColumnVisibility();

  // Fetch market status once on page load
  const marketIsOpen = await updateMarketStatus();

  // Initial fetch
  const marketBody = document.getElementById("marketBody");
  if (marketBody) {
    marketBody.innerHTML = `<tr><td colspan="11" style="text-align: center; padding: 3rem;"><i class="fas fa-spinner fa-spin"></i> Loading live market data...</td></tr>`;
  }
  await fetchMarket();

  // Refresh market data every 5 seconds (5000ms)
  setInterval(fetchMarket, 5000);

  // Only set up periodic market status polling if market is currently open
  if (marketIsOpen) {
    const syncMarketStatusTimer = () => {
      const now = new Date();
      const msUntilNextMinute = 60000 - (now.getSeconds() * 1000 + now.getMilliseconds());
      setTimeout(() => {
        updateMarketStatus();
        setInterval(updateMarketStatus, 60000);
      }, msUntilNextMinute);
    };
    syncMarketStatusTimer();
  }
}

document.addEventListener("DOMContentLoaded", init);
