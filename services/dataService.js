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
