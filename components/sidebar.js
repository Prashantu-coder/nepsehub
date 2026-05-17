import globalState from '../js/state.js';

export const Sidebar = () => {
    const { activePage, pathPrefix } = globalState.getState();
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
        <aside class="sidebar" id="sidebar">
            <div class="logo" style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                    <i class="fas fa-chart-line text-gradient"></i>
                    <span class="logo-text text-gradient">NEPSE HUB</span>
                </div>
                <button id="closeSidebar" class="btn-icon" style="background: none; border: none; color: var(--text-secondary); font-size: 1.25rem; cursor: pointer;">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            
            <ul class="nav-menu" style="padding-top: 1rem;">
                ${menuItems.map(item => {
                    if (item.children) {
                        return `
                            <li class="nav-item-wrapper">
                                <div class="nav-item" style="cursor: default;">
                                    <i class="fas ${item.icon} nav-icon"></i>
                                    <span class="nav-text">${item.text}</span>
                                </div>
                                <ul class="sidebar-submenu">
                                    ${item.children.map(child => `
                                        <li>
                                            <a href="${p}${child.path}" class="nav-item ${activePage === child.id ? 'active' : ''}">
                                                <i class="fas ${child.icon} nav-icon" style="font-size: 1rem;"></i>
                                                <span class="nav-text">${child.text}</span>
                                            </a>
                                        </li>
                                    `).join('')}
                                </ul>
                            </li>
                        `;
                    }
                    return `
                        <li class="nav-item-wrapper">
                            <a href="${p}${item.path}" class="nav-item ${activePage === item.id ? 'active' : ''}">
                                <i class="fas ${item.icon} nav-icon"></i>
                                <span class="nav-text">${item.text}</span>
                            </a>
                        </li>
                    `;
                }).join('')}
            </ul>

        </aside>
    `;
};
