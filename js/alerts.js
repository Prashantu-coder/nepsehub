import globalState from './state.js';
import DataService from '../services/dataService.js';
import NotificationService from '../services/notificationService.js';
import StorageService from '../services/storageService.js';

let alertInterval = null;
const triggeredAlerts = new Set(); // Keep track of alerts sent in current session to avoid spamming

export const AlertManager = {
    init() {
        console.log("Alert Manager Initialized");
        
        // Start checking every 30 seconds
        if (!alertInterval) {
            this.checkAlerts(); // Run once immediately
            alertInterval = setInterval(() => this.checkAlerts(), 30000);
        }
    },

    async checkAlerts() {
        const { watchlist } = globalState.getState();
        if (!watchlist || watchlist.length === 0) return;

        try {
            const marketData = await DataService.getLiveMarket();
            if (!marketData || marketData.length === 0) return;

            watchlist.forEach(item => {
                const liveStock = marketData.find(s => s.symbol.toUpperCase() === item.symbol.toUpperCase());
                if (!liveStock) return;

                const ltp = liveStock.lastTradedPrice;
                const alertId = `${item.symbol}-${ltp}`;

                // Target Buy Check (LTP drops below or equal to target)
                if (item.target_buy && ltp <= item.target_buy) {
                    if (!triggeredAlerts.has(`${item.symbol}-buy`)) {
                        NotificationService.send(
                            `Buy Alert: ${item.symbol}`,
                            `${item.symbol} has reached your target buy price of Rs. ${item.target_buy}. Current LTP: Rs. ${ltp}`
                        );
                        triggeredAlerts.add(`${item.symbol}-buy`);
                    }
                }

                // Target Sell Check (LTP rises above or equal to target)
                if (item.target_sell && ltp >= item.target_sell) {
                    if (!triggeredAlerts.has(`${item.symbol}-sell`)) {
                        NotificationService.send(
                            `Sell Alert: ${item.symbol}`,
                            `${item.symbol} has reached your target sell price of Rs. ${item.target_sell}. Current LTP: Rs. ${ltp}`
                        );
                        triggeredAlerts.add(`${item.symbol}-sell`);
                    }
                }
            });
        } catch (error) {
            console.error("Alert check failed:", error);
        }
    }
};
