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
    globalState.setState({ activePage: "volumepulse" });
    await Layout.init();
  // Setup quick panel listeners
  const closePanelBtn = document.getElementById('closePanel');
  const panelOverlay = document.getElementById('panelOverlay');
  if (closePanelBtn) closePanelBtn.addEventListener('click', closeQuickPanel);
  if (panelOverlay) panelOverlay.addEventListener('click', closeQuickPanel);
}

document.addEventListener("DOMContentLoaded", init);

// ---------- GLOBAL STATE ----------
let originalData = [];      // raw api data {symbol, average_volume_20d}
let currentSort = { column: 'volume', order: 'desc' }; // default high volume first
let volumeChart = null;
let isLoading = true;

// DOM elements
const tableBody = document.getElementById('tableBody');
const searchInput = document.getElementById('searchInput');
const recordsSpan = document.getElementById('recordsCount');
const statsPanel = document.getElementById('statsPanel');
const chartUpdateSpan = document.getElementById('chartUpdateTime');

// helper: format volume with K/M/B
function formatVolume(vol) {
    if (vol >= 1_000_000) return (vol / 1_000_000).toFixed(1) + 'M';
    if (vol >= 1_000) return (vol / 1_000).toFixed(0) + 'K';
    return vol.toString();
}

// get volume tier badge
function getVolumeTier(vol) {
    if (vol >= 500000) return { label: 'ELITE', color: '#c084fc', icon: 'fa-crown' };
    if (vol >= 200000) return { label: 'HIGH', color: '#38bdf8', icon: 'fa-rocket' };
    if (vol >= 50000) return { label: 'MODERATE', color: '#2dd4bf', icon: 'fa-chart-line' };
    if (vol >= 10000) return { label: 'LOW-MID', color: '#fbbf24', icon: 'fa-chart-simple' };
    return { label: 'DORMANT', color: '#9ca3af', icon: 'fa-coffee' };
}

// render statistics (total symbols, avg total volume, max volume, top symbol)
function updateStatsPanel(dataArr) {
    if (!dataArr.length) {
        statsPanel.innerHTML = `<div class="stat-card">⚠️ No data available</div>`;
        return;
    }
    const totalSymbols = dataArr.length;
    const totalVolume = dataArr.reduce((acc, cur) => acc + cur.average_volume_20d, 0);
    const avgVolume = totalVolume / totalSymbols;
    const maxVolumeItem = dataArr.reduce((max, item) => item.average_volume_20d > max.average_volume_20d ? item : max, dataArr[0]);
    const minVolumeItem = dataArr.reduce((min, item) => item.average_volume_20d < min.average_volume_20d ? item : min, dataArr[0]);
    
    statsPanel.innerHTML = `
        <div class="stat-card">
            <div style="display: flex; align-items: center; gap: 8px;"><i class="fas fa-building" style="color:#38bdf8"></i> <span style="font-size:0.85rem; opacity:0.8;">Total Companies</span></div>
            <div style="font-size: 2rem; font-weight: 700;">${totalSymbols}</div>
        </div>
        <div class="stat-card">
            <div style="display: flex; align-items: center; gap: 8px;"><i class="fas fa-chart-line" style="color:#2dd4bf"></i> <span style="font-size:0.85rem; opacity:0.8;">Avg 20d Volume</span></div>
            <div style="font-size: 1.8rem; font-weight: 700;">${formatVolume(avgVolume)}</div>
            <div style="font-size:0.7rem;">across all symbols</div>
        </div>
        <div class="stat-card">
            <div style="display: flex; align-items: center; gap: 8px;"><i class="fas fa-crown" style="color:#fbbf24"></i> <span style="font-size:0.85rem; opacity:0.8;">Top Volume</span></div>
            <div style="font-size: 1.5rem; font-weight: 700;">${maxVolumeItem.symbol}</div>
            <div>${formatVolume(maxVolumeItem.average_volume_20d)}</div>
        </div>
        <div class="stat-card">
            <div style="display: flex; align-items: center; gap: 8px;"><i class="fas fa-arrow-trend-down" style="color:#9ca3af"></i> <span style="font-size:0.85rem; opacity:0.8;">Lowest Activity</span></div>
            <div style="font-size: 1.2rem; font-weight: 600;">${minVolumeItem.symbol}</div>
            <div>${formatVolume(minVolumeItem.average_volume_20d)}</div>
        </div>
    `;
}

