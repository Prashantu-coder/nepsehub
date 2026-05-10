import globalState from '../state.js';
import { Layout } from '../layout.js';
import { StockCard } from '../../components/stockCard.js';
import { initStockChart } from '../../components/chart.js';
import DataService from '../../services/dataService.js';

async function init() {
    globalState.setState({ activePage: 'index' });
    await Layout.init();
    
    fetchDashboardData();
    // Refresh every minute on home page
    setInterval(fetchDashboardData, 60000);
}

async function fetchDashboardData() {
    const stocks = await DataService.getLiveMarket();
    if (stocks && stocks.length > 0) {
        renderDashboard(stocks);
        renderSectorPerformance(stocks);
    }
}

function renderSectorPerformance(stocks) {
    const sectorGrid = document.getElementById('sector-grid');
    if (!sectorGrid) return;

    const sectors = {};
    stocks.forEach(s => {
        if (!s.sector) return;
        if (!sectors[s.sector]) sectors[s.sector] = { totalChange: 0, count: 0 };
        sectors[s.sector].totalChange += parseFloat(s.percentageChange) || 0;
        sectors[s.sector].count++;
    });

    const performance = Object.entries(sectors).map(([name, data]) => ({
        name,
        avgChange: (data.totalChange / data.count).toFixed(2)
    })).sort((a, b) => b.avgChange - a.avgChange);

    // Show top 6 sectors
    sectorGrid.innerHTML = performance.slice(0, 6).map(s => `
        <div>
            <div style="color: var(--text-secondary); font-size: 0.8rem;">${s.name}</div>
            <div class="${s.avgChange >= 0 ? 'price-up' : 'price-down'}" style="font-weight: 700; font-size: 1.2rem;">
                ${s.avgChange > 0 ? '+' : ''}${s.avgChange}%
            </div>
        </div>
    `).join('');
}

function renderDashboard(stocks) {
    const grid = document.getElementById('dashboard-grid');
    if (!grid) return;

    // Highlight top 4 gainers
    const topGainers = [...stocks]
        .sort((a, b) => parseFloat(b.percentageChange) - parseFloat(a.percentageChange))
        .slice(0, 4);

    grid.innerHTML = topGainers.map(stock => StockCard(stock)).join('');
    
    topGainers.forEach(stock => {
        // Check for history, fallback to [LTP, LTP] for flat line if missing
        const history = stock.history || [parseFloat(stock.previousClose), parseFloat(stock.lastTradedPrice)];
        initStockChart(`chart-${stock.symbol}`, history, parseFloat(stock.percentageChange) >= 0);
    });
}

document.addEventListener('DOMContentLoaded', init);
