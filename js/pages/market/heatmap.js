import globalState from '../../state.js';
import { Layout } from '../../layout.js';
import DataService from '../../../services/dataService.js';

let marketData = [];
let selectedSector = 'all';

const SECTOR_COLORS = {
    'Banking':            '#0e7490',
    'Development Bank':   '#1e6a5a',
    'Finance':            '#4338ca',
    'Hotels And Tourism': '#b45309',
    'HydroPower':         '#0369a1',
    'Hydropower':         '#0369a1',
    'Investment':         '#7e22ce',
    'Life Insurance':     '#0f766e',
    'Manufacturing And Processing': '#9a3412',
    'Manu.& Pro.':        '#9a3412',
    'Microfinance':       '#86198f',
    'Mutual Fund':        '#475569',
    'Non Life Insurance': '#0e7490',
    'Others':             '#57534e',
    'Trading':            '#a16207',
    'Other':              '#57534e',
    'Commercial Banks':   '#1d4ed8'
};

// ─────────────────────────────────────────────
// COLOR: % change → HSL
// ─────────────────────────────────────────────
function getHeatColor(pct) {
    if (Math.abs(pct) < 0.01) return '#1f2937';

    if (pct > 0) {
        const t = Math.min(pct / 6, 1);
        const s = 50 + t * 30;
        const l = 18 + t * 20;
        return `hsl(150, ${s}%, ${l}%)`;
    } else {
        const t = Math.min(Math.abs(pct) / 6, 1);
        const s = 50 + t * 30;
        const l = 18 + t * 20;
        return `hsl(0, ${s}%, ${l}%)`;
    }
}

// ─────────────────────────────────────────────
// SQUARIFIED TREEMAP ALGORITHM
// ─────────────────────────────────────────────
function treemapLayout(items, rect) {
    if (items.length === 0) return [];

    const validItems = items.filter(i => i.value > 0);
    if (validItems.length === 0) return [];

    const total = validItems.reduce((s, i) => s + i.value, 0);
    const area = rect.w * rect.h;

    // Normalize values to represent absolute area in pixels
    validItems.forEach(i => i.area = (i.value / total) * area);

    // Sort descending
    const sorted = validItems.sort((a, b) => b.area - a.area);

    squarify(sorted, [], rect);
    return sorted;
}

function squarify(children, row, rect) {
    if (children.length === 0) {
        if (row.length > 0) layoutRow(row, rect);
        return;
    }

    const c = children[0];
    const newRow = [...row, c];

    // Check if adding the new item improves the aspect ratio
    if (row.length === 0 || worstRatio(newRow, rect) <= worstRatio(row, rect)) {
        squarify(children.slice(1), newRow, rect);
    } else {
        // Lay out current row and recurse on remaining children with remaining space
        const remaining = layoutRow(row, rect);
        squarify(children, [], remaining);
    }
}

function worstRatio(row, rect) {
    const sumArea = row.reduce((s, i) => s + i.area, 0);
    if (sumArea === 0) return Infinity;

    const side = Math.min(rect.w, rect.h);
    if (side === 0) return Infinity;

    const side2 = side * side;
    const sum2 = sumArea * sumArea;

    let maxArea = 0;
    let minArea = Infinity;
    for (const item of row) {
        if (item.area > maxArea) maxArea = item.area;
        if (item.area < minArea) minArea = item.area;
    }

    return Math.max((side2 * maxArea) / sum2, sum2 / (side2 * minArea));
}

