import globalState from './state.js';
import StorageService from '../services/storageService.js';
import DataService from '../services/dataService.js';
import { Sidebar } from '../components/sidebar.js';
import { Navbar } from '../components/navbar.js';
import { AlertManager } from './alerts.js';
import NotificationService from '../services/notificationService.js';

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

        // Ensure auth.js is loaded dynamically if window.auth is not present
        if (!window.auth) {
            await new Promise((resolve) => {
                const script = document.createElement('script');
                script.src = `${prefix}js/auth.js`;
                script.onload = () => resolve();
                script.onerror = () => {
                    console.error('Failed to load auth.js dynamically');
                    resolve();
                };
                document.head.appendChild(script);
            });
        }

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

        // Initialize User Profile Dropdown
        this.initUserProfile();

        // Initialize Global Search Autocomplete
        this.setupGlobalSearch();
    },

    initNotifications() {
        const bell = document.getElementById('notification-bell');
        const dropdown = document.getElementById('notif-dropdown');
        const badge = document.getElementById('notif-badge');
        const list = document.getElementById('notif-list');
        const markReadBtn = document.getElementById('mark-read-btn');
        const soundToggle = document.getElementById('sound-toggle-btn');

        if (!bell) return;

        let allNotifs = [];
        let activeFilter = 'all';

        // --- Sound Toggle ---
        const syncSoundIcon = () => {
            if (!soundToggle) return;
            const muted = NotificationService.isSoundMuted();
            soundToggle.innerHTML = muted
                ? '<i class="fas fa-volume-mute"></i>'
                : '<i class="fas fa-volume-up"></i>';
            soundToggle.classList.toggle('muted', muted);
            soundToggle.title = muted ? 'Sound muted — click to unmute' : 'Sound on — click to mute';
        };

        if (soundToggle) {
            syncSoundIcon();
            soundToggle.onclick = (e) => {
                e.stopPropagation();
                NotificationService.toggleSound();
                syncSoundIcon();
            };
        }

        // --- Render notifications with active filter ---
        const renderNotifs = () => {
            let filtered = allNotifs;
            if (activeFilter !== 'all') {
                filtered = allNotifs.filter(n => n.type === activeFilter);
            }

            if (filtered.length === 0) {
                const emptyMsg = activeFilter === 'all'
                    ? 'No notifications in the last 7 days'
                    : `No ${activeFilter} alerts found`;
                list.innerHTML = `<div class="notif-empty">${emptyMsg}</div>`;
            } else {
                list.innerHTML = filtered.map(n => {
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

        // --- Fetch & refresh ---
        const refreshNotifs = async () => {
            allNotifs = await StorageService.getNotifications();
            const unreadCount = allNotifs.filter(n => !n.is_read).length;

            if (unreadCount > 0) {
                badge.innerText = unreadCount;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }

            renderNotifs();
        };

        // --- Filter tabs ---
        const filterBtns = dropdown?.querySelectorAll('.notif-filter-btn');
        if (filterBtns) {
            filterBtns.forEach(btn => {
                btn.onclick = (e) => {
                    e.stopPropagation();
                    filterBtns.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    activeFilter = btn.dataset.filter;
                    renderNotifs();
                };
            });
        }

        // --- Bell toggle ---
        bell.onclick = (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('hidden');
            if (!dropdown.classList.contains('hidden')) {
                refreshNotifs();
            }
        };

        // --- Mark all read ---
        markReadBtn.onclick = async (e) => {
            e.stopPropagation();
            await StorageService.markNotificationsAsRead();
            refreshNotifs();
        };

        // --- Close on outside click ---
        document.addEventListener('click', () => {
            dropdown.classList.add('hidden');
        });

        dropdown.onclick = (e) => e.stopPropagation();

        // Initial check and periodic refresh
        refreshNotifs();
        setInterval(refreshNotifs, 60000);
    },

    initUserProfile() {
        // Populate the static profile HTML already in index.html
        const btn = document.getElementById('user-profile-btn');
        const dropdown = document.getElementById('profile-dropdown');

        // If the static elements don't exist, nothing to do
        if (!btn || !dropdown) return;

        // Populate user data if logged in
        if (window.auth && window.auth.isLoggedIn()) {
            const user = window.auth.getUser();
            if (user) {
                const username = user.username || 'User';
                const email = user.email || '';
                const code = user.code || '';
                const initial = username.charAt(0).toUpperCase();

                // Update avatar initial
                const avatarInitial = document.getElementById('user-avatar-initial');
                if (avatarInitial) avatarInitial.textContent = initial;

                // Update dropdown header
                const avatarLarge = dropdown.querySelector('.profile-avatar-large');
                if (avatarLarge) avatarLarge.textContent = initial;

                const nameEl = dropdown.querySelector('.profile-meta h5');
                if (nameEl) nameEl.textContent = username;

                const codeEl = dropdown.querySelector('.profile-meta span');
                if (codeEl) codeEl.textContent = `Code: ${code}`;

                const emailEl = dropdown.querySelector('.profile-info-item span');
                if (emailEl) emailEl.textContent = email;
            }
        }

        // Bind toggle event on the avatar button
        btn.onclick = (e) => {
            e.stopPropagation();
            document.getElementById('notif-dropdown')?.classList.add('hidden');
            dropdown.classList.toggle('hidden');
        };

        // Prevent clicks inside dropdown from closing it
        dropdown.onclick = (e) => e.stopPropagation();

        // Close on outside click
        document.addEventListener('click', () => {
            dropdown.classList.add('hidden');
        });

        // Logout button
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.onclick = async (e) => {
                e.stopPropagation();
                if (confirm('Are you sure you want to logout?')) {
                    if (window.auth) await window.auth.logout();
                    const prefix = globalState.getState().pathPrefix || '';
                    window.location.href = `${prefix}pages/login.html`;
                }
            };
        }
    },

    setupGlobalSearch() {
        const navInput = document.getElementById('nav-global-search');
        const navResults = document.getElementById('nav-search-results');
        const sidebarInput = document.getElementById('sidebar-global-search');
        const sidebarResults = document.getElementById('sidebar-search-results');

        if (!navInput && !sidebarInput) return;

        const handleSearchInput = async (inputEl, resultsEl) => {
            const query = inputEl.value.toUpperCase().trim();
            if (query.length === 0) {
                resultsEl.style.display = 'none';
                resultsEl.innerHTML = '';
                return;
            }

            try {
                let stocks = globalState.getState().stocks;
                if (!stocks || typeof stocks.then === 'function' || !Array.isArray(stocks)) {
                    stocks = await DataService.getStocks();
                }
                if (!stocks || !Array.isArray(stocks) || stocks.length === 0) return;

                const matches = stocks.filter(s => 
                    s.symbol.toUpperCase().includes(query) || 
                    (s.name && s.name.toUpperCase().includes(query))
                ).slice(0, 8);

                if (matches.length === 0) {
                    resultsEl.innerHTML = `
                        <div style="padding: 12px 16px; color: var(--text-secondary); font-size: 0.8rem; text-align: center;">
                            No stocks match "${query}"
                        </div>
                    `;
                    resultsEl.style.display = 'block';
                    return;
                }

                const prefix = globalState.getState().pathPrefix || '';
                
                resultsEl.innerHTML = matches.map(s => {
                    const priceVal = parseFloat(s.price || 0);
                    const changeVal = parseFloat(s.changePercent || 0);
                    const isUp = changeVal >= 0;
                    
                    return `
                        <div class="search-result-item" 
                             onclick="window.location.href='${prefix}pages/market/stock-details.html?symbol=${s.symbol}'"
                             style="display: flex; align-items: center; gap: 0.75rem; padding: 10px 16px; cursor: pointer; transition: all 0.2s; border-bottom: 1px solid rgba(255,255,255,0.02);">
                            
                            <div class="symbol-logo-wrapper" style="position: relative; width: 28px; height: 28px; border-radius: 50%; overflow: hidden; background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                                <img src="${prefix}images/stocks/${s.symbol.toUpperCase()}.png" 
                                     onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" 
                                     alt="${s.symbol}" 
                                     style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" />
                                <div class="symbol-avatar" style="display: none; position: absolute; inset: 0; align-items: center; justify-content: center; font-size: 0.7rem; font-weight: 700; color: #fff; background: linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%); border-radius: 50%;">
                                    ${s.symbol.substring(0, 2)}
                                </div>
                            </div>
                            
                            <div style="flex: 1; min-width: 0; display: flex; align-items: center; justify-content: space-between;">
                                <div style="font-weight: 700; font-size: 0.85rem; color: #fff; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; padding-right: 0.5rem; flex: 1;">
                                    <span>${s.symbol}</span>
                                    <span style="font-weight: 400; font-size: 0.75rem; color: var(--text-secondary); margin-left: 0.25rem;">(${s.name || s.symbol})</span>
                                </div>
                                <span style="font-size: 0.8rem; font-weight: 700; color: ${isUp ? '#10b981' : '#ef4444'}; flex-shrink: 0;">
                                    Rs. ${priceVal.toLocaleString('en-IN', {minimumFractionDigits: 1})}
                                </span>
                            </div>
                        </div>
                    `;
                }).join('');

                resultsEl.style.display = 'block';

            } catch (err) {
                console.error("Search auto-complete failed:", err);
            }
        };

        if (navInput && navResults) {
            navInput.oninput = () => handleSearchInput(navInput, navResults);
        }
        if (sidebarInput && sidebarResults) {
            sidebarInput.oninput = () => handleSearchInput(sidebarInput, sidebarResults);
        }

        document.addEventListener('click', (e) => {
            if (navInput && !navInput.contains(e.target) && !navResults.contains(e.target)) {
                navResults.style.display = 'none';
            }
            if (sidebarInput && !sidebarInput.contains(e.target) && !sidebarResults.contains(e.target)) {
                sidebarResults.style.display = 'none';
            }
        });
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
            <div class="qv-header" style="display: flex; align-items: center; gap: 1rem; padding: 1.5rem 2rem;">
                <div class="symbol-logo-wrapper" id="qv-logo-wrapper" style="position: relative; width: 44px; height: 44px; border-radius: 50%; overflow: hidden; background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                    <img id="qv-logo-img" src="" 
                         onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" 
                         alt="" 
                         style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" />
                    <div id="qv-logo-avatar" class="symbol-avatar" style="display: none; position: absolute; inset: 0; align-items: center; justify-content: center; font-size: 1.1rem; font-weight: 700; text-transform: uppercase; color: #fff; background: linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%); border-radius: 50%; letter-spacing: -0.2px;">
                      --
                    </div>
                </div>
                <div id="qv-symbol-header" style="flex: 1;">
                    <h2 id="qv-symbol" style="margin: 0; font-size: 1.6rem; font-weight: 800; color: var(--primary);">SYMBOL</h2>
                    <p id="qv-name" style="margin: 0.2rem 0 0 0; font-size: 0.85rem; color: var(--text-secondary);">Company Full Name</p>
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
        let qvChartInstance = null;

        const renderQuickViewChart = async (symbol, isPositive) => {
            if (!window.Chart) {
                await new Promise((resolve) => {
                    const script = document.createElement('script');
                    script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
                    script.onload = resolve;
                    document.head.appendChild(script);
                });
            }

            const canvas = document.getElementById('qv-mini-chart');
            if (!canvas) return;

            if (qvChartInstance) {
                qvChartInstance.destroy();
                qvChartInstance = null;
            }

            try {
                const rawData = await DataService.getIndexChart(symbol, '1D');
                if (!rawData || rawData.length === 0) return;

                let labels = [];
                let prices = [];

                if (Array.isArray(rawData[0])) {
                    // Coordinates array schema: [[timestamp, price], ...]
                    labels = rawData.map(item => {
                        const d = new Date(item[0] * 1000);
                        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
                    });
                    prices = rawData.map(item => parseFloat(item[1] || 0));
                } else {
                    // Object based schema: [{time: 1779104165, contractRate: 438}, ...] or [{time: "...", price: ...}]
                    labels = rawData.map(d => {
                        if (!d.time) return '';
                        if (typeof d.time === 'number') {
                            const date = new Date(d.time * 1000);
                            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
                        }
                        const timeStr = String(d.time);
                        return timeStr.includes('T') ? timeStr.split('T')[1].substring(0, 5) : timeStr;
                    });
                    prices = rawData.map(d => parseFloat(d.contractRate || d.price || d.y || d.value || 0));
                }

                const ctx = canvas.getContext('2d');
                const gradient = ctx.createLinearGradient(0, 0, 0, 180);
                if (isPositive) {
                    gradient.addColorStop(0, 'rgba(16, 185, 129, 0.2)');
                    gradient.addColorStop(1, 'rgba(16, 185, 129, 0.0)');
                } else {
                    gradient.addColorStop(0, 'rgba(239, 68, 68, 0.2)');
                    gradient.addColorStop(1, 'rgba(239, 68, 68, 0.0)');
                }

                const lineColor = isPositive ? '#10b981' : '#ef4444';

                qvChartInstance = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: labels,
                        datasets: [{
                            data: prices,
                            borderColor: lineColor,
                            borderWidth: 2,
                            backgroundColor: gradient,
                            fill: true,
                            tension: 0.2,
                            pointRadius: 0,
                            pointHoverRadius: 4,
                            pointHoverBackgroundColor: lineColor,
                            pointHoverBorderColor: '#fff',
                            pointHoverBorderWidth: 2
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                enabled: true,
                                mode: 'index',
                                intersect: false,
                                backgroundColor: 'rgba(30, 41, 59, 0.95)',
                                titleColor: '#fff',
                                bodyColor: '#fff',
                                borderColor: 'rgba(255, 255, 255, 0.1)',
                                borderWidth: 1,
                                padding: 8,
                                displayColors: false,
                                callbacks: {
                                    label: function (context) {
                                        return `Price: Rs. ${context.parsed.y.toLocaleString()}`;
                                    }
                                }
                            }
                        },
                        scales: {
                            x: { display: false },
                            y: {
                                display: true,
                                grid: {
                                    color: 'rgba(255, 255, 255, 0.03)',
                                    drawBorder: false
                                },
                                ticks: {
                                    color: '#94a3b8',
                                    font: { size: 9 },
                                    maxTicksLimit: 5,
                                    callback: function (value) {
                                        return 'Rs. ' + Math.round(value);
                                    }
                                }
                            }
                        }
                    }
                });
            } catch (err) {
                console.error("Failed to render quick view chart:", err);
            }
        };

        // Global function to trigger
        window.showSymbolDetails = async (symbol) => {
            const data = await DataService.getLiveMarket();
            const stock = data.find(s => s.symbol.toUpperCase() === symbol.toUpperCase());

            if (stock) {
                // Dynamically determine asset path prefix based on path depth
                let prefix = './';
                const parts = window.location.pathname.split('/');
                const pathParts = parts.filter(p => p.length > 0);
                const depth = pathParts.length - 1;
                if (depth > 0) {
                    prefix = '../'.repeat(depth);
                }

                const imgEl = document.getElementById('qv-logo-img');
                const avatarEl = document.getElementById('qv-logo-avatar');
                if (imgEl && avatarEl) {
                    imgEl.src = `${prefix}images/stocks/${stock.symbol.toUpperCase()}.png`;
                    imgEl.style.display = 'block'; // reset in case previously hidden
                    avatarEl.style.display = 'none';
                    avatarEl.innerText = stock.symbol.substring(0, 2);
                }

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

                // Render dynamic 1D chart
                renderQuickViewChart(stock.symbol, change >= 0);
            }
        };

        document.getElementById('close-quick-view').onclick = () => {
            panel.classList.remove('active');
            if (qvChartInstance) {
                qvChartInstance.destroy();
                qvChartInstance = null;
            }
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