// render table based on filteredData & sort
function renderTable() {
    if (!filteredData.length) {
        tableBody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 2.5rem;"><i class="fas fa-filter"></i> No matching symbols found</td></tr>`;
        recordsSpan.innerText = `0 records`;
        return;
    }

    // apply sorting (local)
    const sorted = [...filteredData];
    if (currentSort.column === 'symbol') {
        sorted.sort((a, b) => {
            let comp = a.symbol.localeCompare(b.symbol);
            return currentSort.order === 'asc' ? comp : -comp;
        });
    } else if (currentSort.column === 'volume') {
        sorted.sort((a, b) => {
            let comp = a.average_volume_20d - b.average_volume_20d;
            return currentSort.order === 'asc' ? comp : -comp;
        });
    }

    const rows = sorted.map(item => {
        const vol = item.average_volume_20d;
        const tier = getVolumeTier(vol);
        let activityText = '';
        if (vol >= 500000) activityText = '🚀 Hyperactive';
        else if (vol >= 150000) activityText = '🔥 Very High';
        else if (vol >= 50000) activityText = '📊 Active';
        else if (vol >= 10000) activityText = '📉 Moderate';
        else activityText = '💤 Low Liquidity';
        
        return `
            <tr>
                <td style="font-weight: 600; letter-spacing: -0.2px;">${item.symbol}</td>
                <td style="font-weight: 600; color: #caf0ff;">${formatVolume(vol)}</td>
                <td><span class="badge-volume" style="background: rgba(56,189,248,0.1);">${activityText}</span></td>
                <td><i class="fas ${tier.icon}" style="color: ${tier.color}; margin-right: 6px;"></i><span style="color:${tier.color};">${tier.label}</span></td>
            </tr>
        `;
    }).join('');
    tableBody.innerHTML = rows;
    recordsSpan.innerText = `${filteredData.length} / ${originalData.length} records`;
}

// update filter + re-render
function applyFilter() {
    const query = searchInput.value.trim().toUpperCase();
    if (!query) {
        filteredData = [...originalData];
    } else {
        filteredData = originalData.filter(item => item.symbol.toUpperCase().includes(query));
    }
    renderTable();
    // optional: keep chart unchanged (chart based on full dataset)
}

// initialize / update chart (top 15 by volume)
function updateChart(dataSet) {
    if (!dataSet.length) return;
    // take top 15 volumes for clean vis
    const chartData = [...dataSet].sort((a,b) => b.average_volume_20d - a.average_volume_20d).slice(0, 15);
    const labels = chartData.map(d => d.symbol);
    const volumes = chartData.map(d => d.average_volume_20d);
    
    if (volumeChart) {
        volumeChart.data.labels = labels;
        volumeChart.data.datasets[0].data = volumes;
        volumeChart.update();
    } else {
        const ctx = document.getElementById('volumeChart').getContext('2d');
        volumeChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: '20-day avg volume',
                    data: volumes,
                    backgroundColor: 'rgba(56, 189, 248, 0.7)',
                    borderRadius: 12,
                    borderSkipped: false,
                    barPercentage: 0.65,
                    categoryPercentage: 0.8,
                    hoverBackgroundColor: '#c084fc'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { labels: { color: '#e2e8f0', font: { weight: '500' } } },
                    tooltip: { callbacks: { label: (ctx) => `Volume: ${formatVolume(ctx.raw)}` } }
                },
                scales: {
                    y: { 
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: { color: '#b9c7e0', callback: (val) => formatVolume(val) }
                    },
                    x: { ticks: { color: '#b9c7e0', maxRotation: 35, minRotation: 30 } }
                }
            }
        });
    }
    chartUpdateSpan.innerHTML = `<i class="fas fa-chart-bar"></i> Top 15 by 20d volume | updated ${new Date().toLocaleTimeString()}`;
}

