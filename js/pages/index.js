import globalState from '../state.js';
import { Layout } from '../layout.js';
import DataService from '../../services/dataService.js';

let marketData = [];
let marketSummary = null;

async function init() {
    globalState.setState({ activePage: 'index' });
    await Layout.init();
    
    await refresh();
    setInterval(refresh, 60000); // Refresh every minute
}

async function refresh() {
    try {
        // Fetch both in parallel
        const [liveData, summary] = await Promise.all([
            DataService.getLiveMarket(),
            DataService.getMarketSummary()
        ]);
        
        marketData = liveData;
        marketSummary = summary;
        render();
    } catch (error) {
        console.error('Error refreshing dashboard:', error);
    }
}

function render() {
    // 0. Update Pulse Cards using official summary if available
    // (Move this before the empty check so pulse cards update even if table data is empty)
    let totalTurnover = 0;
    let totalVolume = 0;
    let scripCount = marketData.length;
    let adv = 0, dec = 0, unc = 0;

    // We still need to calculate adv/dec/unc from marketData
    marketData.forEach(s => {
        const cp = parseFloat(s.changePercent) || 0;
        if (cp > 0) adv++;
        else if (cp < 0) dec++;
        else unc++;
    });

    if (marketSummary) {
        // Handle nested TMS structure: totalTurnover -> totalTradedValue
        const ts = marketSummary.totalTurnover || marketSummary;
        
        totalTurnover = parseFloat(ts.totalTradedValue || ts.tradedValue || ts.tradedvalue || ts.turnover) || 0;
        totalVolume = parseFloat(ts.totalTradedQuantity || ts.tradedQuantity || ts.tradedquantity || ts.volume) || 0;
        scripCount = parseInt(ts.scripCount || ts.scripcount) || scripCount;
    } else {
        // Fallback calculation
        marketData.forEach(s => {
            totalTurnover += (parseFloat(s.turnover) || 0);
            totalVolume += (parseFloat(s.volume) || 0);
        });
    }

    const sentimentEl = document.getElementById('pulse-sentiment');
    const turnoverEl = document.getElementById('pulse-turnover');
    const volumeEl = document.getElementById('pulse-volume');
    const companiesEl = document.getElementById('pulse-companies');

    if (sentimentEl) {
        sentimentEl.innerHTML = `
            <span class="price-up">${adv}</span> / 
            <span class="price-down">${dec}</span> / 
            <span style="color:var(--text-secondary)">${unc}</span>
        `;
    }
    if (turnoverEl) turnoverEl.innerText = `Rs. ${formatCurrency(totalTurnover)}`;
    if (volumeEl) volumeEl.innerText = totalVolume.toLocaleString();
    if (companiesEl) companiesEl.innerText = scripCount;
    
    // Check for table data
    if (!marketData || marketData.length === 0) return;

    // 1. Top Gainers (Sorted by changePercent DESC)
    const gainers = [...marketData]
        .sort((a, b) => b.changePercent - a.changePercent)
        .slice(0, 10);
    renderMiniTable('top-gainers-body', gainers, 'changePercent');

    // 2. Top Losers (Sorted by changePercent ASC)
    const losers = [...marketData]
        .sort((a, b) => a.changePercent - b.changePercent)
        .slice(0, 10);
    renderMiniTable('top-losers-body', losers, 'changePercent');

    // 3. Top Turnover (Sorted by Turnover DESC)
    const turnover = [...marketData]
        .sort((a, b) => (parseFloat(b.turnover) || 0) - (parseFloat(a.turnover) || 0))
        .slice(0, 10);
    renderMiniTable('top-turnover-body', turnover, 'turnover');

    // 4. Top Volume (Sorted by volume DESC)
    const volume = [...marketData]
        .sort((a, b) => b.volume - a.volume)
        .slice(0, 10);
    renderMiniTable('top-volume-body', volume, 'volume');
}

function renderMiniTable(containerId, data, type) {
    const tbody = document.getElementById(containerId);
    if (!tbody) return;

    tbody.innerHTML = data.map(stock => {
        let valueHtml = '';
        if (type === 'changePercent') {
            const isUp = stock.changePercent >= 0;
            valueHtml = `<span class="${isUp ? 'price-up' : 'price-down'}">${isUp ? '+' : ''}${stock.changePercent.toFixed(2)}%</span>`;
        } else if (type === 'turnover') {
            valueHtml = `<span>${formatCurrency(stock.turnover)}</span>`;
        } else if (type === 'volume') {
            valueHtml = `<span>${stock.volume.toLocaleString()}</span>`;
        }

        return `
            <tr>
                <td class="symbol-cell" style="cursor:pointer;" onclick="window.location.href='/pages/market/details.html?symbol=${stock.symbol}'">${stock.symbol}</td>
                <td class="price-cell">${stock.price.toFixed(2)}</td>
                <td>${valueHtml}</td>
            </tr>
        `;
    }).join('');
}

function formatCurrency(val) {
    if (val >= 10000000) return (val / 10000000).toFixed(2) + ' Cr';
    if (val >= 100000) return (val / 100000).toFixed(2) + ' L';
    return val.toLocaleString();
}

document.addEventListener('DOMContentLoaded', init);
