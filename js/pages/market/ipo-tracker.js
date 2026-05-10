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
    
    // Show loading if not already shown
    if (!container.querySelector('.loading-placeholder')) {
        container.innerHTML = `
            <div class="loading-placeholder" style="grid-column: 1/-1; text-align: center; padding: 4rem;">
                <i class="fas fa-spinner fa-spin" style="font-size: 2rem; color: var(--primary); margin-bottom: 1rem; display: block;"></i>
                <p>Updating IPO list...</p>
            </div>
        `;
    }

    const data = await DataService.getIPOData(currentPage);
    
    if (!data || !data.content) {
        container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 4rem; color: var(--text-secondary);">Failed to load IPO data. Please try again later.</div>`;
        return;
    }

    totalPages = data.totalPages;
    let items = data.content;

    // Client-side filtering for status if needed (though API might support it, we'll do it here for now if status isn't 'all')
    if (currentStatus !== 'all') {
        items = items.filter(item => item.status === currentStatus);
    }

    renderCards(items);
    updatePaginationControls(data);
}

function renderCards(items) {
    const container = document.getElementById('ipo-list');
    
    if (items.length === 0) {
        container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 4rem; color: var(--text-secondary);">No IPOs found for this category.</div>`;
        return;
    }

    container.innerHTML = items.map(item => {
        const openingDate = item.openingDate ? new Date(item.openingDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'TBD';
        const closingDate = item.closingDate ? new Date(item.closingDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'TBD';
        
        const statusClass = `status-${item.status.toLowerCase()}`;
        const statusLabel = item.status === 'ComingSoon' ? 'Coming Soon' : item.status;

        return `
            <div class="ipo-card">
                <span class="ipo-status-badge ${statusClass}">${statusLabel}</span>
                
                <div class="ipo-header">
                    <div class="ipo-icon-wrap">
                        ${item.iconUrl 
                            ? `<img src="https://sharehubnepal.com/${item.iconUrl}" class="ipo-icon" onerror="this.src='https://ui-avatars.com/api/?name=${item.symbol}&background=161b22&color=10b981&bold=true'">` 
                            : `<div class="ipo-icon"><i class="fas fa-building"></i></div>`
                        }
                    </div>
                    <div>
                        <div class="ipo-company-name">${item.name}</div>
                        <div class="ipo-symbol-info">${item.symbol} • ${item.sector || 'N/A'}</div>
                    </div>
                </div>

                <div class="ipo-details-grid">
                    <div class="detail-item">
                        <span class="detail-label">Units</span>
                        <span class="detail-value">${item.units.toLocaleString()}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Price</span>
                        <span class="detail-value">Rs. ${item.price}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Issue Manager</span>
                        <span class="detail-value" style="font-size: 0.7rem; line-height: 1.2;">${item.issueManager}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Total Amount</span>
                        <span class="detail-value">Rs. ${(item.totalAmount / 10000000).toFixed(2)} Cr</span>
                    </div>
                </div>

                <div class="ipo-dates-row">
                    <div class="date-box">
                        <span class="date-label">Opens</span>
                        <span class="date-value">${openingDate}</span>
                    </div>
                    <span class="date-sep"><i class="fas fa-chevron-right"></i></span>
                    <div class="date-box" style="text-align: right;">
                        <span class="date-label">Closes</span>
                        <span class="date-value">${closingDate}</span>
                    </div>
                </div>

                <button class="ipo-btn ${item.status === 'Open' ? 'btn-apply' : 'btn-disabled'}" 
                        onclick="window.open('https://meroshare.cdsc.com.np', '_blank')" 
                        ${item.status !== 'Open' ? 'disabled' : ''}>
                    <i class="fas ${item.status === 'Open' ? 'fa-external-link-alt' : 'fa-lock'}"></i>
                    ${item.status === 'Open' ? 'Apply via MeroShare' : 'Application Not Open'}
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