function layoutRow(row, rect) {
    const sumArea = row.reduce((s, i) => s + i.area, 0);
    const isWide = rect.w >= rect.h;

    if (isWide) {
        // Lay out vertically along the left edge
        const rowWidth = sumArea / rect.h;
        let cy = rect.y;
        for (let i = 0; i < row.length; i++) {
            const h = (i === row.length - 1) ? Math.max(0, rect.y + rect.h - cy) : (row[i].area / rowWidth);
            row[i].rect = { x: rect.x, y: cy, w: rowWidth, h: h };
            cy += h;
        }
        return { x: rect.x + rowWidth, y: rect.y, w: Math.max(0, rect.w - rowWidth), h: rect.h };
    } else {
        // Lay out horizontally along the top edge
        const rowHeight = sumArea / rect.w;
        let cx = rect.x;
        for (let i = 0; i < row.length; i++) {
            const w = (i === row.length - 1) ? Math.max(0, rect.x + rect.w - cx) : (row[i].area / rowHeight);
            row[i].rect = { x: cx, y: rect.y, w: w, h: rowHeight };
            cx += w;
        }
        return { x: rect.x, y: rect.y + rowHeight, w: rect.w, h: Math.max(0, rect.h - rowHeight) };
    }
}

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
async function init() {
    globalState.setState({ activePage: 'heatmap' });
    await Layout.init();

    createTooltip();

    document.getElementById('sector-filter').onchange = (e) => {
        selectedSector = e.target.value;
        render();
    };

    await refresh();
    setInterval(refresh, 60000);
}

async function refresh() {
    try {
        marketData = await DataService.getLiveMarket();
        populateSectorDropdown();
        render();
    } catch (err) {
        console.error('Heatmap error:', err);
    }
}

function populateSectorDropdown() {
    const dd = document.getElementById('sector-filter');
    if (!dd) return;

    const sectors = new Set();
    marketData.forEach(s => sectors.add(s.sector || 'Other'));

    const sorted = [...sectors].sort();
    const current = dd.value;

    dd.innerHTML = '<option value="all">All Sectors</option>' +
        sorted.map(s => `<option value="${s}" ${s === current ? 'selected' : ''}>${s}</option>`).join('');
}

