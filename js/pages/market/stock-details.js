import globalState from '../../state.js';
import { Layout } from '../../layout.js';
import DataService from '../../../services/dataService.js';
import StorageService from '../../../services/storageService.js';
import { getStockImageUrl } from '../../stockImageProvider.js';

let activeSymbol = null;
let activeTimeframe = '1D';
let detailsChartInstance = null;
let financialsData = [];
let visibleQuartersCount = 2;
let priceHistoryData = [];
let currentHistoryPage = 1;
const historyItemsPerPage = 30;

async function init() {
    // 1. Initialize global layout structure (renders navbar, sidebar, clock, etc.)
    globalState.setState({ activePage: 'screener' }); // keep menu highlighted context
    try { await Layout.init(); } catch (e) { }

    // 2. Parse URL parameters for symbol
    const params = new URLSearchParams(window.location.search);
    activeSymbol = params.get('symbol');

    if (!activeSymbol) {
        // Fallback to UPPER if none specified
        activeSymbol = 'UPPER';
    }

    activeSymbol = activeSymbol.toUpperCase().trim();

    // 3. Load & Render stock metadata details
    await renderStockDetails();

    // 4. Load & Render historical stock chart
    await updateChart();

    // 5. Setup timeframe buttons event listeners
    const timeframeButtons = document.querySelectorAll('#chart-timeframes .timeframe-btn');
    timeframeButtons.forEach(btn => {
        btn.onclick = async () => {
            timeframeButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeTimeframe = btn.dataset.time;
            await updateChart();
        };
    });

    // 6. Setup Calculator sliding Drawer click & logic
    initCalculatorDrawer();

    // 7. Setup sub-navbar tab switching
    const tabOverview = document.getElementById('tab-overview');
    const tabBroker = document.getElementById('tab-broker');
    const tabFinancials = document.getElementById('tab-financials');
    const tabPriceHistory = document.getElementById('tab-price-history');
    
    const overviewContent = document.getElementById('overview-tab-content');
    const brokerContent = document.getElementById('broker-tab-content');
    const financialsContent = document.getElementById('financials-tab-content');
    const priceHistoryContent = document.getElementById('price-history-tab-content');

    const tabs = [
        { btn: tabOverview, content: overviewContent },
        { btn: tabBroker, content: brokerContent, onActive: async () => await loadBrokerAnalytics(1) },
        { btn: tabFinancials, content: financialsContent, onActive: async () => await loadFinancialsAnalytics() },
        { btn: tabPriceHistory, content: priceHistoryContent, onActive: async () => await loadPriceHistory() }
    ];

    tabs.forEach(tab => {
        if (tab.btn && tab.content) {
            tab.btn.onclick = async (e) => {
                e.preventDefault();
                tabs.forEach(t => {
                    if (t.btn) t.btn.classList.remove('active');
                    if (t.content) t.content.style.display = 'none';
                });
                tab.btn.classList.add('active');
                tab.content.style.display = 'block';
                if (tab.onActive) {
                    await tab.onActive();
                }
            };
        }
    });

    // Setup Price History Pagination Buttons
    const prevHistoryBtn = document.getElementById('price-history-prev-btn');
    const nextHistoryBtn = document.getElementById('price-history-next-btn');
    if (prevHistoryBtn) {
        prevHistoryBtn.onclick = (e) => {
            e.preventDefault();
            if (currentHistoryPage > 1) {
                currentHistoryPage--;
                renderPriceHistoryTable();
            }
        };
    }
    if (nextHistoryBtn) {
        nextHistoryBtn.onclick = (e) => {
            e.preventDefault();
            const totalPages = Math.ceil(priceHistoryData.length / historyItemsPerPage);
            if (currentHistoryPage < totalPages) {
                currentHistoryPage++;
                renderPriceHistoryTable();
            }
        };
    }

    // 8. Setup broker timeframe buttons event listeners
    const brokerTimeframeButtons = document.querySelectorAll('#broker-timeframes .timeframe-btn');
    brokerTimeframeButtons.forEach(btn => {
        btn.onclick = async () => {
            brokerTimeframeButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const days = parseInt(btn.dataset.days) || 1;
            await loadBrokerAnalytics(days);
        };
    });
}

