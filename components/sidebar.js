import globalState from '../js/state.js';

export const Sidebar = () => {
    const { activePage, pathPrefix } = globalState.getState();
    const p = pathPrefix || '';

    const menuItems = [
        { id: 'index', icon: 'fa-th-large', text: 'Dashboard', path: 'index.html' },
        { id: 'portfolio', icon: 'fa-briefcase', text: 'Portfolio', path: 'pages/portfolio.html' },
        { id: 'watchlist', icon: 'fa-heart', text: 'Watchlist', path: 'pages/watchlist.html' },
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
                    <i class="fas fa-chart-line"></i>
                    <span class="logo-text">NEPSE HUB</span>
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

            <div class="sidebar-footer" style="margin-top: auto; padding: 2rem; border-top: 1px solid var(--surface-border);">
                <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem;">
                    <img src="https://ui-avatars.com/api/?name=Admin&background=6366f1&color=fff" alt="User" style="width: 40px; height: 40px; border-radius: 50%;">
                    <div>
                        <div style="font-weight: 600;">Admin</div>
                        <div style="font-size: 0.75rem; color: var(--text-secondary);">Premium Account</div>
                    </div>
                </div>
            </div>
        </aside>
    `;
};
