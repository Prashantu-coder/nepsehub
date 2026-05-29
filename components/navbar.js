import globalState from '../js/state.js';

export const Navbar = () => {
    const { theme, activePage, pathPrefix } = globalState.getState();
    const p = pathPrefix || '';

    const menuItems = [
        { id: 'index', icon: 'fa-th-large', text: 'Dashboard', path: 'index.html' },
        {
            id: 'workspace',
            icon: 'fa-user-circle',
            text: 'Workspace',
            children: [
                { id: 'portfolio', text: 'My Portfolio', icon: 'fa-briefcase', path: 'pages/portfolio.html' },
                { id: 'watchlist', text: 'Watchlist', icon: 'fa-heart', path: 'pages/watchlist.html' }
            ]
        },
        {
            id: 'market',
            icon: 'fa-chart-bar',
            text: 'NEPSE',
            children: [
                { id: 'live-market', text: 'Live Market', icon: 'fa-broadcast-tower', path: 'pages/market/live.html' },
                { id: 'stocks-today', text: 'Stocks Today', icon: 'fa-chart-line', path: 'pages/market/stocks-today.html' },
                { id: 'news', text: 'Announcements', icon: 'fa-bullhorn', path: 'pages/news.html' }
            ]
        },
        {
            id: 'analysis',
            icon: 'fa-chart-pie',
            text: 'Analysis',
            children: [
                { id: 'screener', text: 'Technical Screener', icon: 'fa-robot', path: 'pages/market/screener.html' },
                { id: 'heatmap', text: 'Market Heatmap', icon: 'fa-th', path: 'pages/market/heatmap.html' },
                { id: 'todays-top', text: "Today's Top", icon: 'fa-crown', path: 'pages/market/todays-top.html' },
                { id: 'circuit-level', text: 'Daily Circuit Level', icon: 'fa-bolt', path: 'pages/market/circuit-level.html' }
            ]
        },
        {
            id: 'tools',
            icon: 'fa-cubes',
            text: 'Investment',
            children: [
                { id: 'ipo-tracker', text: 'Upcoming/Existing Issues', icon: 'fa-rocket', path: 'pages/market/ipo-tracker.html' }
            ]
        },
        {
            id: 'calculator',
            icon: 'fa-tools',
            text: 'Calculator',
            children: [
                { id: 'buy-sell', text: 'Buy/Sell Calculator', icon: 'fa-calculator', path: 'pages/calculator/buy-sell.html' },
                { id: 'position-sizing', text: 'Position Sizing', icon: 'fa-chart-pie', path: 'pages/calculator/position-sizing.html' },
                { id: 'average', text: 'Average Price (DCA)', icon: 'fa-layer-group', path: 'pages/calculator/average.html' },
                { id: 'breakeven', text: 'Break-even Calculator', icon: 'fa-balance-scale', path: 'pages/calculator/breakeven.html' },
                { id: 'dividend', text: 'Dividend Yield & Return', icon: 'fa-hand-holding-usd', path: 'pages/calculator/dividend.html' },
                { id: 'planner', text: 'Trade Planner', icon: 'fa-pen-nib', path: 'pages/calculator/planner.html' },
                { id: 'exit-strategy', text: 'Exit Strategy', icon: 'fa-sign-out-alt', path: 'pages/calculator/exit-strategy.html' }
            ]
        }
    ];

    return `
        <nav class="navbar glass fade-in">
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

            <div class="nav-actions" style="display: flex; gap: 1rem">
                <!-- Global Stock Search Input -->
                <div class="nav-search-wrapper pc-only" style="position: relative; width: 320px; z-index: 1000;">
                    <div style="position: relative; width: 100%; padding: 0.5rem 0rem 0.5rem 0rem;">
                        <i class="fas fa-search" style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--text-secondary); font-size: 0.82rem; pointer-events: none;"></i>
                        <input type="text" id="nav-global-search" placeholder="Quick stock search..." 
                               style="width: 100%; padding: 8px 12px 8px 34px; border-radius: 20px; border: 1px solid rgba(255, 255, 255, 0.08); background: rgba(255, 255, 255, 0.04); color: #fff; font-size: 0.8rem; outline: none; transition: all 0.3s;" />
                    </div>
                    <div id="nav-search-results" class="glass" style="display: none; position: absolute; top: calc(100% + 8px); left: 0; right: 0; background: rgba(22, 28, 45, 0.98); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.5); max-height: 280px; overflow-y: auto; padding: 0.5rem 0;"></div>
                </div>
            </div>
        </nav>
    `;
};
