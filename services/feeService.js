/**
 * NEPSE Fee Calculation Service
 * Standards updated for Nepal CGT 3-era rule (July 2026)
 */

const FeeService = {
    // Current SEBON Fee: 0.015%
    SEBON_FEE_RATE: 0.00015,
    // DP Charge: Rs. 25 per company per transaction
    DP_CHARGE: 25,

    /**
     * Determine the Capital Gains Tax (CGT) rate for a sell transaction.
     *
     * Nepal CGT Eras:
     *   Era 1 — Before July 16, 2021:
     *     Flat 5% regardless of holding period.
     *   Era 2 — July 16, 2021 to July 16, 2026:
     *     Short-Term (≤ 365 days): 7.5%
     *     Long-Term  (> 365 days): 5.0%
     *   Era 3 — July 17, 2026 onward (Current):
     *     Short-Term (≤ 365 days): 10%
     *     Long-Term  (> 365 days): 7.5%
     *
     * @param {Date|string} sellDate  - Date of the sell transaction
     * @param {Date|string} buyDate   - Date of the original buy transaction
     * @returns {{ rate: number, label: string, type: string }}
     */
    getCGTRate(sellDate, buyDate) {
        const sell = new Date(sellDate);
        const buy  = new Date(buyDate);

        // Era boundary dates (time set to midnight Nepal time ≈ UTC+5:45)
        const ERA2_START = new Date('2021-07-16T00:00:00+05:45'); // July 16, 2021
        const ERA3_START = new Date('2026-07-17T00:00:00+05:45'); // July 17, 2026

        const holdDays = Math.floor((sell - buy) / (1000 * 60 * 60 * 24));
        const isLongTerm = holdDays > 365;

        if (sell < ERA2_START) {
            // Era 1 — Flat 5%
            return { rate: 0.05, label: 'CGT (5% — Pre-2021 Flat)', type: 'Flat', holdDays };
        }

        if (sell < ERA3_START) {
            // Era 2 — 2021–2026 rules
            if (isLongTerm) {
                return { rate: 0.05, label: 'CGT (5% — Long-Term)', type: 'Long-Term', holdDays };
            } else {
                return { rate: 0.075, label: 'CGT (7.5% — Short-Term)', type: 'Short-Term', holdDays };
            }
        }

        // Era 3 — July 17, 2026 onward (current)
        if (isLongTerm) {
            return { rate: 0.075, label: 'CGT (7.5% — Long-Term)', type: 'Long-Term', holdDays };
        } else {
            return { rate: 0.10, label: 'CGT (10% — Short-Term)', type: 'Short-Term', holdDays };
        }
    },

    // ─── Broker Commission Era Boundaries ──────────────────────────────────
    BROKER_ERA2_START: new Date('2020-12-27T00:00:00+05:45'), // Dec 27, 2020
    BROKER_ERA3_START: new Date('2024-05-14T00:00:00+05:45'), // May 14, 2024

    /**
     * Era-aware broker commission.
     *
     * Era 1 — Before Dec 27, 2020 (2016–2020 high commission):
     *   ≤ Rs. 50,000      : 0.60% (Min Rs. 25)
     *   ≤ Rs. 500,000     : 0.55%
     *   ≤ Rs. 2,000,000   : 0.50%
     *   ≤ Rs. 10,000,000  : 0.45%
     *   > Rs. 10,000,000  : 0.40%
     *
     * Era 2 — Dec 27, 2020 to May 13, 2024 (Bull Market):
     *   ≤ Rs. 50,000      : 0.40% (Min Rs. 10)
     *   ≤ Rs. 500,000     : 0.37%
     *   ≤ Rs. 2,000,000   : 0.34%
     *   ≤ Rs. 10,000,000  : 0.30%
     *   > Rs. 10,000,000  : 0.27%
     *
     * Era 3 — May 14, 2024 onward (Current):
     *   ≤ Rs. 50,000      : 0.36% (Min Rs. 10)
     *   ≤ Rs. 500,000     : 0.33%
     *   ≤ Rs. 2,000,000   : 0.31%
     *   ≤ Rs. 10,000,000  : 0.27%
     *   > Rs. 10,000,000  : 0.24%
     */
    getBrokerCommission(amount, date = new Date()) {
        const txDate = new Date(date);

        if (txDate < this.BROKER_ERA2_START) {
            // Era 1 — Pre-2020
            if (amount <= 50000) return Math.max(amount * 0.006, 25);
            if (amount <= 500000) return amount * 0.0055;
            if (amount <= 2000000) return amount * 0.005;
            if (amount <= 10000000) return amount * 0.0045;
            return amount * 0.004;
        }

        if (txDate < this.BROKER_ERA3_START) {
            // Era 2 — Bull Market (Dec 2020 – May 2024)
            if (amount <= 50000) return Math.max(amount * 0.004, 10);
            if (amount <= 500000) return amount * 0.0037;
            if (amount <= 2000000) return amount * 0.0034;
            if (amount <= 10000000) return amount * 0.003;
            return amount * 0.0027;
        }

        // Era 3 — Current (May 14, 2024+)
        if (amount <= 50000) return Math.max(amount * 0.0036, 10);
        if (amount <= 500000) return amount * 0.0033;
        if (amount <= 2000000) return amount * 0.0031;
        if (amount <= 10000000) return amount * 0.0027;
        return amount * 0.0024;
    },

    /** Returns a human-readable label for the commission era on a given date. */
    getBrokerEraLabel(date = new Date()) {
        const txDate = new Date(date);
        if (txDate < this.BROKER_ERA2_START) return 'Pre-2020 Rates';
        if (txDate < this.BROKER_ERA3_START) return 'Rates (2020–2024)';
        return 'Current Rates (2024+)';
    },

    /**
     * Calculate BUY-side fees for a Secondary Market purchase.
     * Uses era-aware broker commission based on the transaction date.
     *
     * @param {number} price       - Buy price per share
     * @param {number} qty         - Quantity bought
     * @param {Date|string} date   - Transaction date (defaults to today)
     */
    calculateBuy(price, qty, date = new Date()) {
        const purchaseAmount   = price * qty;
        const brokerCommission = this.getBrokerCommission(purchaseAmount, date);
        const sebonFee         = purchaseAmount * this.SEBON_FEE_RATE;
        const totalCost        = purchaseAmount + brokerCommission + sebonFee + this.DP_CHARGE;

        return {
            purchaseAmount,
            brokerCommission,
            sebonFee,
            dpCharge: this.DP_CHARGE,
            totalCost,
            wacc: totalCost / qty,
            isSecondary: true,
            eraLabel: this.getBrokerEraLabel(date)
        };
    },

    /**
     * Calculate BUY for non-secondary sources (IPO, Bonus, FPO, Right Share).
     * No broker commission, no SEBON fee, no DP charge — price IS the cost.
     *
     * @param {number} price - Issue/allotment price per share
     * @param {number} qty   - Quantity received/allotted
     */
    calculateBuyNoFees(price, qty) {
        const purchaseAmount = price * qty;
        return {
            purchaseAmount,
            brokerCommission: 0,
            sebonFee: 0,
            dpCharge: 0,
            totalCost: purchaseAmount,
            wacc: price,
            isSecondary: false,
            eraLabel: 'No Fees Applied'
        };
    },

    /**
     * Calculate SELL-side fees and CGT using true FIFO matching against available buy lots.
     *
     * @param {number} price           - Sell price per share
     * @param {number} qty             - Quantity sold
     * @param {number} wacc            - WACC per share
     * @param {Date|string} sellDate   - Date of sell
     * @param {Array} availableBuyLots - Array of { date, remaining, costPerUnit }
     */
    calculateSellFIFO(price, qty, wacc, sellDate = new Date(), availableBuyLots = []) {
        const salesAmount      = price * qty;
        const brokerCommission = this.getBrokerCommission(salesAmount, sellDate);
        const sebonFee         = salesAmount * this.SEBON_FEE_RATE;

        const receivableBeforeTax = salesAmount - brokerCommission - sebonFee - this.DP_CHARGE;
        const netSalesPricePerUnit = qty > 0 ? (receivableBeforeTax / qty) : 0;

        let totalCGT = 0;
        let remainingQtyToMatch = qty;
        let matchedDetails = [];

        // Copy lots to avoid mutating caller
        const lots = availableBuyLots.map(l => ({ ...l }));

        for (let lot of lots) {
            if (remainingQtyToMatch <= 0) break;
            if (lot.remaining <= 0) continue;

            const matchQty = Math.min(remainingQtyToMatch, lot.remaining);
            const lotCostPerUnit = lot.costPerUnit || wacc;
            const chunkCost = lotCostPerUnit * matchQty;
            const chunkSalesReceivable = netSalesPricePerUnit * matchQty;
            const chunkProfit = chunkSalesReceivable - chunkCost;

            const cgtInfo = this.getCGTRate(sellDate, lot.date);
            const chunkCGT = chunkProfit > 0 ? (chunkProfit * cgtInfo.rate) : 0;

            totalCGT += chunkCGT;

            matchedDetails.push({
                buyDate: lot.date,
                qty: matchQty,
                holdDays: cgtInfo.holdDays,
                cgtType: cgtInfo.type,
                cgtRate: cgtInfo.rate,
                cgtLabel: cgtInfo.label,
                profit: chunkProfit,
                cgt: chunkCGT
            });

            remainingQtyToMatch -= matchQty;
        }

        // If unmatched remaining qty exists (e.g. no buy lots logged), fallback using sellDate
        if (remainingQtyToMatch > 0) {
            const matchQty = remainingQtyToMatch;
            const chunkCost = wacc * matchQty;
            const chunkSalesReceivable = netSalesPricePerUnit * matchQty;
            const chunkProfit = chunkSalesReceivable - chunkCost;

            const cgtInfo = this.getCGTRate(sellDate, sellDate);
            const chunkCGT = chunkProfit > 0 ? (chunkProfit * cgtInfo.rate) : 0;

            totalCGT += chunkCGT;

            matchedDetails.push({
                buyDate: sellDate,
                qty: matchQty,
                holdDays: cgtInfo.holdDays,
                cgtType: cgtInfo.type,
                cgtRate: cgtInfo.rate,
                cgtLabel: cgtInfo.label,
                profit: chunkProfit,
                cgt: chunkCGT
            });
        }

        const netReceivable = receivableBeforeTax - totalCGT;
        const totalCostPrice = wacc * qty;
        const totalProfit = netReceivable - totalCostPrice;

        const primaryMatch = matchedDetails[0] || { holdDays: 0, cgtType: 'Short-Term', cgtLabel: 'CGT' };
        const isMixed = matchedDetails.length > 1;

        return {
            salesAmount,
            brokerCommission,
            sebonFee,
            dpCharge: this.DP_CHARGE,
            cgt: totalCGT,
            cgtRate: primaryMatch.cgtRate,
            cgtLabel: isMixed ? `CGT (FIFO Multi-lot)` : primaryMatch.cgtLabel,
            cgtType: isMixed ? 'FIFO Mixed' : primaryMatch.cgtType,
            holdDays: primaryMatch.holdDays,
            netReceivable,
            totalProfit,
            eraLabel: this.getBrokerEraLabel(sellDate),
            matchedDetails
        };
    },

    /**
     * Calculate SELL-side fees and CGT using era-aware rates (single buy date fallback).
     */
    calculateSell(price, qty, wacc, sellDate = new Date(), buyDate = null) {
        const salesAmount    = price * qty;
        const totalCostPrice = wacc * qty;
        const brokerCommission = this.getBrokerCommission(salesAmount, sellDate);
        const sebonFee         = salesAmount * this.SEBON_FEE_RATE;

        const receivableBeforeTax = salesAmount - brokerCommission - sebonFee - this.DP_CHARGE;

        const effectiveBuyDate = buyDate || sellDate;
        const cgtInfo = this.getCGTRate(sellDate, effectiveBuyDate);

        const profit = receivableBeforeTax - totalCostPrice;
        const cgt    = profit > 0 ? profit * cgtInfo.rate : 0;

        const netReceivable = receivableBeforeTax - cgt;

        return {
            salesAmount,
            brokerCommission,
            sebonFee,
            dpCharge: this.DP_CHARGE,
            cgt,
            cgtRate:  cgtInfo.rate,
            cgtLabel: cgtInfo.label,
            cgtType:  cgtInfo.type,
            holdDays: cgtInfo.holdDays,
            netReceivable,
            totalProfit: netReceivable - totalCostPrice,
            eraLabel: this.getBrokerEraLabel(sellDate)
        };
    }
};

export default FeeService;

