import globalState from './state.js';
import StorageService from '../services/storageService.js';
import DataService from '../services/dataService.js';
import { Sidebar } from '../components/sidebar.js';
import { Navbar } from '../components/navbar.js';
import { AlertManager } from './alerts.js';

export const Layout = {
    async init() {
        // Detect active page and path depth
        const path = window.location.pathname;
        const segments = path.split('/').filter(p => p && !p.endsWith('.html') && p !== 'NEPSE%20HUB');
        // Note: 'NEPSE%20HUB' might be part of the path if opened via file system or specific server setup.
        // Let's use a simpler way: check how many '../' we need to get to root.
        
        // Count how many directories deep we are relative to index.html
        // We expect: root, pages/, or pages/calculator/, or pages/trade/, or pages/market/
        let prefix = '';
        if (path.includes('/pages/calculator/') || path.includes('/pages/trade/') || path.includes('/pages/market/')) {
            prefix = '../../';
        } else if (path.includes('/pages/')) {
            prefix = '../';
        }

        const page = path.split('/').pop().replace('.html', '') || 'index';
        globalState.setState({ 
            activePage: page,
            pathPrefix: prefix
        });

        // Load basic state
        const [savedPortfolio, savedWatchlist] = await Promise.all([
            StorageService.load('nepse_portfolio').then(d => d || []),
            StorageService.load('nepse_watchlist').then(d => d || [])
        ]);
        
        globalState.setState({ 
            theme: 'dark',
            portfolio: savedPortfolio,
            watchlist: savedWatchlist
        });

        document.documentElement.setAttribute('data-theme', 'dark');

        // Render Components
        this.renderComponents();
        this.bindEvents();

        // Initialize Background Alerts
        AlertManager.init();

        // Load dynamic data
        try {
            const [stocks, news] = await Promise.all([
                DataService.getStocks(),
                DataService.getNews()
            ]);
            globalState.setState({ stocks, news });
        } catch (error) {
            console.error('Data load failed:', error);
        } finally {
            this.hideSplash();
        }

        // Initialize Live Clock
        this.initClock();

        // Initialize Market Status
        this.initMarketStatus();

        // Add Quick View Panel to DOM if it doesn't exist
        this.initQuickView();

        // Initialize Notifications
        this.initNotifications();
    },

    initNotifications() {
        const bell = document.getElementById('notification-bell');
        const dropdown = document.getElementById('notif-dropdown');
        const badge = document.getElementById('notif-badge');
        const list = document.getElementById('notif-list');
        const markReadBtn = document.getElementById('mark-read-btn');

        if (!bell) return;

        const refreshNotifs = async () => {
            const notifs = await StorageService.getNotifications();
            const unreadCount = notifs.filter(n => !n.is_read).length;

            if (unreadCount > 0) {
                badge.innerText = unreadCount;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }

            if (notifs.length === 0) {
                list.innerHTML = '<div class="notif-empty">No notifications in the last 7 days</div>';
            } else {
                list.innerHTML = notifs.map(n => {
                    const date = new Date(n.created_at);
                    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
                    
                    let icon = 'fa-info-circle';
                    if (n.type === 'buy') icon = 'fa-shopping-cart';
                    if (n.type === 'sell') icon = 'fa-hand-holding-usd';
                    if (n.type === 'stoploss') icon = 'fa-exclamation-triangle';

                    return `
                        <div class="notif-item ${n.is_read ? '' : 'unread'}">
                            <div class="notif-icon ${n.type}">
                                <i class="fas ${icon}"></i>
                            </div>
                            <div class="notif-body">
                                <div class="notif-title">${n.title}</div>
                                <div class="notif-msg">${n.message}</div>
                                <div class="notif-time">${dateStr} at ${timeStr}</div>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        };

        bell.onclick = (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('hidden');
            if (!dropdown.classList.contains('hidden')) {
                refreshNotifs();
            }
        };

        markReadBtn.onclick = async (e) => {
            e.stopPropagation();
            await StorageService.markNotificationsAsRead();
            refreshNotifs();
        };

        document.addEventListener('click', () => {
            dropdown.classList.add('hidden');
        });

        dropdown.onclick = (e) => e.stopPropagation();

        // Initial check and periodic refresh
        refreshNotifs();
        setInterval(refreshNotifs, 60000); // Check for new ones every minute
    },

    hideSplash() {
        const splash = document.getElementById('splash-loader');
        if (splash) {
            splash.classList.add('hidden');
            setTimeout(() => {
                splash.remove();
            }, 600);
        }
    },

    initMarketStatus() {
        const updateUI = (status) => {
            const el = document.getElementById('market-status');
            if (!el) return;

            const isOpen = status.toLowerCase().includes('open');
            el.innerHTML = `
                <span class="status-dot ${isOpen ? 'status-open' : 'status-closed'}"></span>
                <span class="status-text">${isOpen ? 'MARKET OPEN' : 'MARKET CLOSED'}</span>
            `;
        };

        // 1. Initial Fetch (REST)
        fetch('https://marketstatus.onrender.com/market-status')
            .then(res => res.json())
            .then(data => updateUI(data.status))
            .catch(err => console.error('Market status fetch failed:', err));

        // 2. Live Updates (WebSocket)
        const connectWS = () => {
            const ws = new WebSocket('wss://marketstatus.onrender.com/ws/market-status');
            
            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.status) updateUI(data.status);
                } catch (e) {
                    // Handle non-json if needed
                    updateUI(event.data);
                }
            };

            ws.onclose = () => {
                // Reconnect after 5 seconds if connection lost
                setTimeout(connectWS, 5000);
            };
        };

        connectWS();
    },

    initClock() {
        const update = () => {
            const el = document.getElementById('navbar-clock');
            if (!el) return;

            const now = new Date();
            const options = { 
                weekday: 'short', 
                month: 'short', 
                day: 'numeric',
                hour: '2-digit', 
                minute: '2-digit', 
                second: '2-digit',
                hour12: true 
            };
            
            // Format: Thu, May 14 | 09:32:15 AM
            const str = now.toLocaleString('en-US', options).replace(', ', ', ').replace(' at ', ' | ');
            el.innerHTML = `<i class="far fa-clock" style="margin-right: 0.5rem; color: var(--primary);"></i> ${str}`;
        };

        update();
        setInterval(update, 1000);
    },

    initQuickView() {
        if (document.getElementById('quick-view-panel')) return;

        const panel = document.createElement('div');
        panel.id = 'quick-view-panel';
        panel.className = 'quick-view-panel glass';
        panel.innerHTML = `
            <div class="qv-header">
                <div id="qv-symbol-header">
                    <h2 id="qv-symbol">SYMBOL</h2>
                    <p id="qv-name">Company Full Name</p>
                </div>
                <button id="close-quick-view" class="btn-icon"><i class="fas fa-times"></i></button>
            </div>
            <div class="qv-content">
                <div class="qv-price-section">
                    <div id="qv-ltp">Rs. 0.00</div>
                    <div id="qv-change">+0.00%</div>
                </div>
                <div class="qv-stats-grid">
                    <div class="qv-stat-item">
                        <span class="qv-label">Open</span>
                        <span class="qv-value" id="qv-open">-</span>
                    </div>
                    <div class="qv-stat-item">
                        <span class="qv-label">High</span>
                        <span class="qv-value" id="qv-high">-</span>
                    </div>
                    <div class="qv-stat-item">
                        <span class="qv-label">Low</span>
                        <span class="qv-value" id="qv-low">-</span>
                    </div>
                    <div class="qv-stat-item">
                        <span class="qv-label">Volume</span>
                        <span class="qv-value" id="qv-vol">-</span>
                    </div>
                    <div class="qv-stat-item">
                        <span class="qv-label">Prev. Close</span>
                        <span class="qv-value" id="qv-prev">-</span>
                    </div>
                    <div class="qv-stat-item">
                        <span class="qv-label">Sector</span>
                        <span class="qv-value" id="qv-sector">-</span>
                    </div>
                </div>
                <div class="qv-chart-placeholder">
                    <canvas id="qv-mini-chart"></canvas>
                </div>
            </div>
        `;
        document.body.appendChild(panel);

        // Global function to trigger
        window.showSymbolDetails = async (symbol) => {
            const data = await DataService.getLiveMarket();
            const stock = data.find(s => s.symbol.toUpperCase() === symbol.toUpperCase());
            
            if (stock) {
                document.getElementById('qv-symbol').innerText = stock.symbol;
                document.getElementById('qv-name').innerText = stock.name || stock.symbol;
                document.getElementById('qv-ltp').innerText = `Rs. ${(stock.price || 0).toLocaleString()}`;
                
                const change = stock.changePercent || 0;
                const changeEl = document.getElementById('qv-change');
                changeEl.innerText = `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`;
                changeEl.className = change >= 0 ? 'qv-change price-up' : 'qv-change price-down';

                document.getElementById('qv-open').innerText = stock.open || '-';
                document.getElementById('qv-high').innerText = stock.high || '-';
                document.getElementById('qv-low').innerText = stock.low || '-';
                document.getElementById('qv-vol').innerText = (stock.volume || 0).toLocaleString();
                document.getElementById('qv-prev').innerText = stock.previousClose || '-';
                document.getElementById('qv-sector').innerText = stock.sector || 'N/A';

                panel.classList.add('active');
            }
        };

        document.getElementById('close-quick-view').onclick = () => {
            panel.classList.remove('active');
        };
    },

    renderComponents() {
        const navbarContainer = document.getElementById('navbar-container');
        const sidebarContainer = document.getElementById('sidebar-container');
        
        if (navbarContainer) navbarContainer.innerHTML = Navbar();
        if (sidebarContainer) sidebarContainer.innerHTML = Sidebar();
    },

    bindEvents() {
        document.addEventListener('click', (e) => {

            if (e.target.closest('#burgerMenu')) {
                document.getElementById('sidebar')?.classList.add('active');
            }

            if (e.target.closest('#closeSidebar')) {
                document.getElementById('sidebar')?.classList.remove('active');
            }
        });

        // Global Search
        document.addEventListener('input', (e) => {
            if (e.target.id === 'globalSearch') {
                globalState.setState({ searchQuery: e.target.value });
            }
        });
    }
};
