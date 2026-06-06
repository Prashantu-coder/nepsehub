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
let sortConfig = { key: 'changePercent', direction: 'desc' }; // Default sort by %Change descending
let quickPanelChartInstance = null;

async function fetchMarket() {
  const [data, watchlist] = await Promise.all([
    DataService.getLiveMarket(),
    StorageService.getWatchlist()
  ]);

  if (data && data.length > 0) {
    // Keep track of current prices for flash detection before saving new data
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
    updateMarketWidgets();
    populateSectorCarousel();

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
  }
}

function updateMarketWidgets() {
  const advCount = marketData.filter(s => parseFloat(s.change) > 0).length;
  const decCount = marketData.filter(s => parseFloat(s.change) < 0).length;
  const neuCount = marketData.filter(s => parseFloat(s.change) === 0).length;
  const total = marketData.length || 1;

  // Text values
  const advEl = document.getElementById("advancesCount");
  const decEl = document.getElementById("declinesCount");
  const neuEl = document.getElementById("neutralCount");
  if (advEl) advEl.textContent = advCount;
  if (decEl) decEl.textContent = decCount;
  if (neuEl) neuEl.textContent = neuCount;

  // Breadth Bar width transitions
  const advPct = (advCount / total) * 100;
  const decPct = (decCount / total) * 100;
  const neuPct = (neuCount / total) * 100;

  const barAdv = document.getElementById('barAdvances');
  const barDec = document.getElementById('barDeclines');
  const barNeu = document.getElementById('barNeutral');

  if (barAdv) barAdv.style.width = `${advPct}%`;
  if (barDec) barDec.style.width = `${decPct}%`;
  if (barNeu) barNeu.style.width = `${neuPct}%`;

  // Market Sentiment Score (advCount / moving stocks)
  const activeStocks = advCount + decCount;
  const sentimentScore = activeStocks > 0 ? Math.round((advCount / activeStocks) * 100) : 50;

  const needle = document.getElementById("gaugeNeedle");
  const valText = document.getElementById("sentimentValue");
  const lblText = document.getElementById("sentimentLabel");

  if (needle) {
    // Map 0-100% to -90deg to +90deg
    const angle = (sentimentScore - 50) * 1.8;
    needle.style.transform = `translateX(-50%) rotate(${angle}deg)`;
  }
  if (valText) valText.textContent = `${sentimentScore}%`;

  if (lblText) {
    if (sentimentScore >= 80) {
      lblText.textContent = "EXTREME GREED";
      lblText.style.color = "#10b981";
    } else if (sentimentScore >= 60) {
      lblText.textContent = "GREED";
      lblText.style.color = "#34d399";
    } else if (sentimentScore > 40) {
      lblText.textContent = "NEUTRAL";
      lblText.style.color = "var(--text-secondary)";
    } else if (sentimentScore >= 20) {
      lblText.textContent = "FEAR";
      lblText.style.color = "#f87171";
    } else {
      lblText.textContent = "EXTREME FEAR";
      lblText.style.color = "#ef4444";
    }
  }
}

