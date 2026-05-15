import globalState from '../../state.js';
import { Layout } from '../../layout.js';

let allNews = [];

export const NewsPage = {
    async init() {
        console.log("📰 NewsPage: Initializing...");
        globalState.setState({ activePage: 'news' });
        
        try {
            await Layout.init();
            console.log("✅ Layout initialized");
        } catch (e) {
            console.error("❌ Layout init failed:", e);
        }
        
        this.setupModalEvents();
        this.setupClickDelegation();
        this.subscribeToState();
        console.log("🚀 NewsPage: Ready!");
    },

    setupModalEvents() {
        const overlay = document.getElementById('news-modal-overlay');
        const closeBtn = document.getElementById('close-news-modal');
        const modalCloseBtn = document.getElementById('modal-close-btn');

        if (overlay && closeBtn) closeBtn.onclick = () => overlay.classList.remove('active');
        if (overlay && modalCloseBtn) modalCloseBtn.onclick = () => overlay.classList.remove('active');
        
        if (overlay) {
            overlay.onclick = (e) => {
                if (e.target === overlay) overlay.classList.remove('active');
            };
        }
    },

    setupClickDelegation() {
        document.addEventListener('click', (e) => {
            const row = e.target.closest('tr[data-id]');
            if (row) {
                const id = parseInt(row.dataset.id);
                console.log("👆 Row clicked, ID:", id);
                this.showDetail(id);
            }
        });
    },

    subscribeToState() {
        const currentState = globalState.getState();
        if (currentState.news && currentState.news.length > 0) {
            allNews = currentState.news;
            this.render(allNews);
        }

        globalState.subscribe((state) => {
            if (state.news && state.news.length > 0) {
                console.log("🔔 State updated, news count:", state.news.length);
                allNews = state.news;
                this.render(allNews);
            }
        });
    },

    render(news) {
        const tbody = document.getElementById('news-table-body');
        if (!tbody) {
            console.error("❌ Could not find #news-table-body");
            return;
        }
        
        tbody.innerHTML = news.map(item => {
            let formattedDate = item.date;
            try {
                const d = new Date(item.date);
                formattedDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            } catch(e) {}

            const cleanSummary = (item.summary || "").replace(/<[^>]*>?/gm, '');

            return `
            <tr data-id="${item.id}" class="news-row" style="cursor: pointer;">
                <td style="color: var(--text-secondary); font-size: 0.85rem;">
                    ${formattedDate}
                </td>
                <td>
                    <span class="symbol-badge">${item.symbol}</span>
                </td>
                <td style="overflow: hidden;">
                    <div class="news-title">${item.title}</div>
                    <div class="news-summary-preview">${cleanSummary}</div>
                </td>
                <td style="text-align: center;">
                    <button class="btn btn-primary" style="padding: 0.6rem 1.2rem; font-size: 0.8rem; border-radius: 10px; pointer-events: none; width: 100%;">
                        View Details
                    </button>
                </td>
            </tr>
        `}).join('');
    },

    showDetail(id) {
        console.log("🔍 Fetching detail for ID:", id);
        const item = allNews.find(n => n.id === id);
        if (!item) {
            console.error("❌ Item not found in allNews. Cache size:", allNews.length);
            return;
        }

        const overlay = document.getElementById('news-modal-overlay');
        const modalDate = document.getElementById('modal-date');
        const modalSymbol = document.getElementById('modal-symbol');
        const modalTitle = document.getElementById('modal-title');
        const modalDetails = document.getElementById('modal-details');
        const pdfLink = document.getElementById('modal-pdf-link');

        if (!overlay || !modalDate || !modalSymbol || !modalTitle || !modalDetails || !pdfLink) {
            console.error("❌ One or more modal elements missing in DOM!");
            return;
        }

        let formattedDate = item.date;
        try {
            const d = new Date(item.date);
            formattedDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + " | " + 
                           d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        } catch(e) {}

        modalDate.innerText = formattedDate;
        modalSymbol.innerText = item.symbol;
        modalTitle.innerText = item.title;
        modalDetails.innerHTML = item.summary;
        
        if (item.attachment) {
            pdfLink.href = item.attachment.startsWith('http') ? item.attachment : `https://sharehubnepal.com/${item.attachment}`;
            pdfLink.style.display = 'flex';
        } else {
            pdfLink.style.display = 'none';
        }

        overlay.classList.add('active');
        console.log("✅ Modal opened (via class active)");
    }
};

// Safe Init
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => NewsPage.init());
} else {
    NewsPage.init();
}
