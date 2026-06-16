import globalState from './state.js';
import StorageService from '../services/storageService.js';
import DataService from '../services/dataService.js';
import { Sidebar } from '../components/sidebar.js';
import { Navbar } from '../components/navbar.js';
// import { AlertManager } from './alerts.js';
import NotificationService from '../services/notificationService.js';
import { getStockImageUrl } from './stockImageProvider.js';
import FeeService from '../services/feeService.js';

export const Layout = {
    async init() {
        // Detect active page and path depth
        const path = window.location.pathname;
        const segments = path.split('/').filter(p => p && !p.endsWith('.html') && p !== 'NEPSE%20HUB');
        // Note: 'NEPSE%20HUB' might be part of the path if opened via file system or specific server setup.
        // Let's use a simpler way: check how many '../' we need to get to root.

        // Count how many directories deep we are relative to index.html
        // We expect: root, pages/, pages/calculator/, pages/analysis/, pages/market/, or pages/investment/
        let prefix = '';
        if (path.includes('/pages/calculator/') || path.includes('/pages/analysis/') || path.includes('/pages/market/') || path.includes('/pages/investment/')) {
            prefix = '../../';
        } else if (path.includes('/pages/')) {
            prefix = '../';
        }

        // Dynamically inject favicon
        let faviconLink = document.querySelector("link[rel~='icon']");
        if (!faviconLink) {
            faviconLink = document.createElement('link');
            faviconLink.rel = 'icon';
            document.head.appendChild(faviconLink);
        }
        faviconLink.href = `${prefix}images/website/favicon.png`;
        faviconLink.type = 'image/png';

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

        const savedTheme = localStorage.getItem('theme') || 'classic-dark';
        globalState.setState({
            theme: savedTheme,
            portfolio: savedPortfolio,
            watchlist: savedWatchlist
        });

        document.documentElement.setAttribute('data-theme', savedTheme);

        // Render Components
        this.renderComponents();
        this.bindEvents();

        // Initialize Background Alerts
        // AlertManager.init();

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

        // Initialize Quick Calculator Drawer
        this.initQuickCalc();

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

        // --- Helper: Get category ---
        const getCategory = (n) => {
            const type = n.type || 'info';
            if (type === 'buy' || type === 'sell' || type === 'stoploss') return 'Price Alerts';
            if (type === 'portfolio' || (n.title && n.title.toLowerCase().includes('portfolio')) || (n.message && n.message.toLowerCase().includes('portfolio'))) return 'Portfolio';
            return 'System';
        };

        // --- Helper: Get relative time ---
        const getRelativeTime = (dateInput) => {
            const date = new Date(dateInput);
            const now = new Date();
            const diffMs = now - date;
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMins / 60);
            const diffDays = Math.floor(diffHours / 24);

            if (diffMins < 1) return 'Just now';
            if (diffMins < 60) return `${diffMins}m ago`;
            if (diffHours < 24) return `${diffHours}h ago`;
            if (diffDays === 1) return 'Yesterday';
            return `${diffDays}d ago`;
        };

        // --- Helper: Extract Stock Symbol ---
        const extractSymbol = (n) => {
            if (n.symbol) return n.symbol;
            const words = `${n.title} ${n.message}`.split(/[^a-zA-Z]/);
            const stocks = globalState.getState().stocks || [];
            const stockSymbols = new Set(stocks.map(s => s.symbol.toUpperCase()));
            for (const w of words) {
                if (stockSymbols.has(w.toUpperCase())) {
                    return w.toUpperCase();
                }
            }
            return null;
        };

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
                // Group by category
                const groups = {
                    'Price Alerts': [],
                    'Portfolio': [],
                    'System': []
                };

                filtered.forEach(n => {
                    const cat = getCategory(n);
                    groups[cat].push(n);
                });

                let html = '';
                const prefix = globalState.getState().pathPrefix || '';

                for (const [groupName, notifs] of Object.entries(groups)) {
                    if (notifs.length === 0) continue;

                    html += `<div class="notif-group-header">${groupName}</div>`;

                    html += notifs.map(n => {
                        let icon = 'fa-info-circle';
                        if (n.type === 'buy') icon = 'fa-shopping-cart';
                        if (n.type === 'sell') icon = 'fa-hand-holding-usd';
                        if (n.type === 'stoploss') icon = 'fa-exclamation-triangle';

                        const relTime = getRelativeTime(n.created_at);
                        const symbol = extractSymbol(n);
                        
                        let url = '';
                        if (symbol) {
                            url = `${prefix}pages/market/stock-details.html?symbol=${symbol}`;
                        } else if (n.type === 'portfolio' || n.title?.toLowerCase().includes('portfolio') || n.message?.toLowerCase().includes('portfolio')) {
                            url = `${prefix}pages/portfolio.html`;
                        } else if (n.type === 'watchlist' || n.title?.toLowerCase().includes('watchlist') || n.message?.toLowerCase().includes('watchlist')) {
                            url = `${prefix}pages/watchlist.html`;
                        }

                        return `
                            <div class="notif-item ${n.is_read ? '' : 'unread'}" data-id="${n.id}" data-url="${url || ''}">
                                <div class="notif-icon ${n.type}">
                                    <i class="fas ${icon}"></i>
                                </div>
                                <div class="notif-body">
                                    <div class="notif-title">${n.title}</div>
                                    <div class="notif-msg">${n.message}</div>
                                    <div class="notif-time">${relTime}</div>
                                </div>
                                <button class="notif-dismiss-btn" data-id="${n.id}" title="Dismiss alert">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        `;
                    }).join('');
                }

                list.innerHTML = html;

                // Bind click events for notification items and dismiss buttons
                list.querySelectorAll('.notif-item').forEach(item => {
                    const id = item.dataset.id;
                    const url = item.dataset.url;

                    // Entire notification item click
                    item.onclick = async (e) => {
                        e.stopPropagation();
                        // Mark as read
                        await StorageService.markNotificationAsRead(id);
                        await refreshNotifs();
                        
                        // Close dropdown
                        dropdown.classList.add('hidden');

                        // Navigate if url exists
                        if (url) {
                            window.location.href = url;
                        }
                    };

                    // Dismiss button click
                    const dismissBtn = item.querySelector('.notif-dismiss-btn');
                    if (dismissBtn) {
                        dismissBtn.onclick = async (e) => {
                            e.stopPropagation();
                            
                            // Add fade/exit animation
                            item.style.opacity = '0';
                            item.style.transform = 'translateX(20px)';
                            
                            setTimeout(async () => {
                                await StorageService.deleteNotification(id);
                                await refreshNotifs();
                            }, 300);
                        };
                    }
                });
            }
        };

        // --- Fetch & refresh ---
        const refreshNotifs = async () => {
            allNotifs = await StorageService.getNotifications();
            // Prune to max 50 notifications
            if (allNotifs.length > 50) {
                allNotifs = allNotifs.slice(0, 50);
            }
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
            document.getElementById('profile-dropdown')?.classList.add('hidden');
            document.getElementById('quick-calc-drawer')?.classList.remove('active');
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

        // Notification Settings button
        const notifSettingsBtn = document.getElementById('notif-settings-btn');
        if (notifSettingsBtn) {
            notifSettingsBtn.onclick = (e) => {
                e.stopPropagation();
                dropdown.classList.add('hidden');
                this.openNotifSettingsModal();
            };
        }
    },

    async openNotifSettingsModal() {
        // Inject modal HTML if not already present
        if (!document.getElementById('notif-settings-modal')) {
            const overlay = document.createElement('div');
            overlay.id = 'notif-settings-modal';
            overlay.style.cssText = `
                position:fixed;inset:0;z-index:9999;
                background:rgba(0,0,0,0.7);backdrop-filter:blur(4px);
                display:flex;align-items:center;justify-content:center;
            `;
            overlay.innerHTML = `
                <div style="background:#1e293b;border-radius:20px;padding:0;width:min(480px,94vw);box-shadow:0 32px 64px rgba(0,0,0,0.6);border:1px solid rgba(255,255,255,0.08);overflow:hidden">
                    <!-- Header -->
                    <div style="background:linear-gradient(135deg,#6366f1,#3b82f6);padding:28px 32px;">
                        <div style="display:flex;align-items:center;justify-content:space-between">
                            <div>
                                <h2 style="margin:0;font-size:1.25rem;font-weight:800;color:#fff;letter-spacing:-0.3px">🔔 Notification Settings</h2>
                                <p style="margin:4px 0 0;color:rgba(255,255,255,0.75);font-size:0.8rem">Daily NEPSE market summary delivery</p>
                            </div>
                            <button id="close-notif-modal" style="background:rgba(255,255,255,0.15);border:none;color:#fff;width:34px;height:34px;border-radius:50%;cursor:pointer;font-size:1rem;display:flex;align-items:center;justify-content:center">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                    </div>

                    <!-- Body -->
                    <div style="padding:28px 32px;">

                        <!-- Summary Frequency -->
                        <div style="margin-bottom:24px">
                            <label style="display:block;font-size:0.75rem;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">Summary Frequency</label>
                            <div style="display:flex;gap:8px;flex-wrap:wrap">
                                <button class="freq-btn" data-freq="never" style="flex:1;padding:10px 0;border-radius:10px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.04);color:#94a3b8;font-size:0.82rem;font-weight:600;cursor:pointer;transition:all 0.2s">Never</button>
                                <button class="freq-btn" data-freq="daily" style="flex:1;padding:10px 0;border-radius:10px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.04);color:#94a3b8;font-size:0.82rem;font-weight:600;cursor:pointer;transition:all 0.2s">Daily</button>
                                <button class="freq-btn" data-freq="weekly" style="flex:1;padding:10px 0;border-radius:10px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.04);color:#94a3b8;font-size:0.82rem;font-weight:600;cursor:pointer;transition:all 0.2s">Weekly (Fri)</button>
                            </div>
                        </div>

                        <!-- Delivery Channels -->
                        <div style="margin-bottom:24px">
                            <label style="display:block;font-size:0.75rem;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">Delivery Channels</label>
                            
                            <!-- Email toggle 
                            <div style="display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:14px 16px;margin-bottom:10px">
                                <div style="display:flex;align-items:center;gap:12px">
                                    <div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center">
                                        <i class="fas fa-envelope" style="color:#fff;font-size:0.9rem"></i>
                                    </div>
                                    <div>
                                        <div style="font-weight:600;color:#e2e8f0;font-size:0.88rem">Email Summary</div>
                                        <div style="color:#64748b;font-size:0.75rem">Sent to your account email</div>
                                    </div>
                                </div>
                                <label class="notif-toggle" style="position:relative;display:inline-block;width:44px;height:24px;cursor:pointer">
                                    <input type="checkbox" id="email-enabled-toggle" style="opacity:0;width:0;height:0">
                                    <span style="position:absolute;inset:0;background:#334155;border-radius:999px;transition:0.3s" class="toggle-track"></span>
                                    <span style="position:absolute;left:3px;top:3px;width:18px;height:18px;background:#fff;border-radius:50%;transition:0.3s;box-shadow:0 1px 4px rgba(0,0,0,0.3)" class="toggle-thumb"></span>
                                </label>
                            </div> -->

                            <!-- Telegram toggle + connect -->
                            <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:14px 16px">
                                <div style="display:flex;align-items:center;justify-content:space-between">
                                    <div style="display:flex;align-items:center;gap:12px">
                                        <div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#0088cc,#00b4d8);display:flex;align-items:center;justify-content:center">
                                            <i class="fab fa-telegram-plane" style="color:#fff;font-size:1rem"></i>
                                        </div>
                                        <div>
                                            <div style="font-weight:600;color:#e2e8f0;font-size:0.88rem">Telegram Bot</div>
                                            <div id="tg-status-text" style="color:#64748b;font-size:0.75rem">Checking…</div>
                                        </div>
                                    </div>
                                    <label class="notif-toggle" style="position:relative;display:inline-block;width:44px;height:24px;cursor:pointer">
                                        <input type="checkbox" id="telegram-enabled-toggle" style="opacity:0;width:0;height:0">
                                        <span style="position:absolute;inset:0;background:#334155;border-radius:999px;transition:0.3s" class="toggle-track"></span>
                                        <span style="position:absolute;left:3px;top:3px;width:18px;height:18px;background:#fff;border-radius:50%;transition:0.3s;box-shadow:0 1px 4px rgba(0,0,0,0.3)" class="toggle-thumb"></span>
                                    </label>
                                </div>
                                <div id="tg-connect-section" style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.06);display:none">
                                    <p style="margin:0 0 10px;color:#94a3b8;font-size:0.78rem;line-height:1.5">
                                        Open Telegram and message <strong style="color:#0088cc">@NepseHubBot</strong> with:
                                    </p>
                                    <div style="background:#0f172a;border-radius:8px;padding:10px 14px;font-family:monospace;font-size:0.82rem;color:#7dd3fc;display:flex;align-items:center;justify-content:space-between">
                                        <span id="tg-link-command">/start YOUR_CODE</span>
                                        <button id="copy-tg-link" style="background:none;border:none;color:#6366f1;cursor:pointer;font-size:0.75rem;font-weight:600;padding:0 0 0 8px"><i class="fas fa-copy"></i></button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Save button -->
                        <button id="save-notif-settings" style="width:100%;padding:14px;background:linear-gradient(135deg,#6366f1,#3b82f6);border:none;border-radius:12px;color:#fff;font-size:0.9rem;font-weight:700;cursor:pointer;transition:all 0.2s;letter-spacing:0.3px">
                            Save Settings
                        </button>
                        <div id="notif-save-status" style="text-align:center;margin-top:10px;font-size:0.8rem;color:#10b981;min-height:18px"></div>

                        <!-- Test Notification -->
                        <div style="margin-top:16px; border-top: 1px dashed rgba(255,255,255,0.1); padding-top:16px">
                            <button id="send-test-notif-btn" style="width:100%;padding:11px;background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.3);border-radius:12px;color:#818cf8;font-size:0.82rem;font-weight:700;cursor:pointer;transition:all 0.2s;display:flex;align-items:center;justify-content:center;gap:8px">
                                <i class="fas fa-flask"></i> 🧪 Send Test Notification (Bypass Close)
                            </button>
                            <div id="test-notif-status" style="text-align:center;margin-top:8px;font-size:0.75rem;color:#94a3b8;min-height:14px"></div>
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(overlay);

            // Close handlers
            document.getElementById('close-notif-modal').onclick = () => overlay.remove();
            overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
        }

        // ----- Populate data -----
        const settings = await StorageService.getNotificationSettings();
        const user = window.auth?.getUser();
        const code = user?.code || 'YOUR_CODE';

        // Frequency buttons
        const freqBtns = document.querySelectorAll('.freq-btn');
        freqBtns.forEach(btn => {
            const active = btn.dataset.freq === (settings.marketSummaryFrequency || 'never');
            btn.style.background = active ? 'linear-gradient(135deg,#6366f1,#3b82f6)' : 'rgba(255,255,255,0.04)';
            btn.style.color = active ? '#fff' : '#94a3b8';
            btn.style.borderColor = active ? 'transparent' : 'rgba(255,255,255,0.1)';
            btn.onclick = () => {
                freqBtns.forEach(b => {
                    b.style.background = 'rgba(255,255,255,0.04)';
                    b.style.color = '#94a3b8';
                    b.style.borderColor = 'rgba(255,255,255,0.1)';
                });
                btn.style.background = 'linear-gradient(135deg,#6366f1,#3b82f6)';
                btn.style.color = '#fff';
                btn.style.borderColor = 'transparent';
            };
        });

        // Toggle helper
        const applyToggle = (input, enabled) => {
            input.checked = enabled;
            const track = input.nextElementSibling;
            const thumb = track?.nextElementSibling;
            track.style.background = enabled ? '#6366f1' : '#334155';
            thumb.style.transform = enabled ? 'translateX(20px)' : 'translateX(0)';
        };
        const bindToggle = (input) => {
            input.addEventListener('change', () => {
                const track = input.nextElementSibling;
                const thumb = track?.nextElementSibling;
                track.style.background = input.checked ? '#6366f1' : '#334155';
                thumb.style.transform = input.checked ? 'translateX(20px)' : 'translateX(0)';
            });
        };

        const emailToggle = document.getElementById('email-enabled-toggle');
        const tgToggle = document.getElementById('telegram-enabled-toggle');

        // applyToggle(emailToggle, settings.emailEnabled || false);
        applyToggle(tgToggle, settings.telegramEnabled || false);
        // bindToggle(emailToggle);
        bindToggle(tgToggle);

        // Telegram connect section
        const tgConnectSection = document.getElementById('tg-connect-section');
        const tgStatusText = document.getElementById('tg-status-text');
        const tgCmd = document.getElementById('tg-link-command');
        if (tgCmd) tgCmd.textContent = `/start ${code}`;

        if (settings.telegramConnected) {
            tgStatusText.innerHTML = '<span style="color:#10b981">✓ Account linked</span>';
        } else {
            tgStatusText.textContent = 'Not linked — follow steps below to connect';
            tgConnectSection.style.display = 'block';
        }

        tgToggle.addEventListener('change', () => {
            if (tgToggle.checked && !settings.telegramConnected) {
                tgConnectSection.style.display = 'block';
            } else if (!tgToggle.checked) {
                tgConnectSection.style.display = 'none';
            }
        });

        // Copy command
        document.getElementById('copy-tg-link')?.addEventListener('click', () => {
            navigator.clipboard.writeText(`/start ${code}`);
            const btn = document.getElementById('copy-tg-link');
            if (btn) { btn.innerHTML = '<i class="fas fa-check"></i>'; setTimeout(() => { btn.innerHTML = '<i class="fas fa-copy"></i>'; }, 1500); }
        });

        // Save
        document.getElementById('save-notif-settings').onclick = async () => {
            const activeFreq = document.querySelector('.freq-btn[style*="linear-gradient"]')?.dataset.freq || 'never';
            const saveBtn = document.getElementById('save-notif-settings');
            const statusEl = document.getElementById('notif-save-status');
            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving…';

            const ok = await StorageService.updateNotificationSettings({
                marketSummaryFrequency: activeFreq,
                emailEnabled: document.getElementById('email-enabled-toggle').checked,
                telegramEnabled: document.getElementById('telegram-enabled-toggle').checked,
            });

            saveBtn.disabled = false;
            saveBtn.textContent = 'Save Settings';
            statusEl.textContent = ok ? '✓ Settings saved successfully!' : '✗ Failed to save. Please try again.';
            statusEl.style.color = ok ? '#10b981' : '#ef4444';
            setTimeout(() => { statusEl.textContent = ''; }, 3000);
        };

        // Test Dispatch Button Click Handler
        const testBtn = document.getElementById('send-test-notif-btn');
        if (testBtn) {
            testBtn.onclick = async () => {
                const statusEl = document.getElementById('test-notif-status');
                testBtn.disabled = true;
                const originalText = testBtn.innerHTML;
                testBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Triggering test dispatch...';
                statusEl.textContent = 'Contacting server...';
                statusEl.style.color = '#94a3b8';

                try {
                    const response = await window.auth.apiCall('/api/notifications/test-dispatch', {
                        method: 'POST'
                    });
                    
                    if (!response.ok) {
                        const errData = await response.json().catch(() => ({}));
                        throw new Error(errData.error || `HTTP ${response.status}`);
                    }
                    const data = await response.json();
                    if (data.success) {
                        const tg = data.results.telegram;
                        
                        let statusMsg = '';
                        if (tg.attempted && tg.success) {
                            statusMsg = '📢 Telegram Test Notification Sent!';
                            statusEl.style.color = '#10b981';
                        } else if (tg.attempted) {
                            statusMsg = `⚠️ Telegram failed: ${tg.error}`;
                            statusEl.style.color = '#ef4444';
                        } else {
                            statusMsg = 'Telegram skipped (not linked).';
                            statusEl.style.color = '#eab308';
                        }

                        statusEl.textContent = statusMsg;
                    } else {
                        statusEl.textContent = `Error: ${data.error || 'Failed to dispatch test'}`;
                        statusEl.style.color = '#ef4444';
                    }
                } catch (err) {
                    console.error('Test notification fail:', err);
                    statusEl.textContent = `❌ Test failed: ${err.message}`;
                    statusEl.style.color = '#ef4444';
                } finally {
                    testBtn.disabled = false;
                    testBtn.innerHTML = originalText;
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
                                <img src="${getStockImageUrl(s.symbol, prefix, s.name)}" 
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

            let statusText = '';
            if (status && typeof status === 'object') {
                statusText = status.status || '';
            } else if (typeof status === 'string') {
                statusText = status;
            }

            const statusLower = statusText.toLowerCase();
            const isOpen = statusLower === 'open' || statusLower === 'market open';
            const isPreOpen = statusLower.includes('pre-open') || statusLower.includes('special');
            
            let dotClass = 'status-closed';
            if (isOpen) {
                dotClass = 'status-open';
            } else if (isPreOpen) {
                dotClass = 'status-pre-open';
            }

            const displayStatus = statusText.toUpperCase() || 'MARKET CLOSED';

            el.innerHTML = `
                <span class="status-dot ${dotClass}"></span>
                <span class="status-text">${displayStatus}</span>
            `;
            return isOpen || isPreOpen;
        };

        // 1. Initial Fetch (REST)
        fetch('https://marketstatus.onrender.com/market-status')
            .then(res => res.json())
            .then(data => {
                const isOpen = updateUI(data);

                // 2. Only connect WebSocket for live updates if market is open or pre-open
                if (isOpen) {
                    const connectWS = () => {
                        const ws = new WebSocket('wss://marketstatus.onrender.com/ws/market-status');

                        ws.onmessage = (event) => {
                            try {
                                const wsData = JSON.parse(event.data);
                                if (wsData.status) updateUI(wsData.status);
                            } catch (e) {
                                updateUI(event.data);
                            }
                        };

                        ws.onclose = () => {
                            // Reconnect after 5 seconds if connection lost
                            setTimeout(connectWS, 5000);
                        };
                    };

                    connectWS();
                }
            })
            .catch(err => console.error('Market status fetch failed:', err));
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
                    const filteredData = rawData.filter(item => {
                        const timestamp = item[0];
                        const d = new Date(timestamp * 1000);
                        const nptTime = d.toLocaleTimeString('en-US', {
                            timeZone: 'Asia/Kathmandu',
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: false
                        });
                        return nptTime >= '10:55' && nptTime <= '15:05';
                    });

                    labels = filteredData.map(item => {
                        const d = new Date(item[0] * 1000);
                        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
                    });
                    prices = filteredData.map(item => parseFloat(item[1] || 0));
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
                    imgEl.src = getStockImageUrl(stock.symbol, prefix, stock.name);
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

    initQuickCalc() {
        if (document.getElementById('quick-calc-drawer')) return;

        // Create elements
        const trigger = document.createElement('button');
        trigger.id = 'quick-calc-trigger';
        trigger.className = 'quick-calc-trigger-btn';
        trigger.title = 'Quick Calculator';
        trigger.innerHTML = '<i class="fas fa-calculator"></i>';

        const drawer = document.createElement('div');
        drawer.id = 'quick-calc-drawer';
        drawer.className = 'quick-calc-drawer glass';
        
        drawer.innerHTML = `
            <div class="qc-header">
                <div class="qc-title-row">
                    <h3><i class="fas fa-calculator"></i> Quick Calc</h3>
                    <button id="close-quick-calc" class="btn-icon"><i class="fas fa-times"></i></button>
                </div>
                <div class="qc-mode-toggle">
                    <button id="qc-btn-buy" class="qc-toggle-btn active" data-mode="buy">BUY</button>
                    <button id="qc-btn-sell" class="qc-toggle-btn" data-mode="sell">SELL</button>
                </div>
            </div>
            <div class="qc-content">
                <div class="form-group qc-autocomplete-container">
                    <label>Symbol</label>
                    <input type="text" id="qc-symbol" placeholder="Search Symbol (e.g. NICA)" autocomplete="off" style="width: 100%;" />
                    <div id="qc-autocomplete-list" class="qc-autocomplete-list qc-hidden"></div>
                </div>
                <div class="form-group">
                    <label>Price (Rs.)</label>
                    <input type="number" id="qc-price" placeholder="e.g. 500" style="width: 100%;" />
                </div>
                <div class="form-group">
                    <label>Quantity</label>
                    <input type="number" id="qc-qty" placeholder="e.g. 100" style="width: 100%;" />
                </div>
                <div id="qc-wacc-group" class="form-group qc-hidden">
                    <label>WACC / Cost Price (Rs.)</label>
                    <input type="number" id="qc-wacc" placeholder="e.g. 480" style="width: 100%;" />
                </div>
                <div id="qc-results" class="qc-results-panel">
                    <div style="color: var(--text-secondary); text-align: center; padding-top: 1rem; font-size: 0.85rem;">Enter price and quantity to calculate</div>
                </div>
            </div>
            <div class="qc-footer">
                <a id="qc-full-calc-link" href="#" target="_blank">Open Full Calculator <i class="fas fa-external-link-alt"></i></a>
            </div>
        `;

        document.body.appendChild(trigger);
        document.body.appendChild(drawer);

        let activeMode = 'buy';

        // Dom query helpers
        const symbolInput = document.getElementById('qc-symbol');
        const listEl = document.getElementById('qc-autocomplete-list');
        const priceInput = document.getElementById('qc-price');
        const qtyInput = document.getElementById('qc-qty');
        const waccGroup = document.getElementById('qc-wacc-group');
        const waccInput = document.getElementById('qc-wacc');
        const resultsEl = document.getElementById('qc-results');
        const buyBtn = document.getElementById('qc-btn-buy');
        const sellBtn = document.getElementById('qc-btn-sell');
        const closeBtn = document.getElementById('close-quick-calc');
        const fullCalcLink = document.getElementById('qc-full-calc-link');

        // Toggle Drawer
        trigger.onclick = (e) => {
            e.stopPropagation();
            drawer.classList.toggle('active');
            // Hide other panels
            document.getElementById('quick-view-panel')?.classList.remove('active');
            document.getElementById('notif-dropdown')?.classList.add('hidden');
            document.getElementById('profile-dropdown')?.classList.add('hidden');
        };

        closeBtn.onclick = () => {
            drawer.classList.remove('active');
        };

        // Close on escape or clicking outside
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') drawer.classList.remove('active');
        });

        document.addEventListener('click', (e) => {
            if (!drawer.contains(e.target) && !trigger.contains(e.target)) {
                drawer.classList.remove('active');
            }
            if (listEl && !symbolInput.contains(e.target) && !listEl.contains(e.target)) {
                listEl.classList.add('qc-hidden');
            }
        });

        // Autocomplete
        symbolInput.oninput = async () => {
            const query = symbolInput.value.toUpperCase().trim();
            if (!query) {
                listEl.classList.add('qc-hidden');
                listEl.innerHTML = '';
                return;
            }

            try {
                let stocks = globalState.getState().stocks;
                if (!stocks || !Array.isArray(stocks) || stocks.length === 0) {
                    stocks = await DataService.getStocks();
                }
                const matches = stocks.filter(s => 
                    s.symbol.toUpperCase().includes(query) || 
                    (s.name && s.name.toUpperCase().includes(query))
                ).slice(0, 5);

                if (matches.length === 0) {
                    listEl.innerHTML = '<div style="padding: 10px; color: var(--text-secondary); text-align: center; font-size: 0.8rem;">No match</div>';
                    listEl.classList.remove('qc-hidden');
                    return;
                }

                listEl.innerHTML = matches.map(s => `
                    <div class="qc-autocomplete-item" data-symbol="${s.symbol}" data-price="${s.price || 0}">
                        <div style="display: flex; flex-direction: column;">
                            <span class="qc-item-symbol">${s.symbol}</span>
                            <span class="qc-item-name">${s.name || ''}</span>
                        </div>
                        <span class="qc-item-price">Rs. ${(s.price || 0).toLocaleString()}</span>
                    </div>
                `).join('');
                listEl.classList.remove('qc-hidden');

                // Bind click events on items
                listEl.querySelectorAll('.qc-autocomplete-item').forEach(item => {
                    item.onclick = () => {
                        const sym = item.dataset.symbol;
                        const prc = parseFloat(item.dataset.price) || 0;
                        symbolInput.value = sym;
                        priceInput.value = prc;
                        
                        // Prefill WACC if in sell mode and symbol in portfolio
                        if (activeMode === 'sell') {
                            const portfolio = globalState.getState().portfolio || [];
                            const holding = portfolio.find(p => p.symbol.toUpperCase() === sym.toUpperCase());
                            if (holding && holding.wacc) {
                                waccInput.value = parseFloat(holding.wacc).toFixed(4);
                            } else {
                                waccInput.value = '';
                            }
                        }

                        listEl.classList.add('qc-hidden');
                        calculate();
                    };
                });

            } catch (err) {
                console.error("Quick calc search failed:", err);
            }
        };

        // Mode Toggles
        buyBtn.onclick = () => {
            activeMode = 'buy';
            buyBtn.classList.add('active');
            sellBtn.classList.remove('active');
            waccGroup.classList.add('qc-hidden');
            calculate();
        };

        sellBtn.onclick = () => {
            activeMode = 'sell';
            sellBtn.classList.add('active');
            buyBtn.classList.remove('active');
            waccGroup.classList.remove('qc-hidden');
            
            // Try pre-filling WACC if a symbol is already selected
            const sym = symbolInput.value.toUpperCase().trim();
            if (sym) {
                const portfolio = globalState.getState().portfolio || [];
                const holding = portfolio.find(p => p.symbol.toUpperCase() === sym.toUpperCase());
                if (holding && holding.wacc) {
                    waccInput.value = parseFloat(holding.wacc).toFixed(4);
                }
            }
            calculate();
        };

        // Inputs change triggers
        [priceInput, qtyInput, waccInput].forEach(inp => {
            inp.oninput = () => calculate();
        });

        // Calculation Function
        const calculate = () => {
            const price = parseFloat(priceInput.value) || 0;
            const qty = parseFloat(qtyInput.value) || 0;

            // Update Full Calculator Link
            const prefix = globalState.getState().pathPrefix || '';
            const sym = symbolInput.value.toUpperCase().trim();
            fullCalcLink.href = `${prefix}pages/calculator/buy-sell.html?symbol=${sym}&price=${price}&qty=${qty}`;

            if (price <= 0 || qty <= 0) {
                resultsEl.innerHTML = '<div style="color: var(--text-secondary); text-align: center; padding-top: 1rem; font-size: 0.85rem;">Enter price and quantity to calculate</div>';
                return;
            }

            if (activeMode === 'buy') {
                const res = FeeService.calculateBuy(price, qty);
                resultsEl.innerHTML = `
                    <div class="qc-result-row">
                        <span>Share Amount:</span>
                        <span>Rs. ${res.purchaseAmount.toLocaleString('en-IN', {minimumFractionDigits: 2})}</span>
                    </div>
                    <div class="qc-result-row">
                        <span>Broker Commission:</span>
                        <span>Rs. ${res.brokerCommission.toLocaleString('en-IN', {minimumFractionDigits: 2})}</span>
                    </div>
                    <div class="qc-result-row">
                        <span>SEBON Fee:</span>
                        <span>Rs. ${res.sebonFee.toLocaleString('en-IN', {minimumFractionDigits: 2})}</span>
                    </div>
                    <div class="qc-result-row">
                        <span>DP Charge:</span>
                        <span>Rs. ${res.dpCharge.toLocaleString('en-IN', {minimumFractionDigits: 2})}</span>
                    </div>
                    <div class="qc-result-row total-row">
                        <span>Total Cost:</span>
                        <span class="negative">Rs. ${res.totalCost.toLocaleString('en-IN', {minimumFractionDigits: 2})}</span>
                    </div>
                    <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.5rem; text-align: right;">
                        Effective WACC: Rs. ${res.wacc.toFixed(2)}
                    </div>
                `;
            } else {
                const wacc = parseFloat(waccInput.value) || price; // fallback to price if WACC empty
                const res = FeeService.calculateSell(price, qty, wacc);
                const profitColor = res.totalProfit >= 0 ? 'positive' : 'negative';
                const profitClass = res.totalProfit >= 0 ? 'profit-positive' : 'profit-negative';
                
                resultsEl.innerHTML = `
                    <div class="qc-result-row">
                        <span>Share Amount:</span>
                        <span>Rs. ${res.salesAmount.toLocaleString('en-IN', {minimumFractionDigits: 2})}</span>
                    </div>
                    <div class="qc-result-row">
                        <span>Broker Commission:</span>
                        <span>Rs. ${res.brokerCommission.toLocaleString('en-IN', {minimumFractionDigits: 2})}</span>
                    </div>
                    <div class="qc-result-row">
                        <span>SEBON Fee:</span>
                        <span>Rs. ${res.sebonFee.toLocaleString('en-IN', {minimumFractionDigits: 2})}</span>
                    </div>
                    <div class="qc-result-row">
                        <span>DP Charge:</span>
                        <span>Rs. ${res.dpCharge.toLocaleString('en-IN', {minimumFractionDigits: 2})}</span>
                    </div>
                    <div class="qc-result-row">
                        <span>Capital Gain Tax (7.5%):</span>
                        <span>Rs. ${res.cgt.toLocaleString('en-IN', {minimumFractionDigits: 2})}</span>
                    </div>
                    <div class="qc-result-row total-row">
                        <span>Receivable:</span>
                        <span class="positive">Rs. ${res.netReceivable.toLocaleString('en-IN', {minimumFractionDigits: 2})}</span>
                    </div>
                    <div class="qc-result-row profit-row ${profitClass}">
                        <span style="font-size: 0.75rem; color: var(--text-secondary);">Net Profit / Loss</span>
                        <span style="font-size: 1.1rem; font-weight: 800;" class="${profitColor}">
                            Rs. ${res.totalProfit.toLocaleString('en-IN', {minimumFractionDigits: 2})}
                        </span>
                    </div>
                `;
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

            // Close sidebar when tapping outside
            const sidebar = document.getElementById('sidebar');
            if (sidebar && sidebar.classList.contains('active')) {
                if (!sidebar.contains(e.target) && !e.target.closest('#burgerMenu')) {
                    sidebar.classList.remove('active');
                }
            }

            const sidebarToggle = e.target.closest('.sidebar-dropdown-toggle');
            if (sidebarToggle) {
                const wrapper = sidebarToggle.closest('.nav-item-wrapper');
                if (wrapper) {
                    wrapper.classList.toggle('expanded');
                }
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
