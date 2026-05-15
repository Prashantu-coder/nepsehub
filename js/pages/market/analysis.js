import globalState from '../../state.js';
import { Layout } from '../../layout.js';
import AnalyticsService from '../../../services/analyticsService.js';

let processedData = null;
let currentMoversType = 'gainers';
let sentimentChart = null;

async function init() {
    console.log("Market Analysis Page Init...");
    globalState.setState({ activePage: 'market-analysis' });
    
    try {
        await Layout.init();
        console.log("Layout initialized");
    } catch (e) {
        console.error("Layout init failed", e);
    }

    await refreshData();
    setInterval(refreshData, 30000); // Auto-refresh every 30s

    // Event Listeners for Movers Tabs
    const tabBtns = document.querySelectorAll('.mover-tab-btn');
    tabBtns.forEach(btn => {
        btn.onclick = () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentMoversType = btn.dataset.type;
            renderMovers();
        };
    });
}

async function refreshData() {
    console.log("Fetching market analysis data via AnalyticsService...");
    const container = document.getElementById('movers-list');
    
    try {
        const data = await AnalyticsService.getProcessedMarketData();
        
        if (!data) {
            if (container) {
                container.innerHTML = `
                    <div style="text-align: center; padding: 3rem; color: var(--text-secondary);">
                        <i class="fas fa-exclamation-circle" style="font-size: 2rem; margin-bottom: 1rem; display: block;"></i>
                        <p>Market data is currently unavailable.<br><small>The API might be waking up (Render cold start). Please wait 30 seconds.</small></p>
                    </div>
                `;
            }
            return;
        }
        
        processedData = data;
        updateSentiment();
        renderMovers();
    } catch (error) {
        console.error("Failed to refresh analysis data:", error);
        if (container) {
            container.innerHTML = `
                <div style="text-align: center; padding: 3rem; color: #f43f5e;">
                    <i class="fas fa-wifi-slash" style="font-size: 2rem; margin-bottom: 1rem; display: block;"></i>
                    <p>Connection Error. Could not reach the market server.</p>
                </div>
            `;
        }
    }
}

function updateSentiment() {
    const { adv, dec, unc } = processedData.sentiment;

    // Update Text Stats
    document.getElementById('count-adv').innerText = adv;
    document.getElementById('count-dec').innerText = dec;
    document.getElementById('count-unc').innerText = unc;

    renderSentimentGauge(adv, dec, unc);
}

function renderSentimentGauge(adv, dec, unc) {
    const ctx = document.getElementById('sentimentGauge');
    if (!ctx) return;

    if (typeof Chart === 'undefined') {
        console.error("Chart.js not loaded!");
        ctx.parentElement.innerHTML = '<p style="color:var(--text-secondary);font-size:0.8rem;">Chart library failed to load.</p>';
        return;
    }

    if (sentimentChart) {
        sentimentChart.data.datasets[0].data = [adv, dec, unc];
        sentimentChart.update();
        return;
    }

    sentimentChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Advancing', 'Declining', 'Unchanged'],
            datasets: [{
                data: [adv, dec, unc],
                backgroundColor: ['#10b981', '#f43f5e', '#334155'],
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            rotation: -90,
            circumference: 180,
            cutout: '75%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    enabled: true,
                    callbacks: {
                        label: (context) => `${context.label}: ${context.raw}`
                    }
                }
            }
        }
    });
}

function renderMovers() {
    const container = document.getElementById('movers-list');
    if (!container || !processedData) return;

    let items = [];
    if (currentMoversType === 'gainers') items = processedData.movers.gainers;
    else if (currentMoversType === 'losers') items = processedData.movers.losers;
    else if (currentMoversType === 'volume') items = processedData.movers.active;

    container.innerHTML = items.map(item => {
        const change = parseFloat(item.changePercent);
        const changeClass = change >= 0 ? 'price-up' : 'price-down';
        const displayVal = currentMoversType === 'volume' 
            ? `<div class="mover-price" style="color:var(--text-secondary); font-size:0.8rem;">Vol: ${(parseFloat(item.volume) || 0).toLocaleString()}</div>`
            : `<div class="mover-price">Rs. ${(parseFloat(item.price) || 0).toLocaleString()}</div>`;

        return `
            <div class="mover-item">
                <div class="mover-symbol">${item.symbol}</div>
                <div class="mover-name">${item.name || item.securityName || ''}</div>
                ${displayVal}
                <div class="mover-change ${changeClass}">${change >= 0 ? '+' : ''}${change.toFixed(2)}%</div>
            </div>
        `;
    }).join('');
}

document.addEventListener('DOMContentLoaded', init);
