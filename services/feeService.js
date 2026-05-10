/**
 * NEPSE Fee Calculation Service
 * Standards as of 2024
 */

const FeeService = {
    // Current SEBON Fee: 0.015%
    SEBON_FEE_RATE: 0.00015,
    // DP Charge: Rs. 25 per company per transaction
    DP_CHARGE: 25,
    
    // Updated Broker Commission Rates (as per user specifications)
    getBrokerCommission(amount) {
        if (amount <= 50000) return Math.max(amount * 0.0036, 10); // 0.36% (Min Rs. 10)
        if (amount <= 500000) return amount * 0.0033;             // 0.33%
        if (amount <= 2000000) return amount * 0.0031;            // 0.31%
        if (amount <= 10000000) return amount * 0.0027;           // 0.27%
        return amount * 0.0024;                                   // 0.24%
    },

    calculateBuy(price, qty) {
        const purchaseAmount = price * qty;
        const brokerCommission = this.getBrokerCommission(purchaseAmount);
        const sebonFee = purchaseAmount * this.SEBON_FEE_RATE;
        const totalCost = purchaseAmount + brokerCommission + sebonFee + this.DP_CHARGE;
        
        return {
            purchaseAmount,
            brokerCommission,
            sebonFee,
            dpCharge: this.DP_CHARGE,
            totalCost,
            wacc: totalCost / qty
        };
    },

    calculateSell(price, qty, wacc, isIndividual = true) {
        const salesAmount = price * qty;
        const totalCostPrice = wacc * qty;
        const brokerCommission = this.getBrokerCommission(salesAmount);
        const sebonFee = salesAmount * this.SEBON_FEE_RATE;
        
        const receivableBeforeTax = salesAmount - brokerCommission - sebonFee - this.DP_CHARGE;
        
        // Capital Gain Tax (CGT)
        const profit = receivableBeforeTax - totalCostPrice;
        let cgt = 0;
        if (profit > 0) {
            // Assuming 5.0% for individuals (Long term) or 7.5% (Short term)
            // Defaulting to 7.5% for conservative calculation
            const cgtRate = isIndividual ? 0.075 : 0.10;
            cgt = profit * cgtRate;
        }

        const netReceivable = receivableBeforeTax - cgt;

        return {
            salesAmount,
            brokerCommission,
            sebonFee,
            dpCharge: this.DP_CHARGE,
            cgt,
            netReceivable,
            totalProfit: netReceivable - totalCostPrice
        };
    }
};

export default FeeService;