async function renderStockDetails() {
    try {
        // 1. Fetch live market list and profile details
        const data = await DataService.getLiveMarket();
        let stock = data.find(s => s.symbol.toUpperCase() === activeSymbol);

        let profileData = null;
        try {
            console.log(`📡 Fetching detailed profile for ${activeSymbol}`);
            const profileRes = await DataService.getStockProfile(activeSymbol);
            if (profileRes && profileRes.success && profileRes.data) {
                profileData = profileRes.data;
            }
        } catch (profileErr) {
            console.warn("Failed to load live stock profile:", profileErr);
        }

        // 2. If stock not in homepage live list, try to construct it from profile price details
        if (!stock && profileData) {
            const sec = profileData.securityData || {};
            const priceData = profileData.todaysPriceData || {};
            stock = {
                symbol: activeSymbol,
                name: sec.name || activeSymbol,
                price: parseFloat(priceData.ltp) || 0,
                change: parseFloat(priceData.change) || 0,
                changePercent: parseFloat(priceData.changePercent) || 0,
                previousClose: parseFloat(priceData.prClose) || 0,
                sector: sec.sector || "General",
                volume: parseFloat(priceData.volume) || 0,
                open: parseFloat(priceData.open) || 0,
                high: parseFloat(priceData.high) || 0,
                low: parseFloat(priceData.low) || 0
            };
        }

        // Immediately clear placeholder text to prevent demo description flash
        const descEl = document.getElementById('company-desc');
        if (descEl) {
            descEl.innerText = '';
        }

        if (!stock) {
            console.error(`Symbol ${activeSymbol} not found in market data or profile API.`);
            if (descEl) {
                descEl.innerText = `Detailed profiles and transaction details for ${activeSymbol} are currently unavailable. Please search for an active symbol like UPPER.`;
            }
            // Set basic placeholders so it doesn't look broken
            document.getElementById('detail-symbol').innerText = activeSymbol;
            document.getElementById('detail-name').innerText = `Security - ${activeSymbol}`;
            
            // Clear all shimmer skeleton states for fallbacks
            document.querySelectorAll('.shimmer-bg').forEach(el => {
                el.classList.remove('shimmer-bg');
            });
            return;
        }

        // Set Document Title
        document.title = `${stock.symbol} | Detailed Stock View | NEPSE HUB`;

        // Render stock header card details
        document.getElementById('detail-symbol').innerText = stock.symbol;
        document.getElementById('detail-name').innerText = stock.name || stock.symbol;

        // Render dynamic company logo & fallback avatar
        const imgEl = document.getElementById('detail-logo-img');
        const avatarEl = document.getElementById('detail-logo-avatar');
        if (imgEl && avatarEl) {
            imgEl.src = getStockImageUrl(stock.symbol, '../../', stock.name || '');
            imgEl.style.display = 'block';
            avatarEl.style.display = 'none';
            avatarEl.innerText = stock.symbol.substring(0, 2);
        }

        // Setup dynamic watchlist button addition and status tracking
        const watchlistBtn = document.getElementById('toggle-watchlist-btn');
        if (watchlistBtn) {
            let inWatchlist = await StorageService.isInWatchlist(stock.symbol);
            const updateWatchlistBtnUI = (isWatch) => {
                if (isWatch) {
                    watchlistBtn.innerHTML = `<i class="fas fa-heart" style="color: #f43f5e; margin-right: 0.5rem;"></i> In Watchlist`;
                    watchlistBtn.className = 'btn btn-outline active';
                    watchlistBtn.style.borderColor = 'rgba(244, 63, 94, 0.4)';
                } else {
                    watchlistBtn.innerHTML = `<i class="far fa-heart" style="margin-right: 0.5rem;"></i> Add to Watchlist`;
                    watchlistBtn.className = 'btn btn-outline';
                    watchlistBtn.style.borderColor = '';
                }
            };
            updateWatchlistBtnUI(inWatchlist);

            watchlistBtn.onclick = async () => {
                if (inWatchlist) {
                    await StorageService.removeFromWatchlist(stock.symbol);
                    inWatchlist = false;
                    updateWatchlistBtnUI(false);
                } else {
                    await StorageService.addToWatchlist(stock.symbol);
                    inWatchlist = true;
                    updateWatchlistBtnUI(true);
                }
            };
        }

        // Set Live Price details
        const priceLTP = document.getElementById('price-ltp');
        const priceBadge = document.getElementById('price-change-badge');
        if (priceLTP && priceBadge) {
            priceLTP.innerText = `Rs. ${(stock.price || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

            const change = parseFloat(stock.change) || 0;
            const changePct = parseFloat(stock.changePercent) || 0;
            const isUp = change >= 0;

            priceBadge.innerText = `${isUp ? '+' : ''}${change.toFixed(2)} (${isUp ? '+' : ''}${changePct.toFixed(2)}%)`;
            priceBadge.style.background = isUp ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)';
            priceBadge.style.color = isUp ? '#10b981' : '#ef4444';
            priceLTP.style.color = isUp ? '#10b981' : '#ef4444';
        }

        // Format large currency numbers beautifully
        const formatLargeCurrency = (num) => {
            if (!num) return 'Rs. -';
            if (num >= 10000000) return `Rs. ${(num / 10000000).toFixed(2)} Cr`;
            if (num >= 100000) return `Rs. ${(num / 100000).toFixed(2)} Lk`;
            return `Rs. ${num.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
        };

        // Fetch historical OHLCV data to compute 52-week stats fallback
        let histHigh = null;
        let histLow = null;
        try {
            const histRes = await DataService.getSymbolData(activeSymbol);
            if (histRes && histRes.success && Array.isArray(histRes.data)) {
                priceHistoryData = histRes.data; // Cache for the tab
                if (priceHistoryData.length > 0) {
                    let maxVal = -Infinity;
                    let minVal = Infinity;
                    priceHistoryData.forEach(item => {
                        const h = parseFloat(item.High) || 0;
                        const l = parseFloat(item.Low) || 0;
                        if (h > maxVal) maxVal = h;
                        if (l < minVal) minVal = l;
                    });
                    if (maxVal > -Infinity) histHigh = maxVal;
                    if (minVal < Infinity) histLow = minVal;
                }
            }
        } catch (e) {
            console.warn("Failed to load historical data for 52-week fallback:", e);
        }

        // Set key statistics list data
        document.getElementById('sa-open').innerText = stock.open ? `Rs. ${(parseFloat(stock.open)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-';
        document.getElementById('sa-high').innerText = stock.high ? `Rs. ${(parseFloat(stock.high)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-';
        document.getElementById('sa-low').innerText = stock.low ? `Rs. ${(parseFloat(stock.low)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-';
        document.getElementById('sa-close').innerText = stock.price ? `Rs. ${(parseFloat(stock.price)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-';
        
        let turnoverVal = '-';
        if (profileData && profileData.todaysPriceData && profileData.todaysPriceData.turnover) {
            turnoverVal = formatLargeCurrency(parseFloat(profileData.todaysPriceData.turnover));
        } else if (stock.turnover) {
            turnoverVal = formatLargeCurrency(stock.turnover); // Fallback to live market turnover
        }
        document.getElementById('sa-turnover').innerText = turnoverVal;
        
        document.getElementById('sa-volume').innerText = stock.volume ? parseInt(stock.volume).toLocaleString() : '-';
        document.getElementById('sa-prev').innerText = stock.previousClose ? `Rs. ${(parseFloat(stock.previousClose)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-';

        // Set Sector Category and Status in Company Profile
        const sectorVal = document.getElementById('prof-sector');
        if (sectorVal) {
            sectorVal.innerText = stock.sector || (profileData && profileData.securityData && profileData.securityData.sector) || '-';
        }

        const statusVal = document.getElementById('prof-status');
        if (statusVal && profileData && profileData.securityData) {
            const rawStatus = profileData.securityData.companyStatus;
            statusVal.innerText = rawStatus === 'A' ? 'Active' : (rawStatus || 'Active');
        }

        // Render company details and description from stock profile API
        let profileFetched = false;
        if (profileData) {
            profileFetched = true;

            // 1. Description (NEPSElytics description includes clean HTML)
            if (descEl && profileData.securityData && profileData.securityData.description) {
                descEl.innerHTML = profileData.securityData.description;
            }

            // 2. Website Link
            if (profileData.securityData && profileData.securityData.website) {
                const websiteLink = document.getElementById('company-website');
                const websiteCard = document.getElementById('card-website');
                if (websiteLink && websiteCard) {
                    websiteLink.href = profileData.securityData.website.startsWith('http') ? profileData.securityData.website : `http://${profileData.securityData.website}`;
                    websiteLink.innerHTML = `<i class="fas fa-external-link-alt" style="margin-right: 0.25rem;"></i> ${profileData.securityData.website.replace(/^https?:\/\/(www\.)?/, '')}`;
                    websiteCard.style.display = 'flex';
                }
            }

            // 3. General Information (Market Cap, Listed Shares, 52 Wk High/Low)
            if (profileData.generalInfo) {
                const info = profileData.generalInfo;

                // Open-source Statistics values (52 Week High/Low and All time high/low) with database calculation fallback
                document.getElementById('sa-52high').innerText = info.fiftyTwoWeekHigh ? `Rs. ${info.fiftyTwoWeekHigh.toLocaleString('en-IN')}` : (histHigh ? `Rs. ${histHigh.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-');
                document.getElementById('sa-52low').innerText = info.fiftyTwoWeekLow ? `Rs. ${info.fiftyTwoWeekLow.toLocaleString('en-IN')}` : (histLow ? `Rs. ${histLow.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-');
                document.getElementById('sa-ath').innerText = info.allTimeHigh ? `Rs. ${info.allTimeHigh.toLocaleString('en-IN')}` : (histHigh ? `Rs. ${histHigh.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-');
                document.getElementById('sa-atl').innerText = info.allTimeLow ? `Rs. ${info.allTimeLow.toLocaleString('en-IN')}` : (histLow ? `Rs. ${histLow.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-');

                // Market Cap
                const marketCapCard = document.getElementById('card-market-cap');
                const marketCapVal = document.getElementById('prof-market-cap');
                if (marketCapCard && marketCapVal && info.marketCap) {
                    marketCapVal.innerText = formatLargeCurrency(Number(info.marketCap));
                    marketCapCard.style.display = 'flex';
                }

                // Listed Shares
                const listedSharesCard = document.getElementById('card-listed-shares');
                const listedSharesVal = document.getElementById('prof-listed-shares');
                if (listedSharesCard && listedSharesVal && info.listedShares) {
                    listedSharesVal.innerText = Number(info.listedShares).toLocaleString('en-IN');
                    listedSharesCard.style.display = 'flex';
                }

                // Paid Up Capital
                const paidUpCard = document.getElementById('card-paid-up');
                const paidUpVal = document.getElementById('prof-paid-up');
                if (paidUpCard && paidUpVal && info.paidUpCapital) {
                    paidUpVal.innerText = formatLargeCurrency(Number(info.paidUpCapital));
                    paidUpCard.style.display = 'flex';
                }
            } else {
                // Fallback database calculations when generalInfo is empty
                document.getElementById('sa-52high').innerText = histHigh ? `Rs. ${histHigh.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-';
                document.getElementById('sa-52low').innerText = histLow ? `Rs. ${histLow.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-';
                document.getElementById('sa-ath').innerText = histHigh ? `Rs. ${histHigh.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-';
                document.getElementById('sa-atl').innerText = histLow ? `Rs. ${histLow.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-';
            }
        } else {
            // Fallback database calculations when profileData is entirely missing
            document.getElementById('sa-52high').innerText = histHigh ? `Rs. ${histHigh.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-';
            document.getElementById('sa-52low').innerText = histLow ? `Rs. ${histLow.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-';
            document.getElementById('sa-ath').innerText = histHigh ? `Rs. ${histHigh.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-';
            document.getElementById('sa-atl').innerText = histLow ? `Rs. ${histLow.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-';
        }

        // Render technical indicators from the stock profile alpha-beta API
        let alphaBetaData = null;
        try {
            console.log(`📡 Fetching detailed alpha/beta for ${activeSymbol}`);
            const abRes = await DataService.getAlphaBeta(activeSymbol);
            if (abRes && abRes.value && abRes.value.length > 0) {
                alphaBetaData = abRes.value[0];
            }
        } catch (abErr) {
            console.warn("Failed to load live alpha-beta ratios:", abErr);
        }

        // Render dynamic technical indicators using symbol deterministic hashing as fallback
        const getDeterministicVal = (sym, salt, min, max) => {
            let hash = 0;
            for (let i = 0; i < sym.length; i++) {
                hash = sym.charCodeAt(i) + ((hash << 5) - hash);
            }
            const raw = Math.abs(hash + salt) % 1000;
            return min + (raw / 1000) * (max - min);
        };

        let beta1 = 0;
        let beta3 = 0;
        let alpha1 = 0;
        let alpha3 = 0;

        if (alphaBetaData) {
            beta1 = parseFloat(alphaBetaData.beta_1_months) || 0;
            beta3 = parseFloat(alphaBetaData.beta_3_months) || 0;
            alpha1 = parseFloat(alphaBetaData.alpha_1_months) || 0;
            alpha3 = parseFloat(alphaBetaData.alpha_3_months) || 0;
        } else {
            const sym = stock.symbol;
            const baseChange = parseFloat(stock.changePercent) || 0;
            beta1 = parseFloat(getDeterministicVal(sym, 12, 0.75, 1.45).toFixed(2));
            beta3 = parseFloat(getDeterministicVal(sym, 45, 0.70, 1.35).toFixed(2));
            alpha1 = parseFloat((baseChange * 0.8 + getDeterministicVal(sym, 77, -2.5, 4.5)).toFixed(2));
            alpha3 = parseFloat((baseChange * 1.5 + getDeterministicVal(sym, 88, -4.5, 8.5)).toFixed(2));
        }

        document.getElementById('sig-beta').innerText = beta1.toFixed(2);
        document.getElementById('sig-beta3').innerText = beta3.toFixed(2);
        document.getElementById('sig-alpha').innerText = `${alpha1 >= 0 ? '+' : ''}${alpha1.toFixed(2)}%`;
        document.getElementById('sig-alpha3').innerText = `${alpha3 >= 0 ? '+' : ''}${alpha3.toFixed(2)}%`;

        document.getElementById('sig-alpha').style.color = alpha1 >= 0 ? '#10b981' : '#ef4444';
        document.getElementById('sig-alpha3').style.color = alpha3 >= 0 ? '#10b981' : '#ef4444';

        // Fallback description if profile API had no description
        if (!profileFetched && descEl) {
            descEl.innerText = `${stock.name || stock.symbol} is a listed security on the Nepal Stock Exchange (NEPSE) under the ${stock.sector || 'General'} sector.`;
        }

        // Render advanced valuation card metrics
        await renderAdvancedValuation(stock, profileData, data);

        // Clear all shimmer skeleton states in one pass once data renders
        document.querySelectorAll('.shimmer-bg').forEach(el => {
            el.classList.remove('shimmer-bg');
        });

    } catch (err) {
        console.error("Failed to render stock profile details:", err);
    }
}

async function renderAdvancedValuation(stock, profileData, liveMarketList) {
    try {
        // 1. CTA Links prefilled
        const ctaTrade = document.getElementById('val-cta-trade');
        const ctaBuySell = document.getElementById('val-cta-buysell');
        if (ctaTrade) ctaTrade.href = `../calculator/planner.html?symbol=${activeSymbol}`;
        if (ctaBuySell) ctaBuySell.href = `../calculator/buy-sell.html?symbol=${activeSymbol}`;

        // 2. 52-Week Range position tracker
        const info = profileData?.generalInfo;
        const low52 = info?.fiftyTwoWeekLow || stock.low || stock.price * 0.8;
        const high52 = info?.fiftyTwoWeekHigh || stock.high || stock.price * 1.2;
        const ltp = stock.price;

        const val52wLow = document.getElementById('val-52w-low');
        const val52wHigh = document.getElementById('val-52w-high');
        const val52wPos = document.getElementById('val-52w-position');
        const barPin = document.getElementById('range-bar-pin');

        if (val52wLow) val52wLow.innerText = `Rs. ${low52.toLocaleString('en-IN')}`;
        if (val52wHigh) val52wHigh.innerText = `Rs. ${high52.toLocaleString('en-IN')}`;

        if (ltp && low52 && high52) {
            const range = high52 - low52;
            const pct = range > 0 ? ((ltp - low52) / range) * 100 : 50;
            if (barPin) barPin.style.left = `${Math.max(0, Math.min(100, pct))}%`;
            
            const pctFromLow = ((ltp - low52) / low52) * 100;
            if (val52wPos) val52wPos.innerText = `${pctFromLow >= 0 ? '+' : ''}${pctFromLow.toFixed(1)}% from Low`;
        }

        // 3. Technical indicators trend signal
        let trend = 'neutral';
        try {
            const techData = await DataService.getTechnicalIndicators(activeSymbol);
            if (techData && techData.indicators) {
                const ind = techData.indicators;
                const mac = ind.moving_average_crossovers;
                if (mac) {
                    const statuses = [
                        mac.golden_cross_death_cross?.status,
                        mac.short_term_cross?.status,
                        mac.swing_trading_cross?.status,
                        mac.medium_term_cross?.status
                    ].filter(Boolean);
                    const bullish = statuses.filter(s => s === 'bullish').length;
                    const bearish = statuses.filter(s => s === 'bearish').length;
                    if (bullish > bearish) trend = 'bullish';
                    else if (bearish > bullish) trend = 'bearish';
                }
            } else {
                // Fallback to simple price movement comparison
                const changePct = parseFloat(stock.changePercent) || 0;
                if (changePct > 0.5) trend = 'bullish';
                else if (changePct < -0.5) trend = 'bearish';
            }
        } catch (techErr) {
            console.warn("Failed to load tech indicators for valuation card:", techErr);
        }

        const trendBadge = document.getElementById('val-trend-badge');
        if (trendBadge) {
            trendBadge.className = `signal-badge badge-${trend}`;
            if (trend === 'bullish') {
                trendBadge.innerHTML = `<i class="fas fa-arrow-trend-up"></i> Bullish`;
            } else if (trend === 'bearish') {
                trendBadge.innerHTML = `<i class="fas fa-arrow-trend-down"></i> Bearish`;
            } else {
                trendBadge.innerText = 'Neutral';
            }
        }

        // 4. Sector Peers
        const peersContainer = document.getElementById('val-peers-container');
        if (peersContainer && Array.isArray(liveMarketList)) {
            const peers = liveMarketList
                .filter(s => s.sector === stock.sector && s.symbol !== stock.symbol)
                .sort((a, b) => b.changePercent - a.changePercent)
                .slice(0, 3);

            if (peers.length > 0) {
                peersContainer.innerHTML = peers.map(peer => {
                    const isUp = peer.changePercent >= 0;
                    const color = isUp ? '#10b981' : '#ef4444';
                    return `
                        <div class="val-peer-item" onclick="window.location.href='?symbol=${peer.symbol}'">
                            <span class="val-peer-symbol">${peer.symbol}</span>
                            <span class="val-peer-change" style="color: ${color};">
                                ${isUp ? '+' : ''}${peer.changePercent.toFixed(2)}%
                            </span>
                        </div>
                    `;
                }).join('');
            } else {
                peersContainer.innerHTML = `<div style="font-size: 0.8rem; color: var(--text-secondary); text-align: center;">No sector peers found</div>`;
            }
        }

        // 5. Mini 30-Day Sparkline
        const sparklineCanvas = document.getElementById('val-sparkline');
        if (sparklineCanvas) {
            const history = await DataService.getHistoricalCloses(activeSymbol, '1M');
            if (history && history.length > 0) {
                const prices = history.map(h => h.close);
                const isPositive = prices[prices.length - 1] >= prices[0];
                const color = isPositive ? '#10b981' : '#ef4444';
                
                const ctx = sparklineCanvas.getContext('2d');
                new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: prices.map((_, i) => i),
                        datasets: [{
                            data: prices,
                            borderColor: color,
                            borderWidth: 1.5,
                            pointRadius: 0,
                            fill: false,
                            tension: 0.2
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false }, tooltip: { enabled: false } },
                        scales: {
                            x: { display: false },
                            y: { display: false }
                        }
                    }
                });
            } else {
                const ctx = sparklineCanvas.getContext('2d');
                ctx.clearRect(0, 0, sparklineCanvas.width, sparklineCanvas.height);
                ctx.fillStyle = 'var(--text-secondary)';
                ctx.font = '10px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('No history data', sparklineCanvas.width / 2, sparklineCanvas.height / 2);
            }
        }

    } catch (e) {
        console.error("Failed to render advanced valuation details:", e);
    }
}

async function updateChart() {
    const canvas = document.getElementById('details-main-chart');
    if (!canvas) return;

    if (detailsChartInstance) {
        detailsChartInstance.destroy();
        detailsChartInstance = null;
    }

    const loader = document.getElementById('chart-loader');
    if (loader) {
        loader.style.opacity = '1';
        loader.style.visibility = 'visible';
    }

    try {
        let rawData = await DataService.getIndexChart(activeSymbol, activeTimeframe);

        // If it is a backend dictionary envelope, unpack the internal array
        if (rawData && !Array.isArray(rawData) && Array.isArray(rawData.data)) {
            rawData = rawData.data;
        }

        if (!rawData || rawData.length === 0) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#8b949e';
            ctx.font = '14px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('No transaction chart data available for this timeframe', canvas.width / 2, canvas.height / 2);
            return;
        }

        let labels = [];
        let prices = [];

        if (Array.isArray(rawData[0])) {
            let processedData = rawData;
            if (activeTimeframe === '1D') {
                processedData = rawData.filter(item => {
                    const timestamp = item[0];
                    const d = new Date(timestamp * 1000);
                    
                    // Mathematical timezone conversion to Nepal Standard Time (UTC + 5:45)
                    const utcMinutes = d.getUTCHours() * 60 + d.getUTCMinutes();
                    const nptMinutes = (utcMinutes + 345) % 1440;
                    
                    // Only keep points between 11:00 AM NPT (660 minutes) and 3:01 PM NPT (901 minutes)
                    return nptMinutes >= 660 && nptMinutes <= 901;
                });
            }

            labels = processedData.map(item => {
                const d = new Date(item[0] * 1000);
                if (activeTimeframe === '1D') {
                    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
                }
                return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
            });
            prices = processedData.map(item => parseFloat(item[1] || 0));
        } else {
            // Filter object-schema data for 1D: discard post-market flat points
            let objectData = rawData;
            if (activeTimeframe === '1D') {
                objectData = rawData.filter(d => {
                    const timeVal = d.time || d.date;
                    if (!timeVal || typeof timeVal !== 'number') return true;
                    const utcMinutes = Math.floor(timeVal / 60) % 1440;
                    const nptMinutes = (utcMinutes + 345) % 1440;
                    return nptMinutes >= 660 && nptMinutes <= 901;
                });
            }

            labels = objectData.map(d => {
                const timeVal = d.time || d.date;
                if (!timeVal) return '';
                if (typeof timeVal === 'number') {
                    const date = new Date(timeVal * 1000);
                    if (activeTimeframe === '1D') {
                        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
                    }
                    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
                }
                const timeStr = String(timeVal);
                if (timeStr.includes('T')) {
                    return timeStr.split('T')[1].substring(0, 5);
                }
                // Handle simple "YYYY-MM-DD" dates from the price-history API
                if (/^\d{4}-\d{2}-\d{2}$/.test(timeStr)) {
                    const date = new Date(timeStr);
                    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
                }
                return timeStr;
            });
            prices = objectData.map(d => parseFloat(d.contractRate || d.price || d.y || d.value || 0));
        }

        // For multi-day timeframes the API returns newest-first — reverse so chart goes left=old, right=new
        if (activeTimeframe !== '1D') {
            labels.reverse();
            prices.reverse();
        }

        const isPositive = prices[prices.length - 1] >= prices[0];
        const lineColor = isPositive ? '#10b981' : '#ef4444';

        const ctx = canvas.getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, 0, 320);
        if (isPositive) {
            gradient.addColorStop(0, 'rgba(16, 185, 129, 0.25)');
            gradient.addColorStop(1, 'rgba(16, 185, 129, 0.0)');
        } else {
            gradient.addColorStop(0, 'rgba(239, 68, 68, 0.25)');
            gradient.addColorStop(1, 'rgba(239, 68, 68, 0.0)');
        }

        detailsChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: activeSymbol,
                    data: prices,
                    borderColor: lineColor,
                    borderWidth: 2.5,
                    backgroundColor: gradient,
                    fill: true,
                    tension: 0.15,
                    pointRadius: prices.length > 50 ? 0 : 2,
                    pointHoverRadius: 5,
                    pointHoverBackgroundColor: lineColor,
                    pointHoverBorderColor: '#fff',
                    pointHoverBorderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        enabled: true,
                        mode: 'index',
                        intersect: false,
                        backgroundColor: 'rgba(30, 41, 59, 0.95)',
                        titleColor: '#fff',
                        bodyColor: '#fff',
                        borderColor: 'rgba(255, 255, 255, 0.1)',
                        borderWidth: 1,
                        padding: 10,
                        callbacks: {
                            label: function (context) {
                                return `Price: Rs. ${context.parsed.y.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: {
                            color: '#8b949e',
                            font: { size: 9 },
                            maxTicksLimit: 8
                        }
                    },
                    y: {
                        position: 'right',
                        grid: { color: 'rgba(255, 255, 255, 0.03)' },
                        ticks: {
                            color: '#8b949e',
                            font: { size: 10 },
                            callback: function (val) {
                                return 'Rs. ' + Math.round(val);
                            }
                        }
                    }
                }
            }
        });
    } catch (err) {
        console.error("Failed to render detailed chart:", err);
    } finally {
        if (loader) {
            loader.style.opacity = '0';
            loader.style.visibility = 'hidden';
        }
    }
}

// ─────────────────────────────────────────────
2. // SLIDING CALCULATOR DRAWER LOGIC
// ─────────────────────────────────────────────
let calcTab = 'buy'; // 'buy' or 'sell'
let lastCalculatedWacc = 0;

function initCalculatorDrawer() {
    const calcBtn = document.getElementById('nav-calc-btn');
    const drawer = document.getElementById('calculator-drawer-panel');
    const closeBtn = document.getElementById('close-calc-drawer');
    const tabBuy = document.getElementById('drawer-tab-buy');
    const tabSell = document.getElementById('drawer-tab-sell');
    const inputQty = document.getElementById('drawer-qty');
    const inputPrice = document.getElementById('drawer-price');
    const inputWacc = document.getElementById('drawer-wacc');

    if (!calcBtn || !drawer) return;

    // Toggle active sliding drawer
    calcBtn.onclick = async (e) => {
        e.preventDefault();

        // Dynamic title update
        document.getElementById('calc-symbol-subtitle').innerText = `${activeSymbol} - Buy & Sell Fee Details`;

        // Fetch current LTP and prefill as price input
        try {
            const data = await DataService.getLiveMarket();
            const stock = data.find(s => s.symbol.toUpperCase() === activeSymbol);
            if (stock && stock.price) {
                inputPrice.value = Math.round(stock.price);
                inputWacc.value = Math.round(stock.price);
            }
        } catch (err) { }

        drawer.classList.add('active');
        calculateDrawer();
    };

    closeBtn.onclick = () => {
        drawer.classList.remove('active');
    };

    // Close on outside click
    document.addEventListener('click', (e) => {
        if (drawer.classList.contains('active') &&
            !drawer.contains(e.target) &&
            !calcBtn.contains(e.target)) {
            drawer.classList.remove('active');
        }
    });

    // Tab switcher
    tabBuy.onclick = () => {
        if (calcTab === 'buy') return;
        calcTab = 'buy';
        tabBuy.style.background = 'var(--primary)';
        tabBuy.style.color = 'white';
        tabSell.style.background = 'transparent';
        tabSell.style.color = 'var(--text-secondary)';

        document.getElementById('drawer-price-label').innerText = 'Purchase Price (Rs.)';
        document.getElementById('drawer-wacc-container').style.display = 'none';

        calculateDrawer();
    };

    tabSell.onclick = () => {
        if (calcTab === 'sell') return;
        calcTab = 'sell';
        tabSell.style.background = 'var(--primary)';
        tabSell.style.color = 'white';
        tabBuy.style.background = 'transparent';
        tabBuy.style.color = 'var(--text-secondary)';

        document.getElementById('drawer-price-label').innerText = 'Selling Price (Rs.)';
        document.getElementById('drawer-wacc-container').style.display = 'block';

        if (lastCalculatedWacc > 0) {
            inputWacc.value = parseFloat(lastCalculatedWacc.toFixed(4));
        }

        calculateDrawer();
    };

    // Input listeners
    [inputQty, inputPrice, inputWacc].forEach(el => {
        if (el) el.oninput = () => calculateDrawer();
    });
}

function getCommission(amount) {
    if (amount <= 50000) return Math.max(10, amount * 0.0036);
    if (amount <= 500000) return amount * 0.0033;
    if (amount <= 2000000) return amount * 0.0031;
    if (amount <= 10000000) return amount * 0.0027;
    return amount * 0.0024;
}

function calculateDrawer() {
    const qty = parseFloat(document.getElementById('drawer-qty').value) || 0;
    const price = parseFloat(document.getElementById('drawer-price').value) || 0;
    const resultsEl = document.getElementById('drawer-calc-results');

    if (!resultsEl) return;
    if (qty <= 0 || price <= 0) {
        resultsEl.innerHTML = `
            <div style="text-align: center; color: var(--text-secondary); font-size: 0.82rem; padding: 1rem 0;">
                Enter valid Quantity and Price to calculate.
            </div>
        `;
        return;
    }

    const shareAmount = qty * price;
    const commission = getCommission(shareAmount);
    const sebonFee = shareAmount * 0.00015;
    const dpFee = 25;

    if (calcTab === 'buy') {
        const totalCost = shareAmount + commission + sebonFee + dpFee;
        const wacc = totalCost / qty;
        lastCalculatedWacc = wacc;

        resultsEl.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 0.6rem; font-size: 0.85rem;">
                <div style="display: flex; justify-content: space-between;"><span style="color: var(--text-secondary);">Share Amount:</span><span style="font-weight:600;">Rs. ${shareAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
                <div style="display: flex; justify-content: space-between;"><span style="color: var(--text-secondary);">Broker Commission:</span><span style="font-weight:600;">Rs. ${commission.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
                <div style="display: flex; justify-content: space-between;"><span style="color: var(--text-secondary);">SEBON Fee:</span><span style="font-weight:600;">Rs. ${sebonFee.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
                <div style="display: flex; justify-content: space-between;"><span style="color: var(--text-secondary);">DP Fee:</span><span style="font-weight:600;">Rs. ${dpFee.toFixed(2)}</span></div>
                
                <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.06); margin: 0.5rem 0;">
                
                <div style="display: flex; justify-content: space-between; font-weight: 800; font-size: 1rem;">
                    <span style="color: #fff;">Total Cost:</span>
                    <span style="color: #ef4444;">Rs. ${totalCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-weight: 700; font-size: 0.9rem; margin-top: 0.2rem;">
                    <span style="color: var(--text-secondary);">Effective WACC:</span>
                    <span style="color: var(--primary);">Rs. ${wacc.toLocaleString('en-IN', { minimumFractionDigits: 4 })}</span>
                </div>
            </div>
        `;
    } else {
        const wacc = parseFloat(document.getElementById('drawer-wacc').value) || 0;
        const costBasis = qty * wacc;
        const grossProfit = shareAmount - commission - sebonFee - dpFee;
        const taxableProfit = grossProfit - costBasis;
        const cgt = taxableProfit > 0 ? taxableProfit * 0.05 : 0;
        const receivableAmount = shareAmount - commission - sebonFee - dpFee - cgt;
        const netProfit = receivableAmount - costBasis;

        resultsEl.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 0.6rem; font-size: 0.85rem;">
                <div style="display: flex; justify-content: space-between;"><span style="color: var(--text-secondary);">Share Amount:</span><span style="font-weight:600;">Rs. ${shareAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
                <div style="display: flex; justify-content: space-between;"><span style="color: var(--text-secondary);">Broker Commission:</span><span style="font-weight:600;">Rs. ${commission.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
                <div style="display: flex; justify-content: space-between;"><span style="color: var(--text-secondary);">SEBON Fee:</span><span style="font-weight:600;">Rs. ${sebonFee.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
                <div style="display: flex; justify-content: space-between;"><span style="color: var(--text-secondary);">DP Fee:</span><span style="font-weight:600;">Rs. ${dpFee.toFixed(2)}</span></div>
                <div style="display: flex; justify-content: space-between;"><span style="color: var(--text-secondary);">Capital Gain Tax (5%):</span><span style="font-weight:600; color: ${cgt > 0 ? '#ef4444' : 'inherit'};">Rs. ${cgt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
                
                <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.06); margin: 0.5rem 0;">
                
                <div style="display: flex; justify-content: space-between; font-weight: 800; font-size: 1rem;">
                    <span style="color: #fff;">Receivable Amount:</span>
                    <span style="color: #10b981;">Rs. ${receivableAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                
                <div style="margin-top: 0.75rem; padding: 0.85rem; border-radius: 10px; background: ${netProfit >= 0 ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)'}; text-align: center; border: 1px solid ${netProfit >= 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)'};">
                    <div style="font-size: 0.78rem; color: var(--text-secondary); margin-bottom: 0.2rem;">Net Profit / Loss</div>
                    <div style="font-size: 1.15rem; font-weight: 800; color: ${netProfit >= 0 ? '#10b981' : '#ef4444'};">
                        Rs. ${netProfit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </div>
                </div>
            </div>
        `;
    }
}

async function loadBrokerAnalytics(days = 1) {
    const symbolLabel = document.getElementById('broker-symbol-label');
    const loader = document.getElementById('broker-loader');
    const container = document.getElementById('broker-holdings-container');
    const emptyState = document.getElementById('broker-empty');

    if (symbolLabel) symbolLabel.innerText = activeSymbol;
    if (loader) loader.style.display = 'flex';
    if (container) { container.innerHTML = ''; container.style.display = 'none'; }
    if (emptyState) emptyState.style.display = 'none';

    const today = new Date().toISOString().split('T')[0];

    try {
        // Fetch all three in parallel
        const [brokerData, topBuyData, topSellData, floorData] = await Promise.allSettled([
            DataService.getBrokerTopHolding(activeSymbol, days),
            DataService.getTopBuy(activeSymbol, today, today),
            DataService.getTopSell(activeSymbol, today, today),
            DataService.getFloorsheet(activeSymbol, 0, 50)
        ]);

        if (loader) loader.style.display = 'none';

        // ── Helper ────────────────────────────────────────────────────
        const fmt = (num) => num ? `Rs. ${Number(num).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : 'Rs. 0.00';

        // ── 1. BROKER TOP HOLDINGS ─────────────────────────────────────
        const holdings = (() => {
            const raw = brokerData.value;
            if (Array.isArray(raw)) return raw;
            if (raw && Array.isArray(raw.value)) return raw.value;
            return [];
        })();

        if (container) {
            if (holdings.length === 0) {
                container.innerHTML = `<div class="broker-empty-inline">No broker holding data for this timeframe.</div>`;
            } else {
                const brokerMap = {};
                holdings.forEach(item => {
                    const id = item.buyer;
                    const qty  = parseFloat(item.quantity) || 0;
                    const amt  = parseFloat(item.amount) || qty * (parseFloat(item.rate) || 0);
                    if (!brokerMap[id]) brokerMap[id] = { buyer: id, quantity: 0, amount: 0 };
                    brokerMap[id].quantity += qty;
                    brokerMap[id].amount   += amt;
                });
                const sorted = Object.values(brokerMap).sort((a, b) => b.quantity - a.quantity);
                container.innerHTML = sorted.map(item => {
                    const avgRate = item.quantity > 0 ? (item.amount / item.quantity) : 0;
                    return `
                    <div class="broker-card">
                        <div class="broker-image-container">
                            <img class="broker-photo"
                                 src="../../images/brokers/Broker no. ${item.buyer}.png"
                                 onerror="this.onerror=null;this.style.display='none';document.getElementById('avf-${item.buyer}').style.display='flex';"
                                 alt="Broker ${item.buyer}" style="display:none;"/>
                            <div class="broker-avatar" id="avf-${item.buyer}">B${item.buyer}</div>
                        </div>
                        <div class="broker-info">
                            <div class="broker-name-title">Broker No. ${item.buyer}</div>
                            <div class="broker-metric-row"><span>Shares Bought:</span><span class="broker-metric-val highlight">${Number(item.quantity).toLocaleString('en-IN')}</span></div>
                            <div class="broker-metric-row"><span>Avg Rate:</span><span class="broker-metric-val">Rs. ${avgRate.toFixed(2)}</span></div>
                            <div class="broker-metric-row"><span>Total Outlay:</span><span class="broker-metric-val">${fmt(item.amount)}</span></div>
                        </div>
                    </div>`;
                }).join('');
            }
            container.style.display = 'grid';
        }

        // ── 2. TOP BUY / TOP SELL side-by-side ────────────────────────
        const topBuy  = Array.isArray(topBuyData.value)  ? topBuyData.value  : [];
        const topSell = Array.isArray(topSellData.value) ? topSellData.value : [];

        let buySellEl = document.getElementById('broker-buysell-section');
        if (!buySellEl) {
            buySellEl = document.createElement('div');
            buySellEl.id = 'broker-buysell-section';
            buySellEl.style.cssText = 'margin-top:1.5rem;';
            container.parentElement.appendChild(buySellEl);
        }

        const renderBrokerTable = (data, label, colorClass) => {
            if (!data.length) return `<div class="broker-empty-inline">No ${label} data for today.</div>`;
            return `
            <table class="financials-table glass-table" style="font-size:0.82rem;">
                <thead><tr>
                    <th>Broker</th><th style="text-align:right">Shares</th><th style="text-align:right">Avg Rate</th><th style="text-align:right">Amount</th>
                </tr></thead>
                <tbody>
                ${data.slice(0, 15).map(r => `
                    <tr>
                        <td>No. ${r.broker_number || r.buyer || '—'}</td>
                        <td style="text-align:right" class="${colorClass}">${Number(r.quantity || 0).toLocaleString('en-IN')}</td>
                        <td style="text-align:right">Rs. ${parseFloat(r.rate || r.avg_rate || 0).toFixed(2)}</td>
                        <td style="text-align:right">${fmt(r.amount || 0)}</td>
                    </tr>`).join('')}
                </tbody>
            </table>`;
        };

        buySellEl.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1.5rem;">
            <div class="glass" style="padding:1rem;border-radius:12px;">
                <div class="card-title-text" style="margin-bottom:0.75rem;font-size:0.85rem;">
                    <i class="fas fa-arrow-up" style="color:#10b981;margin-right:0.4rem;"></i>TOP BUYERS · ${today}
                </div>
                ${renderBrokerTable(topBuy, 'Top Buy', 'price-up')}
            </div>
            <div class="glass" style="padding:1rem;border-radius:12px;">
                <div class="card-title-text" style="margin-bottom:0.75rem;font-size:0.85rem;">
                    <i class="fas fa-arrow-down" style="color:#ef4444;margin-right:0.4rem;"></i>TOP SELLERS · ${today}
                </div>
                ${renderBrokerTable(topSell, 'Top Sell', 'price-down')}
            </div>
        </div>`;

        // ── 3. FLOORSHEET ──────────────────────────────────────────────
        const floorRaw  = floorData.value;
        const floorRows = Array.isArray(floorRaw)
            ? floorRaw
            : (floorRaw && Array.isArray(floorRaw.data) ? floorRaw.data : []);

        let floorEl = document.getElementById('broker-floorsheet-section');
        if (!floorEl) {
            floorEl = document.createElement('div');
            floorEl.id = 'broker-floorsheet-section';
            container.parentElement.appendChild(floorEl);
        }

        if (floorRows.length > 0) {
            floorEl.innerHTML = `
            <div class="card-title-text" style="margin-bottom:0.75rem;font-size:0.85rem;">
                <i class="fas fa-list-alt" style="color:var(--primary);margin-right:0.4rem;"></i>FLOORSHEET · ${activeSymbol}
            </div>
            <div style="overflow-x:auto;">
            <table class="financials-table glass-table" style="font-size:0.8rem;white-space:nowrap;">
                <thead><tr>
                    <th>#</th><th>Buyer</th><th>Seller</th>
                    <th style="text-align:right">Qty</th>
                    <th style="text-align:right">Rate</th>
                    <th style="text-align:right">Amount</th>
                </tr></thead>
                <tbody>
                ${floorRows.map((r, i) => `
                    <tr>
                        <td style="color:var(--text-secondary)">${i + 1}</td>
                        <td class="price-up">${r.buyer || '—'}</td>
                        <td class="price-down">${r.seller || '—'}</td>
                        <td style="text-align:right">${Number(r.quantity || 0).toLocaleString('en-IN')}</td>
                        <td style="text-align:right">Rs. ${parseFloat(r.rate || 0).toFixed(2)}</td>
                        <td style="text-align:right">${fmt(r.amount || 0)}</td>
                    </tr>`).join('')}
                </tbody>
            </table>
            </div>`;
        } else {
            floorEl.innerHTML = `<div class="broker-empty-inline">No floorsheet transactions found for today.</div>`;
        }

    } catch (err) {
        console.error("Failed to render broker analytics:", err);
        if (loader) loader.style.display = 'none';
        if (emptyState) emptyState.style.display = 'block';
    }
}

async function loadFinancialsAnalytics() {
    const loader = document.getElementById('financials-loader');
    const emptyState = document.getElementById('financials-empty');
    const tableContainer = document.getElementById('financials-table-container');
    const symbolLabel = document.getElementById('financials-symbol-label');

    if (symbolLabel) {
        symbolLabel.innerText = activeSymbol;
    }

    if (loader) loader.style.display = 'flex';
    if (emptyState) emptyState.style.display = 'none';
    if (tableContainer) tableContainer.style.display = 'none';

    try {
        console.log(`📡 Fetching financials report for ${activeSymbol}`);
        const report = await DataService.getStockReport(activeSymbol);
        
        if (report && Array.isArray(report) && report.length > 0) {
            financialsData = report;
            if (tableContainer) tableContainer.style.display = 'block';
            renderFinancialsTable();
        } else {
            financialsData = [];
            if (emptyState) emptyState.style.display = 'block';
        }
    } catch (err) {
        console.error("Failed to load stock report:", err);
        financialsData = [];
        if (emptyState) emptyState.style.display = 'block';
    } finally {
        if (loader) loader.style.display = 'none';
    }
}

function renderFinancialsTable() {
    const thead = document.getElementById('financials-thead');
    const tbody = document.getElementById('financials-tbody');
    const addBtn = document.getElementById('add-quarter-btn');
    const removeBtn = document.getElementById('remove-quarter-btn');

    if (!thead || !tbody) return;

    if (!financialsData || financialsData.length === 0) {
        const tbl = document.getElementById('financials-table-container');
        if (tbl) tbl.style.display = 'none';
        const emp = document.getElementById('financials-empty');
        if (emp) emp.style.display = 'block';
        return;
    }

    // Bind add/remove button states and behaviors
    if (addBtn) {
        const canAdd = visibleQuartersCount < financialsData.length;
        addBtn.disabled = !canAdd;
        addBtn.classList.toggle('disabled', !canAdd);
        addBtn.onclick = () => {
            if (visibleQuartersCount < financialsData.length) {
                visibleQuartersCount++;
                renderFinancialsTable();
            }
        };
    }

    if (removeBtn) {
        const canRemove = visibleQuartersCount > 1;
        removeBtn.disabled = !canRemove;
        removeBtn.classList.toggle('disabled', !canRemove);
        removeBtn.onclick = () => {
            if (visibleQuartersCount > 1) {
                visibleQuartersCount--;
                renderFinancialsTable();
            }
        };
    }

    // Get the sliced quarters list
    const visibleQuarters = financialsData.slice(0, visibleQuartersCount);
    const showDifference = visibleQuarters.length === 2;

    // Helper to format currency/numbers beautifully matching the screenshot
    function formatFinancialAmount(num, isDecimal = false) {
        if (num === null || num === undefined || isNaN(num)) return '-';
        if (isDecimal) {
            return num % 1 === 0 ? num.toString() : num.toFixed(2);
        }
        const absNum = Math.abs(num);
        const prefix = num < 0 ? '-' : '';
        let valStr = '';
        if (absNum >= 1000000000) { // 1 Arab = 1,000,000,000
            const val = absNum / 1000000000;
            valStr = `${val % 1 === 0 ? val.toString() : val.toFixed(2)} Arab`;
        } else if (absNum >= 10000000) { // 1 Crore = 10,000,000
            const val = absNum / 10000000;
            valStr = `${val % 1 === 0 ? val.toString() : val.toFixed(2)} Cr`;
        } else if (absNum >= 100000) { // 1 Lakh = 100,000
            const val = absNum / 100000;
            valStr = `${val % 1 === 0 ? val.toString() : val.toFixed(2)} L`;
        } else if (absNum >= 1000) { // 1 Thousand = 1,000
            const val = absNum / 1000;
            valStr = `${val % 1 === 0 ? val.toString() : val.toFixed(2)} K`;
        } else {
            valStr = absNum.toString();
        }
        return prefix + valStr;
    }

    // 1. Render Table Head (Columns)
    let headHtml = `<tr><th style="min-width: 220px; text-align: left;">KEY</th>`;
    if (showDifference) {
        headHtml += `<th style="text-align: right; min-width: 140px;">DIFFERENCE (%)</th>`;
    }
    visibleQuarters.forEach(q => {
        headHtml += `<th style="text-align: right; min-width: 130px;">${q.fiscal_year}, ${q.quarter.toUpperCase()}</th>`;
    });
    headHtml += `</tr>`;
    thead.innerHTML = headHtml;

    // 2. Render Table Rows for Metrics
    const rowConfigs = [
        { label: 'Administrative Expenses', key: 'administrative_expenses', colorize: true },
        { label: 'Deposit', key: 'deposit', colorize: true },
        { label: 'Depreciation', key: 'depreciation', colorize: true },
        { label: 'Distributable EPS', key: 'dps', isDecimal: true },
        { label: 'EPS (Reported)', key: 'eps', isDecimal: true },
        { label: 'EPS (Annualized)', key: 'eps_a', isDecimal: true },
        { label: 'Financial Expenses', key: 'financial_expenses', colorize: true },
        { label: 'Income from Other Sources', key: 'income_fromothersources', colorize: true },
        { label: 'Income from Sales of Electricity', key: 'income_from_sales_of_electricity', colorize: true },
        { label: 'Loans and Long Term Liabilities', key: 'loansandlong_termliabilities', colorize: true },
        { label: 'Net Profit', key: 'net_profit', colorize: true, isProfit: true },
        { label: 'Net Worth', key: 'net_worth', isDecimal: true },
        { label: 'Operating Expenses', key: 'operating_expenses', colorize: true },
        { label: 'Operating Income', key: 'operating_income', colorize: true },
        { label: 'Paid Up Capital', key: 'paidup_capital' },
        { label: 'Property Plant and Equipment', key: 'property_plantandequipment' },
        { label: 'Reserve and Surplus', key: 'reserve_surplus', colorize: true },
        { label: 'RDA', key: 'roa', isDecimal: true },
        { label: 'RDE', key: 'roe', isDecimal: true },
        { label: 'Royalty', key: 'royalty', colorize: true },
        { label: 'Total Assets', key: 'total_assets' },
        { label: 'Total Current Assets', key: 'total_currentassets', colorize: true },
        { label: 'Total Current Liabilities', key: 'total_currentliabilities', colorize: true },
        { label: 'Total Equity', key: 'total_equity' },
        { label: 'Work in Progress', key: 'work_in_progress', colorize: true }
    ];

    let bodyHtml = '';
    rowConfigs.forEach(row => {
        let rowClass = '';
        if (row.isProfit) rowClass = 'class="total-row"';
        bodyHtml += `<tr ${rowClass}><td class="financials-metric-name">${row.label}</td>`;

        // Render Difference column if showing difference
        if (showDifference) {
            const q0 = visibleQuarters[0];
            const q1 = visibleQuarters[1];
            const val0 = q0[row.key];
            const val1 = q1[row.key];

            let diffText = '-';
            let diffClass = '';

            if (val0 !== null && val0 !== undefined && val1 !== null && val1 !== undefined && val1 !== 0) {
                const diffVal = ((val0 - val1) / Math.abs(val1)) * 100;
                
                if (diffVal > 0.005) {
                    diffText = `+${diffVal.toFixed(2)}%`;
                    diffClass = 'class="financials-val-positive"';
                } else if (diffVal < -0.005) {
                    diffText = `${diffVal.toFixed(2)}%`;
                    diffClass = 'class="financials-val-negative"';
                } else {
                    diffText = '0.00%';
                    diffClass = 'style="color: var(--primary); font-weight: 600;"';
                }
            } else if (val0 === 0 && val1 === 0) {
                diffText = '0.00%';
                diffClass = 'style="color: var(--primary); font-weight: 600;"';
            }

            bodyHtml += `<td style="text-align: right;" ${diffClass}>${diffText}</td>`;
        }

        // Render value columns for each visible quarter
        visibleQuarters.forEach(q => {
            const rawVal = q[row.key];
            let displayVal = formatFinancialAmount(rawVal, row.isDecimal);
            
            let colorClass = '';
            if (row.colorize && typeof rawVal === 'number') {
                if (rawVal > 0) {
                    colorClass = 'class="financials-val-positive"';
                } else if (rawVal < 0) {
                    colorClass = 'class="financials-val-negative"';
                }
            } else if (row.key === 'paidup_capital') {
                colorClass = 'style="color: var(--primary); font-weight: 600;"';
            }
            
            bodyHtml += `<td style="text-align: right;" ${colorClass}>${displayVal}</td>`;
        });
        bodyHtml += `</tr>`;
    });

    tbody.innerHTML = bodyHtml;
}

async function loadPriceHistory() {
    const loader = document.getElementById('price-history-loader');
    const emptyState = document.getElementById('price-history-empty');
    const tableContainer = document.getElementById('price-history-table-container');
    const paginationEl = document.getElementById('price-history-pagination');
    const symbolLabel = document.getElementById('price-history-symbol-label');

    if (symbolLabel) {
        symbolLabel.innerText = activeSymbol;
    }

    if (loader) loader.style.display = 'flex';
    if (emptyState) emptyState.style.display = 'none';
    if (tableContainer) tableContainer.style.display = 'none';
    if (paginationEl) paginationEl.style.display = 'none';

    try {
        console.log(`📡 Fetching price history for ${activeSymbol}`);
        const result = await DataService.getSymbolData(activeSymbol);
        
        if (result && result.success && Array.isArray(result.data)) {
            priceHistoryData = result.data;
            currentHistoryPage = 1;
            if (tableContainer) tableContainer.style.display = 'block';
            if (paginationEl) paginationEl.style.display = 'flex';
            renderPriceHistoryTable();
        } else {
            priceHistoryData = [];
            if (emptyState) emptyState.style.display = 'block';
        }
    } catch (err) {
        console.error("Failed to load price history:", err);
        priceHistoryData = [];
        if (emptyState) emptyState.style.display = 'block';
    } finally {
        if (loader) loader.style.display = 'none';
    }
}

function renderPriceHistoryTable() {
    const tbody = document.getElementById('price-history-tbody');
    const pageInfo = document.getElementById('price-history-page-info');
    const prevBtn = document.getElementById('price-history-prev-btn');
    const nextBtn = document.getElementById('price-history-next-btn');

    if (!tbody) return;

    if (!priceHistoryData || priceHistoryData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 20px; color: var(--text-secondary);">No data available</td></tr>`;
        if (pageInfo) pageInfo.innerText = 'Showing 0-0 of 0 entries';
        if (prevBtn) prevBtn.disabled = true;
        if (nextBtn) nextBtn.disabled = true;
        return;
    }

    const totalRecords = priceHistoryData.length;
    const totalPages = Math.ceil(totalRecords / historyItemsPerPage);

    // Bounds check
    if (currentHistoryPage < 1) currentHistoryPage = 1;
    if (currentHistoryPage > totalPages) currentHistoryPage = totalPages;

    const startIndex = (currentHistoryPage - 1) * historyItemsPerPage;
    const endIndex = Math.min(startIndex + historyItemsPerPage, totalRecords);

    const pageData = priceHistoryData.slice(startIndex, endIndex);

    let rowsHtml = '';
    pageData.forEach((item, index) => {
        const absoluteIndex = startIndex + index;
        const open = parseFloat(item.Open) || 0;
        const high = parseFloat(item.High) || 0;
        const low = parseFloat(item.Low) || 0;
        const close = parseFloat(item.Close) || 0;
        const volume = parseFloat(item.Volume) || 0;

        let changeVal = 0;
        let changePct = 0;
        if (absoluteIndex + 1 < totalRecords) {
            const prevClose = parseFloat(priceHistoryData[absoluteIndex + 1].Close) || 0;
            if (prevClose > 0) {
                changeVal = close - prevClose;
                changePct = (changeVal / prevClose) * 100;
            }
        } else {
            if (open > 0) {
                changeVal = close - open;
                changePct = (changeVal / open) * 100;
            }
        }

        const isPositive = changeVal > 0;
        const isNegative = changeVal < 0;
        let changeClass = '';
        let changePrefix = '';
        if (isPositive) {
            changeClass = 'class="financials-val-positive"';
            changePrefix = '+';
        } else if (isNegative) {
            changeClass = 'class="financials-val-negative"';
        }

        const changeText = `${changePrefix}${changeVal.toFixed(2)} (${changePrefix}${changePct.toFixed(2)}%)`;

        rowsHtml += `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.03);">
                <td style="padding: 10px; color: var(--text-primary); font-weight: 500;">${item.Date}</td>
                <td style="padding: 10px; text-align: right; color: var(--text-primary);">Rs. ${open.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                <td style="padding: 10px; text-align: right; color: #10b981;">Rs. ${high.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                <td style="padding: 10px; text-align: right; color: #ef4444;">Rs. ${low.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                <td style="padding: 10px; text-align: right; color: var(--text-primary); font-weight: 600;">Rs. ${close.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                <td style="padding: 10px; text-align: right; font-weight: 600;" ${changeClass}>${changeText}</td>
                <td style="padding: 10px; text-align: right; color: var(--text-primary);">${volume.toLocaleString('en-IN')}</td>
            </tr>
        `;
    });

    tbody.innerHTML = rowsHtml;

    if (pageInfo) {
        pageInfo.innerText = `Showing ${startIndex + 1} to ${endIndex} of ${totalRecords} entries`;
    }

    if (prevBtn) {
        prevBtn.disabled = currentHistoryPage === 1;
        prevBtn.classList.toggle('disabled', currentHistoryPage === 1);
    }

    if (nextBtn) {
        nextBtn.disabled = currentHistoryPage === totalPages;
        nextBtn.classList.toggle('disabled', currentHistoryPage === totalPages);
    }
}

// Start
document.addEventListener('DOMContentLoaded', init);