// set sort UI icons 
function updateSortIcons() {
    const symbolIconSpan = document.getElementById('sortSymbolIcon');
    const volIconSpan = document.getElementById('sortVolIcon');
    if (currentSort.column === 'symbol') {
        symbolIconSpan.innerHTML = currentSort.order === 'asc' ? ' ↑' : ' ↓';
        volIconSpan.innerHTML = '';
    } else if (currentSort.column === 'volume') {
        volIconSpan.innerHTML = currentSort.order === 'asc' ? ' ↑' : ' ↓';
        symbolIconSpan.innerHTML = '';
    } else {
        symbolIconSpan.innerHTML = '';
        volIconSpan.innerHTML = '';
    }
}

// handle sort click
function setupSorting() {
    const symbolTh = document.querySelector('[data-sort="symbol"]');
    const volumeTh = document.querySelector('[data-sort="volume"]');
    
    symbolTh.addEventListener('click', () => {
        if (currentSort.column === 'symbol') {
            currentSort.order = currentSort.order === 'asc' ? 'desc' : 'asc';
        } else {
            currentSort.column = 'symbol';
            currentSort.order = 'asc';
        }
        updateSortIcons();
        renderTable();
    });
    
    volumeTh.addEventListener('click', () => {
        if (currentSort.column === 'volume') {
            currentSort.order = currentSort.order === 'asc' ? 'desc' : 'asc';
        } else {
            currentSort.column = 'volume';
            currentSort.order = 'desc';   // default high volume first
        }
        updateSortIcons();
        renderTable();
    });
    updateSortIcons();
}

async function fetchVolumeData() {
    try {
        tableBody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 3rem;"><i class="fas fa-spinner fa-pulse"></i> Establishing connection to NEPSE technical API ...</td></tr>`;

        const url = 'https://nepse-hub-backend.vercel.app/api/indicators/volume?limit=500';
        const response = await fetch(url);

        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        const json = await response.json();
        if (!json.data || !Array.isArray(json.data)) throw new Error('Invalid API structure');
        
        // map raw data
        originalData = json.data.map(item => ({
            symbol: item.symbol,
            average_volume_20d: Number(item.avg_volume_20d) || 0
        })).filter(item => !isNaN(item.average_volume_20d));
        
        // remove zero? optional but keep all for transparency
        originalData.sort((a,b) => b.average_volume_20d - a.average_volume_20d);
        filteredData = [...originalData];
        
        // update UI
        updateStatsPanel(originalData);
        updateChart(originalData);
        applyFilter();       // triggers render + search reset
        setupSorting();
        
        // enable search event
        searchInput.addEventListener('input', () => applyFilter());
        
        // extra time indicator
        const timestamp = new Date().toLocaleString();
        chartUpdateSpan.innerHTML = `<i class="fas fa-check-circle"></i> Loaded ${originalData.length} symbols @ ${timestamp}`;
    } catch (err) {
        console.error(err);
        tableBody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 3rem;"><i class="fas fa-circle-exclamation" style="color:#f97316;"></i> Failed to fetch volume data. <br> ${err.message}<br> ⚠️ Make sure CORS/allowed or API reachable.</td></tr>`;
        statsPanel.innerHTML = `<div class="stat-card">⚠️ API error — please try again later</div>`;
        chartUpdateSpan.innerHTML = '⚠️ data unavailable';
    } finally {
        isLoading = false;
    }
}

// execute dashboard
fetchVolumeData();

// optional: auto-refresh every 2 minutes (market relevant)
let refreshInterval = setInterval(() => {
    if (!isLoading) {
        fetchVolumeData();
    }
}, 120000);  // 2 mins refresh keeps data fresh

// clear interval on page unload just in case
window.addEventListener('beforeunload', () => {
    if (refreshInterval) clearInterval(refreshInterval);
});