// ─────────────────────────────────────────────
// RENDER
// ─────────────────────────────────────────────
function render() {
    const wrapper = document.getElementById('treemap-wrapper');
    const loading = document.getElementById('heatmap-loading');
    if (!wrapper) return;

    if (!marketData || marketData.length === 0) {
        if (loading) loading.classList.remove('hidden');
        return;
    }
    if (loading) loading.classList.add('hidden');

    const active = marketData.filter(s => (s.turnover || 0) > 0);

    // Filter by sector if selected
    let filtered = active;
    if (selectedSector !== 'all') {
        filtered = active.filter(s => (s.sector || 'Other') === selectedSector);
    }

    const containerW = wrapper.offsetWidth;
    const containerH = wrapper.offsetHeight;
    const HEADER_H = 20;

    if (selectedSector !== 'all') {
        // Single sector: lay out stocks directly
        const stocks = [...filtered].sort((a, b) => (b.turnover || 0) - (a.turnover || 0));
        const sectorName = selectedSector;
        const sectorColor = SECTOR_COLORS[sectorName] || '#374151';
        const totalTO = stocks.reduce((s, st) => s + (st.turnover || 0), 0);
        const avgChange = stocks.length > 0 ? (stocks.reduce((s, st) => s + (st.changePercent || 0), 0) / stocks.length) : 0;
        const toPct = totalTO > 0 ? '100.00' : '0.00';

        const stockItems = stocks.map(st => ({ ...st, value: st.turnover || 1 }));
        const stockRect = { x: 0, y: HEADER_H, w: containerW, h: containerH - HEADER_H };
        treemapLayout(stockItems, stockRect);

        let html = `
            <div class="tm-sector" style="left:0;top:0;width:${containerW}px;height:${containerH}px;">
                <div class="tm-sector-header" style="background:${sectorColor};">
                    <span class="sh-name">${sectorName.toUpperCase()}</span>
                    <span class="sh-stats">| ${avgChange >= 0 ? '+' : ''}${avgChange.toFixed(2)}% | ${toPct}% | ${stocks.length} stocks</span>
                </div>
                ${renderStockBlocks(stockItems)}
            </div>
        `;

        wrapper.innerHTML = html;
        bindEvents();
        return;
    }

    // Group by sector
    const sectors = {};
    filtered.forEach(s => {
        const sec = s.sector || 'Other';
        if (!sectors[sec]) sectors[sec] = [];
        sectors[sec].push(s);
    });

    const grandTotalTO = filtered.reduce((s, st) => s + (st.turnover || 0), 0);

    const sectorItems = Object.entries(sectors)
        .map(([name, stocks]) => {
            const sectorTO = stocks.reduce((s, st) => s + (st.turnover || 0), 0);
            return { name, stocks, value: sectorTO, turnover: sectorTO };
        })
        .filter(s => s.value > 0)
        .sort((a, b) => b.value - a.value);

    // Layout sectors
    const sectorRect = { x: 0, y: 0, w: containerW, h: containerH };
    treemapLayout(sectorItems, sectorRect);

    let html = '';

    sectorItems.forEach(sector => {
        const r = sector.rect;
        if (!r || r.w < 2 || r.h < 2) return;

        const color = SECTOR_COLORS[sector.name] || '#374151';
        const avgChange = sector.stocks.length > 0
            ? (sector.stocks.reduce((s, st) => s + (st.changePercent || 0), 0) / sector.stocks.length)
            : 0;
        const toPct = grandTotalTO > 0 ? ((sector.turnover / grandTotalTO) * 100).toFixed(2) : '0.00';

        // Layout stocks within this sector
        const stockItems = sector.stocks
            .sort((a, b) => (b.turnover || 0) - (a.turnover || 0))
            .map(st => ({ ...st, value: st.turnover || 1 }));

        const innerH = Math.max(r.h - HEADER_H, 0);
        const stockRect = { x: 0, y: HEADER_H, w: r.w, h: innerH };
        treemapLayout(stockItems, stockRect);

        html += `
            <div class="tm-sector" style="left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;">
                <div class="tm-sector-header" style="background:${color};">
                    <span class="sh-name">${sector.name.toUpperCase()}</span>
                    <span class="sh-stats">| ${avgChange >= 0 ? '+' : ''}${avgChange.toFixed(2)}% | ${toPct}% | ${sector.stocks.length} stocks</span>
                </div>
                ${renderStockBlocks(stockItems)}
            </div>
        `;
    });

    wrapper.innerHTML = html;
    bindEvents();
}

// ─────────────────────────────────────────────
// RENDER STOCK BLOCKS
// ─────────────────────────────────────────────
function renderStockBlocks(items) {
    return items.map(item => {
        const r = item.rect;
        if (!r || r.w < 3 || r.h < 3) return '';

        const pct = item.changePercent || 0;
        const bg = getHeatColor(pct);

        // Determine font sizes based on block area
        const area = r.w * r.h;
        let symSize = '0.7rem';
        let chgSize = '0.6rem';
        let showChange = true;

        if (area > 20000) { symSize = '1rem'; chgSize = '0.8rem'; }
        else if (area > 10000) { symSize = '0.85rem'; chgSize = '0.7rem'; }
        else if (area > 4000) { symSize = '0.72rem'; chgSize = '0.6rem'; }
        else if (area > 1500) { symSize = '0.6rem'; chgSize = '0.5rem'; }
        else if (area > 500) { symSize = '0.5rem'; chgSize = '0'; showChange = false; }
        else { symSize = '0.4rem'; showChange = false; }

        // Hide text if block is too small
        if (r.w < 25 || r.h < 18) {
            return `<div class="tm-block" style="left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;background:${bg};"
                data-symbol="${item.symbol}" data-name="${item.name || item.symbol}"
                data-price="${item.price}" data-change="${pct}"
                data-turnover="${item.turnover || 0}" data-volume="${item.volume || 0}"
                data-sector="${item.sector || ''}" data-high="${item.high || 0}" data-low="${item.low || 0}"></div>`;
        }

        const arrow = pct >= 0 ? '▲' : '▼';

        return `
            <div class="tm-block" style="left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;background:${bg};"
                 data-symbol="${item.symbol}" data-name="${item.name || item.symbol}"
                 data-price="${item.price}" data-change="${pct}"
                 data-turnover="${item.turnover || 0}" data-volume="${item.volume || 0}"
                 data-sector="${item.sector || ''}" data-high="${item.high || 0}" data-low="${item.low || 0}">
                <span class="bk-symbol" style="font-size:${symSize};">${item.symbol}</span>
                ${showChange ? `<span class="bk-change" style="font-size:${chgSize};">${arrow} ${Math.abs(pct).toFixed(2)}%</span>` : ''}
            </div>
        `;
    }).join('');
}

