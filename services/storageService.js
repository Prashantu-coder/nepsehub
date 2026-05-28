const STORAGE_KEYS = {
    SETTINGS: 'nepse_hub_settings',
    NOTIFICATIONS: 'nepse_notifications'
};

const StorageService = {
    // --- Watchlist (Express Backend) ---
    async getWatchlist() {
        try {
            const response = await window.auth.apiCall('/api/watchlist');
            if (!response.ok) throw new Error('Failed to fetch watchlist');
            return await response.json();
        } catch (err) {
            console.error('Watchlist Fetch Error:', err.message);
            return [];
        }
    },

    async addToWatchlist({ symbol, target_buy = null, target_sell = null, notes = null }) {
        try {
            const response = await window.auth.apiCall('/api/watchlist', {
                method: 'POST',
                body: JSON.stringify({ symbol, target_buy, target_sell, notes })
            });
            if (!response.ok) throw new Error('Failed to add to watchlist');
            const data = await response.json();
            return data.success;
        } catch (err) {
            console.error('AddToWatchlist Error:', err.message);
            return false;
        }
    },

    async updateWatchlistItem(id, updates) {
        try {
            const response = await window.auth.apiCall(`/api/watchlist/${id}`, {
                method: 'PUT',
                body: JSON.stringify(updates)
            });
            if (!response.ok) throw new Error('Failed to update watchlist item');
            const data = await response.json();
            return data.success;
        } catch (err) {
            console.error('UpdateWatchlistItem Error:', err.message);
            return false;
        }
    },

    async removeFromWatchlist(symbol) {
        try {
            const response = await window.auth.apiCall(`/api/watchlist/${symbol}`, {
                method: 'DELETE'
            });
            if (!response.ok) throw new Error('Failed to remove from watchlist');
            const data = await response.json();
            return data.success;
        } catch (err) {
            console.error('RemoveFromWatchlist Error:', err.message);
            return false;
        }
    },

    async isInWatchlist(symbol) {
        try {
            const list = await this.getWatchlist();
            return list.some(item => item.symbol.toUpperCase() === symbol.toUpperCase());
        } catch (err) {
            console.error('IsInWatchlist Error:', err.message);
            return false;
        }
    },

    // --- Trade Plans (Express Backend) ---
    async getTradePlans() {
        try {
            const response = await window.auth.apiCall('/api/trade-plans');
            if (!response.ok) throw new Error('Failed to fetch trade plans');
            return await response.json();
        } catch (err) {
            console.error('Trade Plans Fetch Error:', err.message);
            return [];
        }
    },

    async saveTradePlan(plan) {
        try {
            const response = await window.auth.apiCall('/api/trade-plans', {
                method: 'POST',
                body: JSON.stringify(plan)
            });
            if (!response.ok) throw new Error('Failed to save trade plan');
            const data = await response.json();
            return data;
        } catch (err) {
            console.error('Save Trade Plan Error:', err.message);
            return { success: false, error: err.message };
        }
    },

    async deleteTradePlan(id) {
        try {
            const response = await window.auth.apiCall(`/api/trade-plans/${id}`, {
                method: 'DELETE'
            });
            return response.ok;
        } catch (err) {
            console.error('Delete Trade Plan Error:', err.message);
            return false;
        }
    },

    // --- Transactions — Single Source of Truth (Express Backend) ---
    async getTransactions() {
        try {
            const response = await window.auth.apiCall('/api/transactions');
            if (!response.ok) throw new Error('Failed to fetch transactions');
            return await response.json();
        } catch (err) {
            console.error('Transactions Fetch Error:', err.message);
            return { success: false, error: err.message, data: [] };
        }
    },

    async addTransaction(tx) {
        try {
            const response = await window.auth.apiCall('/api/transactions', {
                method: 'POST',
                body: JSON.stringify(tx)
            });
            if (!response.ok) throw new Error('Failed to add transaction');
            return await response.json();
        } catch (err) {
            console.error('Add Transaction Error:', err.message);
            return { success: false, error: err.message };
        }
    },

    async deleteTransaction(id) {
        try {
            const response = await window.auth.apiCall(`/api/transactions/${id}`, {
                method: 'DELETE'
            });
            if (!response.ok) throw new Error('Failed to delete transaction');
            const data = await response.json();
            return data.success;
        } catch (err) {
            console.error('Delete Transaction Error:', err.message);
            return false;
        }
    },

    // --- Notifications (Express Backend) ---
    async getNotifications() {
        try {
            const response = await window.auth.apiCall('/api/notifications');
            if (!response.ok) throw new Error('Failed to fetch notifications');
            return await response.json();
        } catch (err) {
            console.error('Notification Fetch Error:', err.message);
            return [];
        }
    },

    async addNotification(notif) {
        try {
            const response = await window.auth.apiCall('/api/notifications', {
                method: 'POST',
                body: JSON.stringify(notif)
            });
            return response.ok;
        } catch (err) {
            console.error('AddNotification Error:', err.message);
            return false;
        }
    },

    async markNotificationsAsRead() {
        try {
            const response = await window.auth.apiCall('/api/notifications/mark-read', {
                method: 'PUT'
            });
            if (!response.ok) throw new Error('Failed to mark notifications as read');
            const data = await response.json();
            return data.success;
        } catch (err) {
            console.error('MarkNotificationsAsRead Error:', err.message);
            return false;
        }
    },

    // --- Notification Settings (Express Backend) ---
    async getNotificationSettings() {
        try {
            const response = await window.auth.apiCall('/api/auth/notification-settings');
            if (!response.ok) throw new Error('Failed to fetch notification settings');
            const data = await response.json();
            return data.settings || {};
        } catch (err) {
            console.error('GetNotificationSettings Error:', err.message);
            return { marketSummaryFrequency: 'never', emailEnabled: false, telegramEnabled: false, telegramConnected: false };
        }
    },

    async updateNotificationSettings(settings) {
        try {
            const response = await window.auth.apiCall('/api/auth/notification-settings', {
                method: 'PUT',
                body: JSON.stringify(settings)
            });
            if (!response.ok) throw new Error('Failed to update notification settings');
            const data = await response.json();
            return data.success;
        } catch (err) {
            console.error('UpdateNotificationSettings Error:', err.message);
            return false;
        }
    },

    async getTelegramStatus() {
        try {
            const response = await window.auth.apiCall('/api/auth/telegram-status');
            if (!response.ok) throw new Error('Failed to fetch telegram status');
            const data = await response.json();
            return data.connected || false;
        } catch (err) {
            console.error('GetTelegramStatus Error:', err.message);
            return false;
        }
    },

    // --- Local Settings (LocalStorage) ---
    getSettings() {
        const settings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
        return settings ? JSON.parse(settings) : {
            theme: 'dark',
            compactMode: false,
            defaultCalculator: 'buy-sell'
        };
    },

    updateSettings(newSettings) {
        const current = this.getSettings();
        localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify({ ...current, ...newSettings }));
    },

    // Generic Load/Save for other keys (Legacy support)
    async load(key) {
        if (key === 'nepse_trade_plans') return await this.getTradePlans();
        if (key === 'nepse_watchlist') return await this.getWatchlist();
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : null;
    },

    async save(key, data) {
        localStorage.setItem(key, JSON.stringify(data));
    }
};

export default StorageService;
