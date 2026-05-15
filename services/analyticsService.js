import DataService from './dataService.js';

const AnalyticsService = {
    _cache: {
        data: null,
        timestamp: 0
    },
    CACHE_DURATION: 60 * 1000, // 60 seconds

    async getProcessedMarketData() {
        const now = Date.now();
        
        // Return cached data if valid
        if (this._cache.data && (now - this._cache.timestamp < this.CACHE_DURATION)) {
            return this._cache.data;
        }

        // Fetch fresh data
        const rawData = await DataService.getLiveMarket();
        if (!rawData || rawData.length === 0) return null;

        const processed = {
            all: rawData,
            sentiment: this._calculateSentiment(rawData),
            movers: this._calculateMovers(rawData),
            sectors: this._calculateSectors(rawData)
        };

        // Update cache
        this._cache = {
            data: processed,
            timestamp: now
        };

        return processed;
    },

    _calculateSentiment(data) {
        let adv = 0, dec = 0, unc = 0;
        data.forEach(s => {
            const diff = parseFloat(s.changePercent);
            if (diff > 0) adv++;
            else if (diff < 0) dec++;
            else unc++;
        });
        return { adv, dec, unc, total: data.length };
    },

    _calculateMovers(data) {
        const items = [...data];
        return {
            gainers: [...items].sort((a, b) => parseFloat(b.changePercent) - parseFloat(a.changePercent)).slice(0, 5),
            losers:  [...items].sort((a, b) => parseFloat(a.changePercent) - parseFloat(b.changePercent)).slice(0, 5),
            active:  [...items].sort((a, b) => (parseFloat(b.volume) || 0) - (parseFloat(a.volume) || 0)).slice(0, 5)
        };
    },

    _calculateSectors(data) {
        const sectorMap = {};
        data.forEach(s => {
            if (!s.sector) return;
            if (!sectorMap[s.sector]) {
                sectorMap[s.sector] = { name: s.sector, count: 0, changeSum: 0, stocks: [] };
            }
            sectorMap[s.sector].count++;
            sectorMap[s.sector].changeSum += parseFloat(s.changePercent) || 0;
            sectorMap[s.sector].stocks.push(s);
        });

        return Object.values(sectorMap).map(sec => ({
            ...sec,
            avgChange: sec.changeSum / sec.count
        })).sort((a, b) => b.avgChange - a.avgChange);
    }
};

export default AnalyticsService;