function populateSectorCarousel() {
  const container = document.getElementById("sectorCarousel");
  if (!container || marketData.length === 0) return;

  // Extract unique sectors
  const sectors = [...new Set(marketData.map(s => s.sector))].filter(Boolean);

  // Calculate average %Change for each sector
  const sectorData = sectors.map(sec => {
    const secStocks = marketData.filter(s => s.sector === sec);
    const avgChange = secStocks.reduce((sum, s) => sum + (parseFloat(s.changePercent) || 0), 0) / (secStocks.length || 1);
    return { name: sec, avgChange: avgChange };
  });

  // Sort sectors by average change descending
  sectorData.sort((a, b) => b.avgChange - a.avgChange);

  // Preserve existing "All" pill
  const activeSector = currentSector;
  let html = `
    <div class="glass sector-pill-card ${activeSector === 'all' ? 'active' : ''}" data-sector="all">
        <div class="sector-pill-name">All Sectors</div>
        <div class="sector-pill-chg neutral">Market</div>
    </div>
  `;

  html += sectorData.map(sec => {
    const isUp = sec.avgChange >= 0;
    const chgClass = sec.avgChange > 0 ? "up" : (sec.avgChange < 0 ? "down" : "neutral");
    const sign = isUp ? "+" : "";
    const activeClass = activeSector === sec.name ? "active" : "";

    return `
      <div class="glass sector-pill-card ${activeClass}" data-sector="${sec.name}">
          <div class="sector-pill-name" title="${sec.name}">${sec.name}</div>
          <div class="sector-pill-chg ${chgClass}">${sign}${sec.avgChange.toFixed(2)}%</div>
      </div>
    `;
  }).join('');

  // Update DOM only if contents changed to prevent focus scroll jumps
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;

  if (container.children.length <= 1 || container.innerText !== tempDiv.innerText) {
    container.innerHTML = html;

    // Re-attach card pill event handlers
    document.querySelectorAll('.sector-pill-card').forEach(card => {
      card.addEventListener('click', () => {
        document.querySelectorAll('.sector-pill-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        currentSector = card.dataset.sector;
        applyFilter();
      });
    });
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
    else if (currentCategory === "neutral") matchesCategory = change === 0;

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

  if (!body) return;

  // Update stats
  if (totalCount) totalCount.textContent = marketData.length;
  if (filteredCount) filteredCount.textContent = filteredData.length;

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
      const changePercent = parseFloat(stock.changePercent) || 0;
      const changeClass = changePercent >= 0 ? "price-up" : "price-down";
      const sign = changePercent >= 0 ? "+" : "";

      // Apply dynamic row class based on percent change
      const rowClass = changePercent > 0 ? "tr-up" : (changePercent < 0 ? "tr-down" : "tr-neutral");
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
          newContent = `Rs. ${(parseFloat(stock.price) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
        } else if (col === 'ltq') {
          newContent = parseFloat(stock.ltq || 0).toLocaleString();
        } else if (col === 'changePercent') {
          newContent = `${sign}${change.toFixed(2)} (${sign}${changePercent.toFixed(2)}%)`;
          if (cell.className !== changeClass) cell.className = changeClass;
        } else if (col === 'open') {
          newContent = `Rs. ${parseFloat(stock.open || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
        } else if (col === 'high') {
          newContent = `Rs. ${parseFloat(stock.high || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
        } else if (col === 'low') {
          newContent = `Rs. ${parseFloat(stock.low || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
        } else if (col === 'volume') {
          newContent = parseInt(stock.volume || 0).toLocaleString();
        } else if (col === 'previousClose') {
          newContent = `Rs. ${parseFloat(stock.previousClose || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
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
    const changePercent = parseFloat(stock.changePercent) || 0;
    const changeClass = changePercent >= 0 ? "price-up" : "price-down";
    const sign = changePercent >= 0 ? "+" : "";
    const rowClass = changePercent > 0 ? "tr-up" : (changePercent < 0 ? "tr-down" : "tr-neutral");

    const cols = {
      symbol: `
              <td class="symbol-cell" title="${stock.name}">
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
      price: `<td id="price-cell-${stock.symbol}" data-field="price" style="font-weight: 700;">Rs. ${(parseFloat(stock.price) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>`,
      ltq: `<td data-field="ltq">${parseFloat(stock.ltq || 0).toLocaleString()}</td>`,
      changePercent: `<td class="${changeClass}" data-field="changePercent" style="font-weight: 600;">${sign}${change.toFixed(2)} (${sign}${changePercent.toFixed(2)}%)</td>`,
      open: `<td data-field="open">Rs. ${parseFloat(stock.open || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>`,
      high: `<td data-field="high">Rs. ${parseFloat(stock.high || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>`,
      low: `<td data-field="low">Rs. ${parseFloat(stock.low || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>`,
      volume: `<td data-field="volume">${parseInt(stock.volume || 0).toLocaleString()}</td>`,
      previousClose: `<td data-field="previousClose">Rs. ${parseFloat(stock.previousClose || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>`
    };

    return `<tr id="row-${stock.symbol}" data-symbol="${stock.symbol}" class=" ${rowClass}" onclick="window.openQuickPanel('${stock.symbol}')" style="cursor: pointer;">
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

  const change = parseFloat(stock.changePercent) || 0;
  const isUp = change >= 0;

  content.innerHTML = `
    <div style="margin-top: 1rem; display: flex; flex-direction: column; gap: 1rem;">
      <div style="display: flex; align-items: center; gap: 1rem;">
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
      
      <!-- Intraday Live 1D Chart -->
      <div class="glass" style="padding: 1rem; border-radius: 16px; position: relative;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 0.8rem; font-size: 0.8rem; font-weight: 700;">
          <span style="color: var(--text-secondary);"><i class="fas fa-bolt"></i> 1D INTRADAY SPARKLINE</span>
          <span style="color: ${isUp ? '#10b981' : '#ef4444'}">
            Rs. ${stock.price} (${isUp ? '+' : ''}${change.toFixed(2)}%)
          </span>
        </div>
        <div style="height: 140px; width: 100%; position: relative;">
          <canvas id="quickPanelChart"></canvas>
        </div>
      </div>

      <!-- Quick Metrics Grid -->
      <div class="glass" style="padding: 1rem; display: grid; grid-template-columns: 1fr 1fr; gap: 0.8rem; font-size: 0.85rem; border-radius: 16px;">
        <div>
          <span style="color: var(--text-secondary); font-weight: 700;">HIGH</span>
          <div style="font-weight: 800; font-size: 1rem; color: var(--text-primary); margin-top: 0.2rem;">Rs. ${stock.high}</div>
        </div>
        <div>
          <span style="color: var(--text-secondary); font-weight: 700;">LOW</span>
          <div style="font-weight: 800; font-size: 1rem; color: var(--text-primary); margin-top: 0.2rem;">Rs. ${stock.low}</div>
        </div>
        <div>
          <span style="color: var(--text-secondary); font-weight: 700;">OPEN</span>
          <div style="font-weight: 600; color: var(--text-secondary); margin-top: 0.2rem;">Rs. ${stock.open}</div>
        </div>
        <div>
          <span style="color: var(--text-secondary); font-weight: 700;">VOLUME (TTQ)</span>
          <div style="font-weight: 600; color: var(--text-secondary); margin-top: 0.2rem;">${parseInt(stock.volume).toLocaleString()}</div>
        </div>
      </div>

      <!-- Action Buttons -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.8rem; margin-top: 0.5rem;">
        <button class="btn btn-primary" onclick="window.location.href='../calculator/buy-sell.html?symbol=${stock.symbol}'" style="padding: 0.75rem;">
          <i class="fas fa-calculator"></i> Buy/Sell Calc
        </button>
        <button class="btn btn-secondary" onclick="window.location.href='../watchlist.html?add=${stock.symbol}'" style="padding: 0.75rem;">
          <i class="fas fa-heart"></i> Watchlist
        </button>
        <button class="btn btn-secondary" onclick="window.location.href='../calculator/position-sizing.html?symbol=${stock.symbol}'" style="grid-column: span 2; padding: 0.75rem;">
          <i class="fas fa-shield-halved"></i> Position Risk Analyzer
        </button>
      </div>
    </div>
  `;

  panel.classList.add('active');
  overlay.classList.add('active');

  // Trigger side panel intraday chart rendering immediately
  renderQuickPanelChart(stock.symbol, isUp);
}

async function renderQuickPanelChart(symbol, isUp) {
  try {
    const rawData = await DataService.getIndexChart(symbol, '1D');
    if (!rawData || !Array.isArray(rawData) || rawData.length === 0) {
      console.warn("No intraday chart data returned from backend for", symbol);
      return;
    }

    // Sort coordinates chronologically by time
    const sorted = [...rawData].sort((a, b) => (a.time || 0) - (b.time || 0));

    const labels = sorted.map(item => {
      if (!item.time) return '';
      const date = new Date(item.time * 1000);
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    });

    const prices = sorted.map(item => item.contractRate || item.value || 0);

    const canvas = document.getElementById("quickPanelChart");
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const color = isUp ? '#10b981' : '#ef4444';

    // Premium Linear Gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, 140);
    gradient.addColorStop(0, color + '33');
    gradient.addColorStop(1, color + '00');

    if (quickPanelChartInstance) {
      quickPanelChartInstance.destroy();
    }

    quickPanelChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          data: prices,
          borderColor: color,
          borderWidth: 2,
          pointRadius: 0,
          fill: true,
          backgroundColor: gradient,
          tension: 0.2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            mode: 'index',
            intersect: false,
            backgroundColor: '#1e293b',
            titleColor: '#94a3b8',
            bodyColor: '#f1f5f9',
            borderColor: 'rgba(255,255,255,0.08)',
            borderWidth: 1
          }
        },
        scales: {
          x: { display: false },
          y: {
            grid: { color: 'rgba(255,255,255,0.03)' },
            ticks: {
              color: '#94a3b8',
              font: { size: 9 },
              maxTicksLimit: 5
            }
          }
        }
      }
    });

  } catch (error) {
    console.error("Failed to render Quick Panel Chart:", error);
  }
}

function closeQuickPanel() {
  document.getElementById('quickPanel').classList.remove('active');
  document.getElementById('panelOverlay').classList.remove('active');
  if (quickPanelChartInstance) {
    quickPanelChartInstance.destroy();
    quickPanelChartInstance = null;
  }
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
  globalState.setState({ activePage: "stocks-today" });
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

  // Carousel scroll button event handlers
  const carousel = document.getElementById("sectorCarousel");
  const prevBtn = document.getElementById("carouselPrevBtn");
  const nextBtn = document.getElementById("carouselNextBtn");

  if (carousel && prevBtn && nextBtn) {
    prevBtn.addEventListener('click', () => {
      carousel.scrollBy({ left: -200, behavior: 'smooth' });
    });
    nextBtn.addEventListener('click', () => {
      carousel.scrollBy({ left: 200, behavior: 'smooth' });
    });
  }

  // Panel Close
  const closePanelBtn = document.getElementById('closePanel');
  const panelOverlay = document.getElementById('panelOverlay');
  if (closePanelBtn) closePanelBtn.addEventListener('click', closeQuickPanel);
  if (panelOverlay) panelOverlay.addEventListener('click', closeQuickPanel);

  // Column Customization UI population
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

  applyColumnVisibility();

  // Initial fetch
  const marketBody = document.getElementById("marketBody");
  if (marketBody) {
    marketBody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 3rem;"><i class="fas fa-spinner fa-spin"></i> Loading live market data...</td></tr>`;
  }
  await fetchMarket();

  // Refresh every 5 seconds for ultimate real-time feel
  setInterval(fetchMarket, 5000);
}

document.addEventListener("DOMContentLoaded", init);
