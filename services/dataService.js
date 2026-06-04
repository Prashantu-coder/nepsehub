/**
 * Data Service - Handles data fetching with simulated delay
 */
import StorageService from './storageService.js';

const DataService = {
    async getStockProfile(symbol) {
        try {
            const endpoint = `${this.API_BASE}/stock-profile?symbol=${symbol.toUpperCase()}`;
            console.log(`📡 Fetching stock profile from: ${endpoint}`);
            const response = await fetch(endpoint);
            if (!response.ok) return null;
            return await response.json();
        } catch (error) {
            console.error('❌ Stock Profile Fetch Error:', error);
            return null;
        }
    },

    async getStockReport(symbol) {
        try {
            const endpoint = `${this.API_BASE}/stock-profile/report?symbol=${symbol.toUpperCase()}`;
            console.log(`📡 Fetching stock report from: ${endpoint}`);
            const response = await fetch(endpoint);
            if (!response.ok) return null;
            return await response.json();
        } catch (error) {
            console.error('❌ Stock Report Fetch Error:', error);
            return null;
        }
    },

    async getAlphaBeta(symbol) {
        try {
            const endpoint = `${this.API_BASE}/stock-profile/alpha-beta?symbol=${symbol.toUpperCase()}`;
            console.log(`📡 Fetching alpha-beta ratios from: ${endpoint}`);
            const response = await fetch(endpoint);
            if (!response.ok) return null;
            return await response.json();
        } catch (error) {
            console.error('❌ Alpha Beta Fetch Error:', error);
            return null;
        }
    },

    async getBrokerTopHolding(symbol, days = 1) {
        try {
            const endpoint = `${this.API_BASE}/stock-profile/broker-top-holding?symbol=${symbol.toUpperCase()}&days=${days}`;
            console.log(`📡 Fetching broker top holdings from: ${endpoint}`);
            const response = await fetch(endpoint);
            if (!response.ok) return null;
            return await response.json();
        } catch (error) {
            console.error('❌ Broker Top Holding Fetch Error:', error);
            return null;
        }
    },

    async getStocks() {
        // Check if we have modified stocks in storage first (Admin panel changes)
        const localStocks = await StorageService.load('nepse_stocks');
        if (localStocks) return localStocks;

        // Fetch from live market API
        return await this.getLiveMarket();
    },

    async getNews() {
        try {
            const rawAnnouncements = await this.getAnnouncements();
            if (!rawAnnouncements || rawAnnouncements.length === 0) {
                return [];
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
            return [];
        }
    },

    // ... (rest of the file remains same, but I'll update getAnnouncements below)
    async getAnnouncements() {
        const marketOpen = await this.checkMarketStatus();
        if (!marketOpen && this._announcementsCache) {
            return this._announcementsCache;
        }

        try {
            const endpoint = `${this.API_BASE}/market-info/announcements`;
            // console.log(`📡 Fetching announcements from: ${endpoint}`);
            const response = await fetch(endpoint);
            if (!response.ok) return this._announcementsCache || [];
            const result = await response.json();

            // Handle multiple professional schemas
            let data = result;
            if (result.success && result.data) {
                data = result.data.content || result.data;
            } else if (result.content) {
                data = result.content;
            }

            const parsed = Array.isArray(data) ? data : [];
            this._announcementsCache = parsed;
            return parsed;
        } catch (error) {
            console.error('❌ Announcements Fetch Error:', error);
            return this._announcementsCache || [];
        }
    },

    // Cache/Collapse State fields
    _liveMarketPromise: null,
    _liveMarketCache: null,
    _liveMarketLastFetched: 0,

    _marketSummaryPromise: null,
    _marketSummaryCache: null,
    _marketSummaryLastFetched: 0,

    _indicesPromise: null,
    _indicesCache: null,
    _indicesLastFetched: 0,

    _subindicesPromise: null,
    _subindicesCache: null,
    _subindicesLastFetched: 0,

    _homepageIndicesCache: null,
    _homepageSubindicesCache: null,

    _announcementsCache: null,
    _chartCache: {},
    _isMarketOpen: null,
    _marketStatusCheckedAt: 0,
    _marketStatusPromise: null,

    async checkMarketStatus() {
        const now = Date.now();
        if (this._isMarketOpen !== null && (now - this._marketStatusCheckedAt < 60000)) {
            return this._isMarketOpen;
        }

        if (this._marketStatusPromise) {
            return this._marketStatusPromise;
        }

        this._marketStatusPromise = (async () => {
            try {
                const response = await fetch('https://marketstatus.onrender.com/market-status');
                if (response.ok) {
                    const data = await response.json();
                    if (data && data.status) {
                        this._isMarketOpen = data.status.toLowerCase().includes('open');
                    }
                }
            } catch (e) {
                console.warn('[DataService] Failed to fetch market status:', e);
                if (this._isMarketOpen === null) {
                    this._isMarketOpen = true; // Fallback to true so we don't block requests if status service fails
                }
            } finally {
                this._marketStatusCheckedAt = Date.now();
                this._marketStatusPromise = null;
            }
            return this._isMarketOpen;
        })();

        return this._marketStatusPromise;
    },

    // Professional Backend URL (Update this to your Render URL after deployment)
    API_BASE: 'https://nepsehub-backend.vercel.app',

    async getLiveMarket() {
        const now = Date.now();
        if (this._liveMarketPromise) {
            return this._liveMarketPromise;
        }

        const marketOpen = await this.checkMarketStatus();
        if (!marketOpen && this._liveMarketCache) {
            return this._liveMarketCache;
        }

        if (this._liveMarketCache && (now - this._liveMarketLastFetched < 5000)) {
            return this._liveMarketCache;
        }

        this._liveMarketPromise = (async () => {
            try {
                const endpoint = `${this.API_BASE}/core/live-nepse`;
                // console.log(`📡 Fetching market from: ${endpoint}`);

                const response = await fetch(endpoint);
                if (!response.ok) {
                    console.error(`❌ API Error: ${response.status} ${response.statusText}`);
                    return this._liveMarketCache || [];
                }

                const result = await response.json();
                // console.log("📥 API Response Received:", result);

                if (result.indices && Array.isArray(result.indices)) {
                    this._homepageIndicesCache = result.indices;
                }
                if (result.subIndices && Array.isArray(result.subIndices)) {
                    this._homepageSubindicesCache = result.subIndices;
                }

                let rawData = [];
                if (Array.isArray(result)) {
                    rawData = result;
                } else if (result.success && Array.isArray(result.data)) {
                    rawData = result.data;
                } else if (result.stockSummary && Array.isArray(result.stockSummary.data)) {
                    rawData = result.stockSummary.data;
                } else if (result.data && Array.isArray(result.data.data)) {
                    rawData = result.data.data;
                } else if (Array.isArray(result.data)) {
                    rawData = result.data;
                } else {
                    const possibleKey = Object.keys(result).find(k => Array.isArray(result[k]) && result[k].length > 50);
                    if (possibleKey) {
                        rawData = result[possibleKey];
                    } else {
                        return this._liveMarketCache || [];
                    }
                }

                const mapped = rawData.map(s => {
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

                this._liveMarketCache = mapped;
                this._liveMarketLastFetched = Date.now();
                return mapped;
            } catch (error) {
                console.error('❌ Critical Fetch Error:', error);
                return this._liveMarketCache || [];
            } finally {
                this._liveMarketPromise = null;
            }
        })();

        return this._liveMarketPromise;
    },

    async getMarketSummary() {
        const now = Date.now();
        if (this._marketSummaryPromise) return this._marketSummaryPromise;

        const marketOpen = await this.checkMarketStatus();
        if (!marketOpen && this._marketSummaryCache) {
            return this._marketSummaryCache;
        }

        if (this._marketSummaryCache && (now - this._marketSummaryLastFetched < 1000)) {
            return this._marketSummaryCache;
        }

        this._marketSummaryPromise = (async () => {
            try {
                const endpoint = `${this.API_BASE}/core/market-turnover`;
                // console.log(`📡 Fetching summary from: ${endpoint}`);

                const response = await fetch(endpoint);
                if (!response.ok) {
                    console.error(`❌ Summary API Error: ${response.status}`);
                    return this._marketSummaryCache;
                }

                const result = await response.json();
                // console.log("📥 Summary Response Received:", result);
                const data = result.success ? result.data : result;
                this._marketSummaryCache = data;
                this._marketSummaryLastFetched = Date.now();
                return data;
            } catch (error) {
                console.error('❌ Summary Fetch Error:', error);
                return this._marketSummaryCache;
            } finally {
                this._marketSummaryPromise = null;
            }
        })();

        return this._marketSummaryPromise;
    },

    async getIndices() {
        const now = Date.now();
        if (this._indicesPromise) return this._indicesPromise;

        const marketOpen = await this.checkMarketStatus();
        if (!marketOpen && this._indicesCache) {
            return this._indicesCache;
        }

        if (this._indicesCache && (now - this._indicesLastFetched < 5000)) {
            return this._indicesCache;
        }

        this._indicesPromise = (async () => {
            try {
                const response = await fetch(`${this.API_BASE}/core/index-live`);
                if (!response.ok) throw new Error('Network response was not ok');
                const data = await response.json();
                this._indicesCache = data;
                this._indicesLastFetched = Date.now();
                return data;
            } catch (error) {
                console.error('Failed to fetch indices:', error);
                return this._indicesCache;
            } finally {
                this._indicesPromise = null;
            }
        })();

        return this._indicesPromise;
    },

    async getSectorIndices() {
        const now = Date.now();
        if (this._subindicesPromise) return this._subindicesPromise;

        const marketOpen = await this.checkMarketStatus();
        if (!marketOpen && this._subindicesCache) {
            return this._subindicesCache;
        }

        if (this._subindicesCache && (now - this._subindicesLastFetched < 5000)) {
            return this._subindicesCache;
        }

        this._subindicesPromise = (async () => {
            try {
                const response = await fetch(`${this.API_BASE}/core/subindex-live`);
                if (!response.ok) throw new Error('Network response was not ok');
                const data = await response.json();
                this._subindicesCache = data;
                this._subindicesLastFetched = Date.now();
                return data;
            } catch (error) {
                console.error('Failed to fetch sector indices:', error);
                return this._subindicesCache || [];
            } finally {
                this._subindicesPromise = null;
            }
        })();

        return this._subindicesPromise;
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

    async getIPOs(type = 'ipo/general') {
        try {
            const endpoint = `${this.API_BASE}/market-info/${type}`;
            console.log(`📡 Fetching IPOs (${type}) from: ${endpoint}`);
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
            console.error(`❌ IPO Fetch Error for ${type}:`, error);
            return [];
        }
    },

    async getIndexChart(symbol, period = '1D') {
        const cacheKey = `${symbol}_${period}`;
        const marketOpen = await this.checkMarketStatus();
        if (!marketOpen && this._chartCache && this._chartCache[cacheKey]) {
            return this._chartCache[cacheKey];
        }

        try {
            const upperSymbol = symbol.toUpperCase();
            const isIndex = ['NEPSE', 'SENSITIVE', 'FLOAT', 'SENFLOAT', 'SENSITIVE FLOAT', 'BANKING', 'DEVELOPMENT BANK', 'FINANCE', 'HOTELS AND TOURISM', 'HYDROPOWER', 'INVESTMENT', 'LIFE INSURANCE', 'MANU.& PRO.', 'MICROFINANCE', 'MUTUAL FUND', 'NON LIFE INSURANCE', 'OTHERS', 'TRADING'].includes(upperSymbol) || upperSymbol.includes('INDEX');

            let endpoint;
            if (isIndex && period === '1D') {
                endpoint = `${this.API_BASE}/charts/stock-chart/index/1D/${encodeURIComponent(symbol)}?_t=${Date.now()}`;
            } else {
                const mappedPeriod = period === 'ALL' ? '5Y' : period;
                endpoint = `${this.API_BASE}/charts/stock-chart/${encodeURIComponent(symbol)}?time=${mappedPeriod}&_t=${Date.now()}`;
            }
            const response = await fetch(endpoint);
            if (!response.ok) throw new Error('Network response was not ok');
            const data = await response.json();

            this._chartCache = this._chartCache || {};
            this._chartCache[cacheKey] = data;
            return data;
        } catch (error) {
            console.error(`Failed to fetch chart for ${symbol} with period ${period}:`, error);
            return this._chartCache ? this._chartCache[cacheKey] || null : null;
        }
    },

    _screenerCache: null,
    _screenerCacheTime: 0,

    async getTechnicalIndicators(symbol) {
        const now = Date.now();
        // Return from cache if fresh (5 minutes)
        if (this._screenerCache && (now - this._screenerCacheTime < 300000)) {
            return this._screenerCache.find(item => item.symbol.toUpperCase() === symbol.toUpperCase()) || null;
        }

        try {
            let allResults = [];
            let page = 1;
            let hasMore = true;

            while (hasMore) {
                const response = await fetch(`https://technical-nepse.vercel.app/api/screener/all?page=${page}&limit=50`);
                if (!response.ok) break;
                const data = await response.json();

                if (data.results && data.results.length > 0) {
                    allResults = allResults.concat(data.results);
                }

                const totalPages = data.pagination?.total_pages || 1;
                if (page >= totalPages) {
                    hasMore = false;
                } else {
                    page++;
                }
            }

            this._screenerCache = allResults;
            this._screenerCacheTime = Date.now();
            return allResults.find(item => item.symbol.toUpperCase() === symbol.toUpperCase()) || null;
        } catch (e) {
            console.error('❌ Screener API Fetch Error:', e);
            // Return from stale cache if available
            if (this._screenerCache) {
                return this._screenerCache.find(item => item.symbol.toUpperCase() === symbol.toUpperCase()) || null;
            }
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
    },

    /**
     * Daily close prices for SIP / backtest use.
     * @returns {Promise<Array<{date: string, close: number}>>}
     */
    async getHistoricalCloses(symbol, period = '1Y') {
        try {
            let rawData = await this.getIndexChart(symbol, period);
            if (!rawData) return [];

            if (!Array.isArray(rawData) && Array.isArray(rawData.data)) {
                rawData = rawData.data;
            }
            if (!Array.isArray(rawData) || rawData.length === 0) return [];

            const byDate = new Map();

            if (Array.isArray(rawData[0])) {
                rawData.forEach((item) => {
                    const ts = item[0];
                    const close = parseFloat(item[1] || 0);
                    if (!ts || !close) return;
                    const d = new Date(ts * 1000);
                    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                    byDate.set(key, close);
                });
            } else {
                rawData.forEach((d) => {
                    const timeVal = d.time || d.date || d.tradeDate;
                    const close = parseFloat(d.contractRate || d.price || d.close || d.y || d.value || 0);
                    if (!timeVal || !close) return;
                    let key;
                    if (typeof timeVal === 'number') {
                        const dt = new Date(timeVal * 1000);
                        key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
                    } else {
                        const timeStr = String(timeVal);
                        key = timeStr.includes('T') ? timeStr.split('T')[0] : timeStr.substring(0, 10);
                    }
                    if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
                        byDate.set(key, close);
                    }
                });
            }

            return Array.from(byDate.entries())
                .map(([date, close]) => ({ date, close }))
                .sort((a, b) => a.date.localeCompare(b.date));
        } catch (error) {
            console.error(`Failed to fetch historical closes for ${symbol}:`, error);
            return [];
        }
    },

    getStockLtp(symbol, stocks = []) {
        if (!symbol || !stocks.length) return 0;
        const upper = symbol.toUpperCase();
        const stock = stocks.find(
            (s) => (s.symbol || s.scrip || '').toUpperCase() === upper
        );
        if (!stock) return 0;
        return parseFloat(stock.ltp || stock.price || stock.lastTradedPrice || stock.close || 0) || 0;
    },

    getHomepageIndices() {
        return this._homepageIndicesCache;
    },

    getHomepageSubIndices() {
        return this._homepageSubindicesCache;
    }
};

export default DataService;
