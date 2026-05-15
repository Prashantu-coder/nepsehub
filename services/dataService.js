/**
 * Data Service - Handles data fetching with simulated delay
 */
import StorageService from './storageService.js';

const DataService = {
    async getStocks() {
        // Check if we have modified stocks in storage first (Admin panel changes)
        const localStocks = StorageService.load('nepse_stocks');
        if (localStocks) return localStocks;

        // Fetch from live market API
        return this.getLiveMarket();
    },

    async getNews() {
        try {
            const rawAnnouncements = await this.getAnnouncements();
            if (!rawAnnouncements || rawAnnouncements.length === 0) {
                // Fallback to mock if API fails
                return this._fetchWithDelay('/data/mockNews.json');
            }
            
            // Normalize to frontend news structure
            return rawAnnouncements.map(item => ({
                id: item.id,
                symbol: item.symbol || "N/A",
                title: item.title || item.subTitle || item.subject || "Announcement",
                date: item.announcementDate || item.date || item.publishedDate || new Date().toLocaleDateString(),
                summary: item.details || item.summary || item.content || "Click to view details regarding this corporate announcement.",
                url: item.url || item.newsUrl || "#",
                attachment: item.attachmentUrl || null
            }));
        } catch (error) {
            console.error("News fetch failed:", error);
            return this._fetchWithDelay('/data/mockNews.json');
        }
    },

    // ... (rest of the file remains same, but I'll update getAnnouncements below)
    async getAnnouncements() {
        try {
            const endpoint = `${this.API_BASE}/market-info/announcements`;
            console.log(`📡 Fetching announcements from: ${endpoint}`);
            const response = await fetch(endpoint);
            if (!response.ok) return [];
            const result = await response.json();
            
            // Handle multiple professional schemas
            let data = result;
            if (result.success && result.data) {
                data = result.data.content || result.data;
            } else if (result.content) {
                data = result.content;
            }
            
            return Array.isArray(data) ? data : [];
        } catch (error) {
            console.error('❌ Announcements Fetch Error:', error);
            return [];
        }
    },

    // Professional Backend URL (Update this to your Render URL after deployment)
    API_BASE: 'https://nepse-hub-backend.onrender.com', // Keeping old one as placeholder for now

    async getLiveMarket() {
        try {
            const endpoint = `${this.API_BASE}/core/homepage-data`;
            console.log(`📡 Fetching market from: ${endpoint}`);
            
            const response = await fetch(endpoint);
            if (!response.ok) {
                console.error(`❌ API Error: ${response.status} ${response.statusText}`);
                return [];
            }
            
            const result = await response.json();
            console.log("📥 API Response Received:", result);
            
            // Handle Mega-Object from ShareHub (find the stock list)
            let rawData = [];
            if (Array.isArray(result)) {
                rawData = result;
            } else if (result.success && Array.isArray(result.data)) {
                rawData = result.data;
            } else if (result.stockSummary && Array.isArray(result.stockSummary.data)) {
                // ShareHub's common nested structure
                rawData = result.stockSummary.data;
            } else if (result.data && Array.isArray(result.data.data)) {
                rawData = result.data.data;
            } else if (Array.isArray(result.data)) {
                rawData = result.data;
            } else {
                // Fallback: search for any array with > 100 items (likely the stock list)
                const possibleKey = Object.keys(result).find(k => Array.isArray(result[k]) && result[k].length > 50);
                if (possibleKey) {
                    console.log(`🔍 Found potential stock list in key: ${possibleKey}`);
                    rawData = result[possibleKey];
                } else {
                    console.warn("⚠️ Could not find a stock list array in the API response:", result);
                    return [];
                }
            }

            return rawData.map(s => {
                // Robust key detection
                const price = s.lastTradedPrice || s.price || s.lastPrice || s.ltp || 0;
                const change = s.change || s.priceChange || 0;
                const changePercent = s.percentageChange || s.changePercent || s.percentChange || 0;
                const volume = s.totalTradeQuantity || s.volume || s.totalQty || 0;
                const turnover = s.totalTradeValue || s.turnover || s.totalTurnover || 0;
                const high = s.highPrice || s.high || s.maxPrice || 0;
                const low = s.lowPrice || s.low || s.minPrice || 0;
                const open = s.openPrice || s.open || 0;
                const name = s.securityName || s.name || s.companyName || s.symbol;

                return {
                    symbol: (s.symbol || s.securitySymbol || "").toUpperCase(),
                    name: name,
                    price: parseFloat(price) || 0,
                    ltq: parseFloat(s.lastTradedVolume || s.ltq || 0),
                    change: parseFloat(change) || 0,
                    changePercent: parseFloat(changePercent) || 0,
                    previousClose: parseFloat(s.previousClose || s.prevClose || 0),
                    sector: s.sector || s.sectorName || "Other",
                    volume: parseFloat(volume) || 0,
                    turnover: parseFloat(turnover) || 0,
                    high: parseFloat(high) || 0,
                    low: parseFloat(low) || 0,
                    open: parseFloat(open) || 0,
                    lastUpdated: s.lastUpdatedDateTime || s.lastUpdated || s.updatedAt
                };
            });
        } catch (error) {
            console.error('❌ Critical Fetch Error:', error);
            return [];
        }
    },

    async getMarketSummary() {
        try {
            const endpoint = `${this.API_BASE}/core/market-turnover`;
            console.log(`📡 Fetching summary from: ${endpoint}`);
            
            const response = await fetch(endpoint);
            if (!response.ok) {
                console.error(`❌ Summary API Error: ${response.status}`);
                return null;
            }
            
            const result = await response.json();
            console.log("📥 Summary Response Received:", result);
            return result.success ? result.data : result;
        } catch (error) {
            console.error('❌ Summary Fetch Error:', error);
            return null;
        }
    },

    async getIndices() {
        try {
            const response = await fetch(`${this.API_BASE}/core/index-live`);
            if (!response.ok) throw new Error('Network response was not ok');
            return await response.json();
        } catch (error) {
            console.error('Failed to fetch indices:', error);
            return null;
        }
    },

    async getSectorIndices() {
        try {
            const response = await fetch(`${this.API_BASE}/core/subindex-live`);
            if (!response.ok) throw new Error('Network response was not ok');
            return await response.json();
        } catch (error) {
            console.error('Failed to fetch sector indices:', error);
            return [];
        }
    },

    async getFloorsheetSummary() {
        try {
            const response = await fetch(`${this.API_BASE}/core/floorsheet/totals`);
            if (!response.ok) throw new Error('Network response was not ok');
            const result = await response.json();
            return result.success ? result.data : result;
        } catch (error) {
            console.error('Failed to fetch floorsheet summary:', error);
            return null;
        }
    },

    async getIPOs() {
        try {
            const endpoint = `${this.API_BASE}/market-info/ipo/general`;
            console.log(`📡 Fetching IPOs from: ${endpoint}`);
            const response = await fetch(endpoint);
            if (!response.ok) return [];
            const result = await response.json();
            
            // Handle nested content structure (result.data.content)
            let rawData = [];
            if (result.success && result.data) {
                rawData = result.data.content || result.data;
            } else {
                rawData = result;
            }
            
            return Array.isArray(rawData) ? rawData : [];
        } catch (error) {
            console.error('❌ IPO Fetch Error:', error);
            return [];
        }
    },


    // --- Technical Analysis Service ---
    async getTechnicalMACD() {
        try {
            const endpoint = `${this.API_BASE}/technical/macd/all`;
            const response = await fetch(endpoint);
            if (!response.ok) return [];
            const result = await response.json();
            return result.success ? result.data : result;
        } catch (error) {
            console.error('❌ MACD Fetch Error:', error);
            return [];
        }
    },

    async getTechnicalRSI() {
        try {
            const endpoint = `${this.API_BASE}/technical/rsi/all`;
            const response = await fetch(endpoint);
            if (!response.ok) return [];
            const result = await response.json();
            return result.success ? result.data : result;
        } catch (error) {
            console.error('❌ RSI Fetch Error:', error);
            return [];
        }
    },

    async getTechnicalBollinger() {
        try {
            const endpoint = `${this.API_BASE}/technical/bollinger/all`;
            const response = await fetch(endpoint);
            if (!response.ok) return [];
            const result = await response.json();
            return result.success ? result.data : result;
        } catch (error) {
            console.error('❌ Bollinger Fetch Error:', error);
            return [];
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
