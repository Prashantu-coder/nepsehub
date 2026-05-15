import globalState from '../../state.js';
import { Layout } from '../../layout.js';
import DataService from '../../../services/dataService.js';

let currentPage = 1;
let totalPages = 1;
let currentStatus = 'all';

async function init() {
    globalState.setState({ activePage: 'ipo-tracker' });
    await Layout.init();

    // Initial fetch
    await fetchAndRenderIPOs();

    // Event Listeners for Filters
    const filterBtns = document.querySelectorAll('.tab-btn');
    filterBtns.forEach(btn => {
        btn.onclick = async () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentStatus = btn.dataset.status;
            currentPage = 1;
            await fetchAndRenderIPOs();
        };
    });

    // Pagination Listeners
    document.getElementById('prev-page').onclick = async () => {
        if (currentPage > 1) {
            currentPage--;
            await fetchAndRenderIPOs();
        }
    };

    document.getElementById('next-page').onclick = async () => {
        if (currentPage < totalPages) {
            currentPage++;
            await fetchAndRenderIPOs();
        }
    };
}

async function fetchAndRenderIPOs() {
    const container = document.getElementById('ipo-list');
    
    // Show loading
    container.innerHTML = `
        <div class="loading-placeholder" style="grid-column: 1/-1; text-align: center; padding: 4rem;">
            <i class="fas fa-spinner fa-spin" style="font-size: 2rem; color: var(--primary); margin-bottom: 1rem; display: block;"></i>
            <p>Updating IPO list...</p>
        </div>
    `;

    try {
        const rawItems = await DataService.getIPOs();
        
        if (!rawItems || rawItems.length === 0) {
            container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 4rem; color: var(--text-secondary);">No active IPOs found at the moment.</div>`;
            return;
        }

        // Handle filtering based on currentStatus
        let filteredItems = rawItems;
        if (currentStatus !== 'all') {
            filteredItems = rawItems.filter(item => {
                const status = (item.status || "").toLowerCase();
                if (currentStatus === 'open') return status === 'open';
                if (currentStatus === 'closed') return status === 'closed';
                if (currentStatus === 'ComingSoon') return status.includes('coming') || status.includes('soon');
                return true;
            });
        }

        renderCards(filteredItems);
        
        // Update Pagination Info (Static for now since API returns all)
        const pageInfo = document.getElementById('page-info');
        if (pageInfo) pageInfo.innerText = `Showing ${filteredItems.length} items`;
        
        const prevBtn = document.getElementById('prev-page');
        const nextBtn = document.getElementById('next-page');
        if (prevBtn) prevBtn.disabled = true;
        if (nextBtn) nextBtn.disabled = true;

    } catch (error) {
        console.error("IPO Render Error:", error);
        container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 4rem; color: var(--text-secondary);">Error connecting to IPO server.</div>`;
    }
}

function renderCards(items) {
    const container = document.getElementById('ipo-list');
    
    if (items.length === 0) {
        container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 4rem; color: var(--text-secondary);">No IPOs found for this category.</div>`;
        return;
    }

    container.innerHTML = items.map(item => {
        const name = item.name || item.companyName || item.securityName || 'Unknown Company';
        const symbol = item.symbol || item.scrip || 'N/A';
        const units = parseFloat(item.units || item.totalUnits || 0);
        const price = parseFloat(item.price || item.perUnit || 100);
        const amount = parseFloat(item.totalAmount || (units * price) || 0);
        const manager = item.issueManager || item.manager || 'N/A';
        const sector = item.sector || item.category || 'N/A';
        
        const openDateObj = item.openingDate ? new Date(item.openingDate) : null;
        const closeDateObj = item.closingDate ? new Date(item.closingDate) : null;
        const now = new Date();
        
        const openingDateStr = openDateObj ? openDateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'TBD';
        const closingDateStr = closeDateObj ? closeDateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'TBD';
        
        let statusLabel = 'Upcoming';
        let statusClass = 'status-upcoming';
        let btnText = 'Application Not Open';
        let btnClass = 'btn-disabled';
        let isApplyOpen = false;

        if (openDateObj && closeDateObj) {
            if (now >= openDateObj && now <= closeDateObj) {
                statusLabel = 'Open';
                statusClass = 'status-open';
                btnText = 'Apply via MeroShare';
                btnClass = 'btn-apply';
                isApplyOpen = true;
            } else if (now > closeDateObj) {
                statusLabel = 'Closed';
                statusClass = 'status-closed';
                btnText = 'Closed';
                btnClass = 'btn-disabled';
                isApplyOpen = false;
            } else if (now < openDateObj) {
                const diffTime = openDateObj - now;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                statusLabel = 'Coming Soon';
                statusClass = 'status-upcoming';
                btnText = `Open in ${diffDays} days`;
                btnClass = 'btn-disabled';
                isApplyOpen = false;
            }
        }

        return `
            <div class="ipo-card">
                <span class="ipo-status-badge ${statusClass}">${statusLabel}</span>
                
                <div class="ipo-header">
                    <div class="ipo-icon-wrap">
                        ${item.iconUrl 
                            ? `<img src="${item.iconUrl.startsWith('http') ? item.iconUrl : 'https://sharehubnepal.com/' + item.iconUrl}" class="ipo-icon" onerror="this.src='https://ui-avatars.com/api/?name=${symbol}&background=161b22&color=10b981&bold=true'">` 
                            : `<div class="ipo-icon"><i class="fas fa-building"></i></div>`
                        }
                    </div>
                    <div>
                        <div class="ipo-company-name">${name}</div>
                        <div class="ipo-symbol-info">${symbol} • ${sector}</div>
                    </div>
                </div>

                <div class="ipo-details-grid">
                    <div class="detail-item">
                        <span class="detail-label">Units</span>
                        <span class="detail-value">${units.toLocaleString()}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Price</span>
                        <span class="detail-value">Rs. ${price}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Issue Manager</span>
                        <span class="detail-value" style="font-size: 0.7rem; line-height: 1.2;">${manager}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Total Amount</span>
                        <span class="detail-value">Rs. ${(amount / 10000000).toFixed(2)} Cr</span>
                    </div>
                </div>

                <div class="ipo-dates-row">
                    <div class="date-box">
                        <span class="date-label">Opens</span>
                        <span class="date-value">${openingDateStr}</span>
                    </div>
                    <span class="date-sep"><i class="fas fa-chevron-right"></i></span>
                    <div class="date-box" style="text-align: right;">
                        <span class="date-label">Closes</span>
                        <span class="date-value">${closingDateStr}</span>
                    </div>
                </div>

                <button class="ipo-btn ${btnClass}" 
                        onclick="window.open('https://meroshare.cdsc.com.np', '_blank')" 
                        ${!isApplyOpen ? 'disabled' : ''}>
                    <i class="fas ${isApplyOpen ? 'fa-external-link-alt' : 'fa-lock'}"></i>
                    ${btnText}
                </button>
            </div>
        `;
    }).join('');
}

function updatePaginationControls(data) {
    document.getElementById('prev-page').disabled = currentPage === 1;
    document.getElementById('next-page').disabled = currentPage === totalPages;
    document.getElementById('page-info').innerText = `Page ${currentPage} of ${totalPages}`;
}

document.addEventListener('DOMContentLoaded', init);
