/**
 * PortfolioService - Shared logic for computing current holdings and state from raw transactions
 */
const PortfolioService = {
    computeHoldings(transactions) {
        const symbolMap = {};

        // Sort oldest first for running average
        const sorted = [...transactions].sort((a, b) => {
            const dateA = new Date(a.transaction_date);
            const dateB = new Date(b.transaction_date);
            if (dateA < dateB) return -1;
            if (dateA > dateB) return 1;
            return (a.id || 0) - (b.id || 0);
        });

        sorted.forEach(t => {
            const sym = t.symbol.toUpperCase();
            const type = t.type ? t.type.toUpperCase() : '';
            const qty = parseFloat(t.quantity) || 0;
            const amount = parseFloat(t.total_amount) || 0;

            if (!symbolMap[sym]) {
                symbolMap[sym] = { qty: 0, totalInvestment: 0, wacc: 0, stopLoss: null };
            }

            const h = symbolMap[sym];

            if (type === 'BUY') {
                h.totalInvestment = Number((h.totalInvestment + amount).toFixed(4));
                h.qty += qty;
                h.wacc = h.qty > 0 ? Number((h.totalInvestment / h.qty).toFixed(4)) : 0;
                if (t.stop_loss) h.stopLoss = parseFloat(t.stop_loss);
            } else if (type === 'SELL') {
                const costOfSoldShares = Number((h.wacc * qty).toFixed(4));
                h.totalInvestment = Number((h.totalInvestment - costOfSoldShares).toFixed(4));
                h.qty -= qty;

                if (h.qty <= 0.001) {
                    h.qty = 0;
                    h.totalInvestment = 0;
                    h.wacc = 0;
                    h.stopLoss = null;
                }
            }
        });

        return Object.entries(symbolMap)
            .filter(([_, data]) => data.qty > 0.001)
            .map(([symbol, data]) => ({
                symbol,
                ...data
            }));
    },

    /**
     * Get remaining available buy lots for a symbol by simulating FIFO consumption
     * across all historical transactions up to the present.
     *
     * @param {string} symbol
     * @param {Array} transactions
     * @returns {Array<{ id, date, qty, costPerUnit, remaining }>}
     */
    getAvailableBuyLots(symbol, transactions = []) {
        const symbolTxs = transactions
            .filter(t => t.symbol && t.symbol.toUpperCase() === symbol.toUpperCase())
            .sort((a, b) => {
                const dateA = new Date(a.transaction_date);
                const dateB = new Date(b.transaction_date);
                if (dateA < dateB) return -1;
                if (dateA > dateB) return 1;
                return (a.id || 0) - (b.id || 0);
            });

        let buyLots = [];

        symbolTxs.forEach(t => {
            const type = t.type ? t.type.toUpperCase() : '';
            const qty = parseFloat(t.quantity) || 0;
            const totalAmt = parseFloat(t.total_amount) || 0;

            if (type === 'BUY') {
                buyLots.push({
                    id: t.id,
                    date: t.transaction_date,
                    qty: qty,
                    costPerUnit: qty > 0 ? (totalAmt / qty) : (t.price || 0),
                    remaining: qty
                });
            } else if (type === 'SELL') {
                let sellQtyToMatch = qty;
                for (let lot of buyLots) {
                    if (sellQtyToMatch <= 0) break;
                    if (lot.remaining <= 0) continue;
                    const match = Math.min(sellQtyToMatch, lot.remaining);
                    lot.remaining -= match;
                    sellQtyToMatch -= match;
                }
            }
        });

        return buyLots.filter(lot => lot.remaining > 0.0001);
    }
};

export default PortfolioService;

