/**
 * Single source of truth for navbar and sidebar menu items.
 * Import in navbar.js and sidebar.js to keep paths in sync.
 */
export const NAV_MENU_ITEMS = [
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
            { id: 'news', text: 'Announcements', icon: 'fa-bullhorn', path: 'pages/market/news.html' }
        ]
    },
    {
        id: 'analysis',
        icon: 'fa-chart-pie',
        text: 'Analysis',
        children: [
            { id: 'screener', text: 'Technical Screener', icon: 'fa-robot', path: 'pages/analysis/screener.html' },
            { id: 'heatmap', text: 'Market Heatmap', icon: 'fa-th', path: 'pages/analysis/heatmap.html' },
            { id: 'todays-top', text: "Today's Top", icon: 'fa-crown', path: 'pages/analysis/todays-top.html' },
            { id: 'circuit-level', text: 'Daily Circuit Level', icon: 'fa-bolt', path: 'pages/analysis/circuit-level.html' },
            { id: 'volumepulse', text: 'Volume Pulse', icon: 'fa-chart-line', path: 'pages/analysis/volumepulse.html' },
            { id: 'compare', text: 'Stock Compare', icon: 'fa-balance-scale', path: 'pages/analysis/compare.html' }
        ]
    },
    {
        id: 'tools',
        icon: 'fa-cubes',
        text: 'Investment',
        children: [
            { id: 'ipo-tracker', text: 'Upcoming/Existing Issues', icon: 'fa-rocket', path: 'pages/investment/ipo-tracker.html' }
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
            // { id: 'sip-planner', text: 'SIP Planner', icon: 'fa-calendar-check', path: 'pages/calculator/sip-planner.html' },
            { id: 'planner', text: 'Trade Planner', icon: 'fa-pen-nib', path: 'pages/calculator/planner.html' },
            { id: 'exit-strategy', text: 'Exit Strategy', icon: 'fa-sign-out-alt', path: 'pages/calculator/exit-strategy.html' }
        ]
    }
];
