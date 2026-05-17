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
    }
};

export default PortfolioService;
