import DataService from '../services/dataService.js';

/**
 * State Management System
 * Uses Subscribe/Notify pattern
 */
class State {
    constructor() {
        this.state = {
            stocks: [],
            news: [],
            portfolio: [],
            watchlist: [],
            theme: 'light',
            activePage: 'dashboard',
            isLoading: false,
            searchQuery: '',
            nepseIndex: null,
            marketSummary: null
        };
        this.listeners = [];

        // Watch for DOM loaded to apply any cached state to header
        if (typeof document !== 'undefined') {
            document.addEventListener('DOMContentLoaded', () => {
                this.updateHeaderDOM();
            });
        }

        this.initHeaderUpdates();
    }

    getState() {
        return { ...this.state };
    }

    setState(newState) {
        this.state = { ...this.state, ...newState };
        this.updateHeaderDOM();
        this.notify();
    }

    subscribe(listener) {
        this.listeners.push(listener);
        // Return unsubscribe function
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    notify() {
        this.listeners.forEach(listener => listener(this.state));
    }

    updateHeaderDOM() {
        if (typeof document === 'undefined') return;

        const nepse = this.state.nepseIndex;
        const summary = this.state.marketSummary;

        if (nepse) {
            let indexValue = nepse.indexValue;
            let difference = nepse.difference;
            let percentChange = nepse.percentChange;

            // If on the dashboard/index page and we have chart-calculated values for NEPSE, use them!
            if (this.state.activePage === 'index' && this.chartLastPrice !== undefined && this.chartLastPrice !== null) {
                indexValue = this.chartLastPrice;
                difference = this.chartLastDiff;
                percentChange = this.chartLastPct;
            }

            const isUp = difference >= 0;
            const prefix = isUp ? '+' : '';

            const headerVal = document.getElementById('header-nepse-val');
            if (headerVal) {
                const newVal = indexValue.toLocaleString('en-IN', { minimumFractionDigits: 2 });
                if (headerVal.innerText !== newVal) {
                    headerVal.innerText = newVal;
                }
            }

            const headerChange = document.getElementById('header-nepse-change');
            if (headerChange) {
                const newChangeText = `${prefix}${difference.toFixed(2)} (${prefix}${percentChange.toFixed(2)}%)`;
                if (headerChange.innerText !== newChangeText) {
                    headerChange.innerText = newChangeText;
                }
                const newClass = isUp ? 'price-up' : 'price-down';
                if (headerChange.className !== newClass) {
                    headerChange.className = newClass;
                }
            }
        }

        if (summary && summary.totalTurnover) {
            const totalTurnover = summary.totalTurnover.totalTradedValue || 0;
            const totalVolume = summary.totalTurnover.totalTradedQuantity || 0;

            const headerTurnoverEl = document.getElementById('header-nepse-turnover');
            if (headerTurnoverEl) {
                const formattedTurnoverVal = `Rs. ${this.formatCurrency(totalTurnover)}`;
                if (headerTurnoverEl.innerText !== formattedTurnoverVal) {
                    headerTurnoverEl.innerText = formattedTurnoverVal;
                }
            }

            const headerVolumeEl = document.getElementById('header-nepse-volume');
            if (headerVolumeEl) {
                const formattedVolumeVal = totalVolume.toLocaleString('en-IN');
                if (headerVolumeEl.innerText !== formattedVolumeVal) {
                    headerVolumeEl.innerText = formattedVolumeVal;
                }
            }
        } else if (nepse) {
            // Fallback to nepse object turnover/volume
            const totalTurnover = nepse.turnover || 0;
            const totalVolume = nepse.volume || 0;

            const headerTurnoverEl = document.getElementById('header-nepse-turnover');
            if (headerTurnoverEl) {
                const formattedTurnoverVal = `Rs. ${this.formatCurrency(totalTurnover)}`;
                if (headerTurnoverEl.innerText !== formattedTurnoverVal) {
                    headerTurnoverEl.innerText = formattedTurnoverVal;
                }
            }

            const headerVolumeEl = document.getElementById('header-nepse-volume');
            if (headerVolumeEl) {
                const formattedVolumeVal = totalVolume.toLocaleString();
                if (headerVolumeEl.innerText !== formattedVolumeVal) {
                    headerVolumeEl.innerText = formattedVolumeVal;
                }
            }
        }
    }

    formatCurrency(val) {
        return val.toLocaleString('en-IN', {
            maximumFractionDigits: 2,
            minimumFractionDigits: 2
        });
    }

    initHeaderUpdates() {
        const fetchHeaderData = async () => {
            try {
                const [indices, summary] = await Promise.allSettled([
                    DataService.getIndices(),
                    DataService.getMarketSummary()
                ]);

                let nepseIndex = null;
                if (indices.status === 'fulfilled' && indices.value) {
                    const raw = indices.value;
                    const indexParsed = raw.result || raw.data || (Array.isArray(raw) ? raw : null);
                    if (Array.isArray(indexParsed) && indexParsed.length > 0) {
                        nepseIndex = indexParsed.map(item => {
                            const indexName = item.indexName || item.name || '';
                            const indexValue = parseFloat(item.indexValue || item.currentValue || 0);
                            const difference = parseFloat(item.difference !== undefined ? item.difference : (item.change !== undefined ? item.change : 0));
                            const percentChange = parseFloat(item.percentChange !== undefined ? item.percentChange : (item.changePercent !== undefined ? item.changePercent : 0));
                            return {
                                ...item,
                                indexName,
                                indexValue,
                                difference,
                                percentChange
                            };
                        }).find(i => i.indexName.toLowerCase() === 'nepse');
                    }
                }

                let marketSummary = null;
                if (summary.status === 'fulfilled' && summary.value) {
                    marketSummary = summary.value;
                }

                this.setState({ nepseIndex, marketSummary });
            } catch (err) {
                console.error('Error fetching header values:', err);
            }
        };

        // Run immediately and then every 5 seconds
        fetchHeaderData();
        setInterval(fetchHeaderData, 5000);
    }
}

(function () {
    // API endpoint (CORS-enabled on Render should be fine)
    const API_URL = 'https://marketstatus.onrender.com/market-status';

    // DOM elements
    const dotElement = document.getElementById('marketDot');

    // Helper: remove existing animation classes from dot
    function resetDotAnimations() {
        if (dotElement) {
            dotElement.classList.remove('dot-open', 'dot-closed');
        }
    }

    // Helper: update UI based on status string
    // Returns true if market is open or pre-open, false otherwise
    function updateMarketDisplay(statusStr, fetchTime) {
        const normalized = statusStr.trim().toLowerCase();
        let isOpen = normalized === 'open' || normalized === 'market open';
        let isPreOpen = normalized.includes('pre-open') || normalized.includes('special');

        // apply proper blinking class & colors
        resetDotAnimations();
        const statusMessageSpan = document.getElementById('statusMessage');
        if (isOpen) {
            if (dotElement) dotElement.classList.add('dot-open');
            if (statusMessageSpan) statusMessageSpan.innerHTML = '🟢';
        } else if (isPreOpen) {
            if (dotElement) dotElement.classList.add('dot-pre-open');
            if (statusMessageSpan) statusMessageSpan.innerHTML = '🟡';
        } else {
            if (dotElement) dotElement.classList.add('dot-closed');
            if (statusMessageSpan) statusMessageSpan.innerHTML = '🔴';
        }

        return isOpen || isPreOpen;
    }

    // Helper: handle fetch errors gracefully
    function handleFetchError(msg, time) {
        console.error(`[Market Status Error] ${time}: ${msg}`);
        resetDotAnimations();
        if (dotElement) {
            dotElement.classList.add('dot-closed'); // default to closed/offline state
        }
        const statusMessageSpan = document.getElementById('statusMessage');
        if (statusMessageSpan) {
            statusMessageSpan.innerHTML = '⚪';
        }
    }

    // main function to fetch market status
    async function fetchMarketStatus() {

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 7000); // 7 sec timeout

            const response = await fetch(API_URL, {
                method: 'GET',
                headers: { 'Accept': 'application/json' },
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            // expected data structure: { "status": "market open" }  or { "status": "market close" }
            if (data && typeof data === 'object' && 'status' in data) {
                const marketStatusText = String(data.status);
                const fetchCompleteTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                return updateMarketDisplay(marketStatusText, fetchCompleteTime);
            } else {
                throw new Error('Invalid API format: missing "status" key');
            }

        } catch (err) {
            let userFriendlyMsg = '';
            if (err.name === 'AbortError') {
                userFriendlyMsg = 'Request timeout (server slow)';
            } else if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
                userFriendlyMsg = 'Network error / CORS or API unreachable';
            } else {
                userFriendlyMsg = err.message;
            }
            const errorTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            handleFetchError(userFriendlyMsg, errorTime);
            return false;
        }
    }

    // initial fetch when page loads
    fetchMarketStatus().then(isOpen => {
        // Only poll periodically if market is open
        if (isOpen) {
            setInterval(() => {
                fetchMarketStatus();
            }, 60000);
        }
    });

    // small console info
    // console.log('Market Status Monitor started · blinking dot will adapt to "market open" (green blink) or "market close" (red blink)');
})();

// Singleton instance
const globalState = new State();
export default globalState;
