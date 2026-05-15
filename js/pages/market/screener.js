import globalState from '../../state.js';
import { Layout } from '../../layout.js';
import DataService from '../../../services/dataService.js';

let currentFilter = 'macd';

async function init() {
    globalState.setState({ activePage: 'screener' });
    await Layout.init();

    // Tab Listeners
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.onclick = async () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.type;
            await loadSignals();
        };
    });

    // Initial Load
    await loadSignals();
}

async function loadSignals() {
    const container = document.getElementById('screener-content');
    container.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 4rem;">
            <i class="fas fa-spinner fa-spin" style="font-size: 2.5rem; color: var(--primary); margin-bottom: 1rem;"></i>
            <p style="color: var(--text-secondary);">Scanning market for ${currentFilter.toUpperCase()} signals...</p>
        </div>
    `;

    try {
        let data = [];
        if (currentFilter === 'macd') data = await DataService.getTechnicalMACD().catch(() => []);
        else if (currentFilter === 'rsi') data = await DataService.getTechnicalRSI().catch(() => []);
        else if (currentFilter === 'bollinger') data = await DataService.getTechnicalBollinger().catch(() => []);

        renderSignals(data || []);
    } catch (error) {
        console.warn("Screener logic on standby:", error);
        container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-secondary); padding: 4rem;">Technical analysis engine is currently being updated.</div>`;
    }
}

function renderSignals(data) {
    const container = document.getElementById('screener-content');
    
    if (!data || data.length === 0) {
        container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-secondary); padding: 4rem;">No significant signals detected at the moment.</div>`;
        return;
    }

    container.innerHTML = data.map(item => {
        let badgeClass = 'badge-neutral';
        let statusText = 'Neutral';
        const trend = (item.trend || item.signal || '').toLowerCase();

        if (trend.includes('bull') || trend.includes('buy') || trend.includes('up')) {
            badgeClass = 'badge-bullish';
            statusText = 'Bullish';
        } else if (trend.includes('bear') || trend.includes('sell') || trend.includes('down')) {
            badgeClass = 'badge-bearish';
            statusText = 'Bearish';
        }

        return `
            <div class="glass signal-card">
                <div class="signal-header">
                    <div>
                        <div style="font-weight: 800; font-size: 1.25rem;">${item.symbol}</div>
                        <div style="font-size: 0.75rem; color: var(--text-secondary);">${item.name || ''}</div>
                    </div>
                    <span class="signal-badge ${badgeClass}">${statusText}</span>
                </div>

                <div class="metric-row">
                    <span class="metric-label">Last Price</span>
                    <span class="metric-value">Rs. ${item.price || item.ltp || 'N/A'}</span>
                </div>

                ${renderTechnicalDetails(item)}

                <div style="margin-top: 1.5rem;">
                    <button class="btn btn-outline" style="width: 100%; font-size: 0.8rem;" 
                            onclick="window.location.href='../trade/planner.html?symbol=${item.symbol}'">
                        <i class="fas fa-drafting-compass"></i> Plan Trade
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function renderTechnicalDetails(item) {
    if (currentFilter === 'macd') {
        return `
            <div class="metric-row">
                <span class="metric-label">MACD Line</span>
                <span class="metric-value">${parseFloat(item.macd || 0).toFixed(2)}</span>
            </div>
            <div class="metric-row">
                <span class="metric-label">Signal Line</span>
                <span class="metric-value">${parseFloat(item.signalLine || 0).toFixed(2)}</span>
            </div>
            <div class="metric-row">
                <span class="metric-label">Histogram</span>
                <span class="metric-value" style="color: ${item.histogram >= 0 ? 'var(--secondary)' : 'var(--danger)'}">
                    ${parseFloat(item.histogram || 0).toFixed(2)}
                </span>
            </div>
        `;
    } else if (currentFilter === 'rsi') {
        const rsi = parseFloat(item.rsi || 0);
        return `
            <div class="metric-row">
                <span class="metric-label">RSI Value</span>
                <span class="metric-value" style="color: ${rsi <= 30 ? 'var(--secondary)' : rsi >= 70 ? 'var(--danger)' : 'inherit'}">
                    ${rsi.toFixed(2)}
                </span>
            </div>
            <div class="metric-row">
                <span class="metric-label">Condition</span>
                <span class="metric-value">${item.condition || (rsi <= 30 ? 'Oversold' : rsi >= 70 ? 'Overbought' : 'Neutral')}</span>
            </div>
        `;
    } else if (currentFilter === 'bollinger') {
        return `
            <div class="metric-row">
                <span class="metric-label">Upper Band</span>
                <span class="metric-value">${parseFloat(item.upperBand || 0).toFixed(2)}</span>
            </div>
            <div class="metric-row">
                <span class="metric-label">Lower Band</span>
                <span class="metric-value">${parseFloat(item.lowerBand || 0).toFixed(2)}</span>
            </div>
            <div class="metric-row">
                <span class="metric-label">Width</span>
                <span class="metric-value">${parseFloat(item.bandWidth || 0).toFixed(2)}%</span>
            </div>
        `;
    }
    return '';
}

document.addEventListener('DOMContentLoaded', init);
