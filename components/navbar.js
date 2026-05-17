import globalState from '../js/state.js';

export const Navbar = () => {
    const { theme, activePage, pathPrefix } = globalState.getState();
    const p = pathPrefix || '';

    const menuItems = [
        { id: 'index', icon: 'fa-th-large', text: 'Dashboard', path: 'index.html' },
        { id: 'portfolio', icon: 'fa-briefcase', text: 'Portfolio', path: 'pages/portfolio.html' },
        { id: 'watchlist', icon: 'fa-heart', text: 'Watchlist', path: 'pages/watchlist.html' },
        { 
            id: 'market', 
            icon: 'fa-chart-bar', 
            text: 'Market',
            children: [
                { id: 'live-market', text: 'Live Market', icon: 'fa-broadcast-tower', path: 'pages/market/live.html' },
                { id: 'heatmap', text: 'Market Heatmap', icon: 'fa-th', path: 'pages/market/heatmap.html' },
                { id: 'ipo-tracker', text: 'IPO Tracker', icon: 'fa-rocket', path: 'pages/market/ipo-tracker.html' },
                { id: 'screener', text: 'Technical Screener', icon: 'fa-robot', path: 'pages/market/screener.html' }
            ]
        },
        { id: 'news', icon: 'fa-newspaper', text: 'Market News', path: 'pages/news.html' },
        { 
            id: 'calculator', 
            icon: 'fa-tools', 
            text: 'Calculator',
            children: [
                { id: 'buy-sell', text: 'Buy/Sell Calculator', icon: 'fa-calculator', path: 'pages/calculator/buy-sell.html' },
                { id: 'position-sizing', text: 'Position Sizing', icon: 'fa-chart-pie', path: 'pages/calculator/position-sizing.html' },
                { id: 'average', text: 'Average Price (DCA)', icon: 'fa-layer-group', path: 'pages/calculator/average.html' },
                { id: 'breakeven', text: 'Break-even Calculator', icon: 'fa-balance-scale', path: 'pages/calculator/breakeven.html' },
                { id: 'dividend', text: 'Dividend Yield & Return', icon: 'fa-hand-holding-usd', path: 'pages/calculator/dividend.html' }
            ]
        },
        { 
            id: 'trade', 
            icon: 'fa-exchange-alt', 
            text: 'Trade',
            children: [
                { id: 'planner', text: 'Trade Planner', icon: 'fa-pen-nib', path: 'pages/trade/planner.html' },
                { id: 'exit-strategy', text: 'Exit Strategy', icon: 'fa-sign-out-alt', path: 'pages/trade/exit-strategy.html' }
            ]
        }
    ];

    return `
        <nav class="navbar glass fade-in">
            <div style="display: flex; align-items: center; gap: 1.5rem;">
                <div id="burgerMenu" class="burger-menu">
                    <i class="fas fa-bars"></i>
                </div>
                
                <div class="logo">
                    <i class="fas fa-chart-line"></i>
                    <span class="logo-text">NEPSE HUB</span>
                </div>
            </div>

            <ul class="navbar-menu">
                ${menuItems.map(item => {
                    if (item.children) {
                        const isActive = item.children.some(c => c.id === activePage);
                        return `
                            <li class="nav-dropdown">
                                <a href="#" class="nav-link ${isActive ? 'active' : ''}" onclick="return false;">
                                    ${item.text} <i class="fas fa-chevron-down" style="font-size: 0.7rem; margin-left: 0.25rem;"></i>
                                </a>
                                <div class="dropdown-menu glass">
                                    ${item.children.map(child => `
                                        <a href="${p}${child.path}" class="dropdown-item ${activePage === child.id ? 'active' : ''}">
                                            <i class="fas ${child.icon}"></i>
                                            ${child.text}
                                        </a>
                                    `).join('')}
                                </div>
                            </li>
                        `;
                    }
                    return `
                        <li>
                            <a href="${p}${item.path}" class="nav-link ${activePage === item.id ? 'active' : ''}">
                                ${item.text}
                            </a>
                        </li>
                    `;
                }).join('')}
            </ul>

            <div class="nav-actions" style="display: flex; gap: 1rem; align-items: center;">
                <div id="market-status" class="market-status pc-only">
                    <!-- Loaded by layout.js -->
                </div>
                
                <!-- Notification Bell -->
                <div class="nav-notification-wrapper">
                    <button id="notification-bell" class="btn-icon">
                        <i class="far fa-bell"></i>
                        <span id="notif-badge" class="notif-badge hidden">0</span>
                    </button>
                    <div id="notif-dropdown" class="notif-dropdown glass hidden">
                        <div class="notif-header">
                            <h5>Notifications</h5>
                            <button id="mark-read-btn">Mark all as read</button>
                        </div>
                        <div id="notif-list" class="notif-list">
                            <div class="notif-empty">No notifications in the last 7 days</div>
                        </div>
                    </div>
                </div>

                <div id="navbar-clock" class="navbar-clock pc-only">
                    <!-- Loaded by layout.js -->
                </div>
            </div>
        </nav>
    `;
};
