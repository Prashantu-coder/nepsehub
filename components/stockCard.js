export const StockCard = (stock) => {
    const isPositive = stock.change >= 0;
    
    return `
        <div class="stock-card glass" data-symbol="${stock.symbol}">
            <div class="stock-info">
                <div>
                    <div class="stock-symbol">${stock.symbol}</div>
                    <div class="stock-name">${stock.name}</div>
                </div>
                <div class="stock-price-container" style="text-align: right;">
                    <div class="stock-price">Rs. ${stock.price.toLocaleString()}</div>
                    <div class="stock-change ${isPositive ? 'positive' : 'negative'}">
                        <i class="fas ${isPositive ? 'fa-caret-up' : 'fa-caret-down'}"></i>
                        ${Math.abs(stock.changePercent)}%
                    </div>
                </div>
            </div>
            <div class="chart-container">
                <canvas id="chart-${stock.symbol}"></canvas>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.5rem;">
                <button class="btn btn-outline btn-sm addToWatchlist" data-symbol="${stock.symbol}" style="padding: 0.3rem 0.6rem; font-size: 0.8rem;">
                    <i class="far fa-heart"></i> Watchlist
                </button>
                <span style="font-size: 0.75rem; color: var(--text-secondary);">VOL: 124.5K</span>
            </div>
        </div>
    `;
};
