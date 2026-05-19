import globalState from './state.js';
import DataService from '../services/dataService.js';
import NotificationService from '../services/notificationService.js';
import StorageService from '../services/storageService.js';
import PortfolioService from '../services/portfolioService.js';

let alertInterval = null;
const triggeredAlerts = new Set(); // Keep track of alerts sent in current session

export const AlertManager = {
    init() {
        console.log("Alert Manager Initialized");
        
        // Start checking every 30 seconds
        if (!alertInterval) {
            this.checkAlerts(); // Run once immediately
            alertInterval = setInterval(() => this.checkAlerts(), 5000);
        }
    },

    async checkAlerts() {
        const { watchlist } = globalState.getState();
        
        try {
            // 1. Fetch Latest Market Data
            const marketData = await DataService.getLiveMarket();
            if (!marketData || marketData.length === 0) return;

            // 2. CHECK WATCHLIST TARGETS
            if (watchlist && watchlist.length > 0) {
                watchlist.forEach(item => {
                    const liveStock = marketData.find(s => s.symbol.toUpperCase() === item.symbol.toUpperCase());
                    if (!liveStock) return;

                    const ltp = liveStock.lastTradedPrice;

                    // Target Buy Check
                    if (item.target_buy && ltp <= item.target_buy) {
                        const key = `${item.symbol}-buy-${item.target_buy}`;
                        if (!triggeredAlerts.has(key)) {
                            const title = `Target Reached: Buy ${item.symbol}`;
                            const msg = `${item.symbol} is at Rs. ${ltp}, which is at or below your target of Rs. ${item.target_buy}.`;
                            
                            NotificationService.send(title, msg, '/assets/logo.png', 'buy');
                            StorageService.addNotification({
                                title,
                                message: msg,
                                type: 'buy',
                                symbol: item.symbol
                            });
                            
                            triggeredAlerts.add(key);
                        }
                    }

                    // Target Sell Check
                    if (item.target_sell && ltp >= item.target_sell) {
                        const key = `${item.symbol}-sell-${item.target_sell}`;
                        if (!triggeredAlerts.has(key)) {
                            const title = `Target Reached: Sell ${item.symbol}`;
                            const msg = `${item.symbol} is at Rs. ${ltp}, which is at or above your target of Rs. ${item.target_sell}.`;
                            
                            NotificationService.send(title, msg, '/assets/logo.png', 'sell');
                            StorageService.addNotification({
                                title,
                                message: msg,
                                type: 'sell',
                                symbol: item.symbol
                            });
                            
                            triggeredAlerts.add(key);
                        }
                    }
                });
            }

            // 3. CHECK PORTFOLIO STOP LOSS
            const transRes = await StorageService.getTransactions();
            if (transRes.success && transRes.data.length > 0) {
                const holdings = PortfolioService.computeHoldings(transRes.data);
                
                holdings.forEach(h => {
                    if (!h.stopLoss) return;

                    const liveStock = marketData.find(s => s.symbol.toUpperCase() === h.symbol.toUpperCase());
                    if (!liveStock) return;

                    const ltp = liveStock.lastTradedPrice;
                    
                    if (ltp <= h.stopLoss) {
                        const key = `${h.symbol}-sl-${h.stopLoss}`;
                        if (!triggeredAlerts.has(key)) {
                            const title = `🚨 Stop Loss Breach: ${h.symbol}`;
                            const msg = `${h.symbol} dropped to Rs. ${ltp}, which is below your Stop Loss of Rs. ${h.stopLoss}. Consider exiting.`;
                            
                            NotificationService.send(title, msg, '/assets/logo.png', 'stoploss');

                            StorageService.addNotification({
                                title,
                                message: msg,
                                type: 'stoploss',
                                symbol: h.symbol
                            });

                            triggeredAlerts.add(key);
                        }
                    }
                });
            }

        } catch (error) {
            console.error("Alert check failed:", error);
        }
    }
};