// ─────────────────────────────────────────────
// TOOLTIP
// ─────────────────────────────────────────────
function createTooltip() {
    if (document.getElementById('hm-tooltip')) return;
    const tt = document.createElement('div');
    tt.id = 'hm-tooltip';
    tt.className = 'hm-tooltip';
    document.body.appendChild(tt);
}

function showTooltip(block) {
    const tt = document.getElementById('hm-tooltip');
    if (!tt) return;

    const sym = block.dataset.symbol;
    const name = block.dataset.name;
    const price = parseFloat(block.dataset.price);
    const change = parseFloat(block.dataset.change);
    const turnover = parseFloat(block.dataset.turnover);
    const volume = parseFloat(block.dataset.volume);
    const sector = block.dataset.sector;
    const high = parseFloat(block.dataset.high);
    const low = parseFloat(block.dataset.low);
    const isUp = change >= 0;

    tt.innerHTML = `
        <div class="tt-symbol">${sym}</div>
        <div class="tt-name">${name} · ${sector}</div>
        <div class="tt-row"><span class="tt-label">LTP</span><span class="tt-val">Rs. ${price.toLocaleString()}</span></div>
        <div class="tt-row"><span class="tt-label">Change</span><span class="tt-val ${isUp ? 'price-up' : 'price-down'}">${isUp ? '+' : ''}${change.toFixed(2)}%</span></div>
        <div class="tt-row"><span class="tt-label">Turnover</span><span class="tt-val">${fmtCur(turnover)}</span></div>
        <div class="tt-row"><span class="tt-label">Volume</span><span class="tt-val">${volume.toLocaleString()}</span></div>
        <div class="tt-row"><span class="tt-label">High / Low</span><span class="tt-val">${high.toLocaleString()} / ${low.toLocaleString()}</span></div>
    `;

    const rect = block.getBoundingClientRect();
    let left = rect.right + 8;
    let top = rect.top;
    if (left + 230 > window.innerWidth) left = rect.left - 230;
    if (top + 190 > window.innerHeight) top = window.innerHeight - 200;
    if (top < 0) top = 5;

    tt.style.left = left + 'px';
    tt.style.top = top + 'px';
    tt.classList.add('visible');
}

function hideTooltip() {
    const tt = document.getElementById('hm-tooltip');
    if (tt) tt.classList.remove('visible');
}

// ─────────────────────────────────────────────
// EVENTS
// ─────────────────────────────────────────────
function bindEvents() {
    document.querySelectorAll('.tm-block').forEach(block => {
        block.addEventListener('mouseenter', () => showTooltip(block));
        block.addEventListener('mouseleave', hideTooltip);
        block.addEventListener('click', () => {
            hideTooltip();
            if (window.showSymbolDetails) window.showSymbolDetails(block.dataset.symbol);
        });
    });
}

// ─────────────────────────────────────────────
// RESIZE
// ─────────────────────────────────────────────
let resizeTimer;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(render, 200);
});

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
function fmtCur(val) {
    if (val >= 10000000) return (val / 10000000).toFixed(2) + ' Cr';
    if (val >= 100000) return (val / 100000).toFixed(2) + ' L';
    return val.toLocaleString();
}

document.addEventListener('DOMContentLoaded', init);
