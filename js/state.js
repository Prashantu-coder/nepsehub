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
            searchQuery: ''
        };
        this.listeners = [];
    }

    getState() {
        return { ...this.state };
    }

    setState(newState) {
        this.state = { ...this.state, ...newState };
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
}

// Singleton instance
const globalState = new State();
export default globalState;
