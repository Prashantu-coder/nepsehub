/**
 * Data Service - Handles data fetching with simulated delay
 */
import StorageService from './storageService.js';

const DataService = {
    async getStocks() {
        // Check if we have modified stocks in storage first (Admin panel changes)
        const localStocks = StorageService.load('nepse_stocks');
        if (localStocks) return localStocks;

        // Otherwise fetch from mock JSON
        return this._fetchWithDelay('/data/mockStocks.json');
    },

    async getNews() {
        const localNews = StorageService.load('nepse_news');
        if (localNews) return localNews;

        return this._fetchWithDelay('/data/mockNews.json');
    },

    // Proxy Backend URL
    API_BASE: 'https://nepse-live-api-bbv6.onrender.com',

    async getLiveMarket() {
        try {
            const response = await fetch(`${this.API_BASE}/api`);
            if (!response.ok) throw new Error('Network response was not ok');
            const rawData = await response.json();
            
            // Normalize data fields to match our components
            return rawData.map(s => ({
                symbol:          s.symbol,
                name:            s.securityName,
                price:           parseFloat(s.lastTradedPrice) || 0,
                ltq:             parseFloat(s.lastTradedVolume) || 0, // Last Traded Quantity
                change:          parseFloat(s.change) || 0,
                changePercent:   parseFloat(s.percentageChange) || 0,
                previousClose:   parseFloat(s.previousClose) || 0,
                sector:          s.sector,
                volume:          parseFloat(s.totalTradeQuantity) || 0, // TTQ
                high:            parseFloat(s.highPrice) || 0,
                low:             parseFloat(s.lowPrice) || 0,
                open:            parseFloat(s.openPrice) || 0,
                lastUpdated:     s.lastUpdatedDateTime
            }));
        } catch (error) {
            console.error('Failed to fetch live market data:', error);
            return [];
        }
    },

    async getIPOData(page = 1, size = 20) {
        try {
            const url = `${this.API_BASE}/ipo?page=${page}&size=${size}`;
            const response = await fetch(url);
            if (!response.ok) throw new Error('Network response was not ok');
            return await response.json();
        } catch (error) {
            console.error('Failed to fetch IPO data:', error);
            return null;
        }
    },

    async _fetchWithDelay(url) {
        return new Promise((resolve) => {
            setTimeout(async () => {
                const response = await fetch(url);
                const data = await response.json();
                resolve(data);
            }, 500); // 500ms simulated delay
        });
    }
};

export default DataService;
