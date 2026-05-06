import globalState from './state.js';
import StorageService from '../services/storageService.js';
import DataService from '../services/dataService.js';
import { Sidebar } from '../components/sidebar.js';
import { Navbar } from '../components/navbar.js';

export const Layout = {
    async init() {
        // Detect active page and path depth
        const path = window.location.pathname;
        const segments = path.split('/').filter(p => p && !p.endsWith('.html') && p !== 'NEPSE%20HUB');
        // Note: 'NEPSE%20HUB' might be part of the path if opened via file system or specific server setup.
        // Let's use a simpler way: check how many '../' we need to get to root.
        
        // Count how many directories deep we are relative to index.html
        // We expect: root, pages/, or pages/calculator/, or pages/trade/
        let prefix = '';
        if (path.includes('/pages/calculator/') || path.includes('/pages/trade/')) {
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
        const savedPortfolio = StorageService.load('nepse_portfolio') || [];
        const savedWatchlist = StorageService.load('nepse_watchlist') || [];
        
        globalState.setState({ 
            theme: 'dark',
            portfolio: savedPortfolio,
            watchlist: savedWatchlist
        });

        document.documentElement.setAttribute('data-theme', 'dark');

        // Render Components
        this.renderComponents();
        this.bindEvents();

        // Load dynamic data
        try {
            const [stocks, news] = await Promise.all([
                DataService.getStocks(),
                DataService.getNews()
            ]);
            globalState.setState({ stocks, news });
        } catch (error) {
            console.error('Data load failed:', error);
        }
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
