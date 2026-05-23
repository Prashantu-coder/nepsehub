import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// --- CONFIGURATION ---
// Replace these with your actual Supabase project details
const SUPABASE_URL = 'https://yzvarygeeycsbttxzusg.supabase.co';
const SUPABASE_KEY = 'sb_publishable_hKShryc4e4rFs5zbfvFubw_j2jv2gFW';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const STORAGE_KEYS = {
    SETTINGS: 'nepse_hub_settings',
    NOTIFICATIONS: 'nepse_notifications'
};

const StorageService = {
    // --- Watchlist (Supabase) ---
    async getWatchlist() {
        try {
            const { data, error } = await supabase
                .from('watchlist')
                .select('*')
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data || []; // full rows: { id, symbol, target_buy, target_sell, notes }
        } catch (err) {
            console.error('Watchlist Error:', err.message);
            return [];
        }
    },

    async addToWatchlist({ symbol, target_buy = null, target_sell = null, notes = null }) {
        try {
            const { error } = await supabase
                .from('watchlist')
                .upsert({ symbol, target_buy, target_sell, notes }, { onConflict: 'symbol' });
            return !error;
        } catch (err) {
            console.error('AddToWatchlist Error:', err.message);
            return false;
        }
    },

    async updateWatchlistItem(id, updates) {
        try {
            const { error } = await supabase
                .from('watchlist')
                .update(updates)
                .eq('id', id);
            return !error;
        } catch (err) {
            console.error('UpdateWatchlistItem Error:', err.message);
            return false;
        }
    },

    async removeFromWatchlist(symbol) {
        try {
            const { error } = await supabase
                .from('watchlist')
                .delete()
                .eq('symbol', symbol);
            return !error;
        } catch (err) {
            console.error('RemoveFromWatchlist Error:', err.message);
            return false;
        }
    },

    async isInWatchlist(symbol) {
        try {
            const { data, error } = await supabase
                .from('watchlist')
                .select('symbol')
                .eq('symbol', symbol);
            if (error) throw error;
            return data && data.length > 0;
        } catch (err) {
            console.error('IsInWatchlist Error:', err.message);
            return false;
        }
    },

    // --- Trade Plans (Supabase) ---
    async getTradePlans() {
        try {
            const { data, error } = await supabase
                .from('trade_plans')
                .select('*')
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data || [];
        } catch (err) {
            console.error('Trade Plans Fetch Error:', err.message);
            return [];
        }
    },

    async saveTradePlan(plan) {
        try {
            const { data, error } = await supabase
                .from('trade_plans')
                .insert([plan])
                .select();
            if (error) throw error;
            return { success: true, data: data[0] };
        } catch (err) {
            console.error('Save Trade Plan Error:', err.message);
            return { success: false, error: err.message };
        }
    },

    async deleteTradePlan(id) {
        try {
            const { error } = await supabase
                .from('trade_plans')
                .delete()
                .eq('id', id);
            return !error;
        } catch (err) {
            console.error('Delete Trade Plan Error:', err.message);
            return false;
        }
    },

    // --- Transactions — Single Source of Truth (Supabase) ---
    async getTransactions() {
        try {
            const { data, error } = await supabase
                .from('transactions')
                .select('*')
                .order('transaction_date', { ascending: false });
            if (error) throw error;
            return { success: true, data: data || [] };
        } catch (err) {
            console.error('Transactions Fetch Error:', err.message);
            return { success: false, error: err.message, data: [] };
        }
    },

    async addTransaction(tx) {
        try {
            const { data, error } = await supabase
                .from('transactions')
                .insert([tx])
                .select();
            if (error) throw error;
            return { success: true, data: data[0] };
        } catch (err) {
            console.error('Add Transaction Error:', err.message);
            return { success: false, error: err.message };
        }
    },

    async deleteTransaction(id) {
        try {
            const { error } = await supabase
                .from('transactions')
                .delete()
                .eq('id', id);
            return !error;
        } catch (err) {
            console.error('Delete Transaction Error:', err.message);
            return false;
        }
    },

    // --- Notifications (Supabase) ---
    async getNotifications() {
        try {
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            
            const { data, error } = await supabase
                .from('notifications')
                .select('*')
                .gte('created_at', sevenDaysAgo.toISOString())
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            return data || [];
        } catch (err) {
            console.error('Notification Fetch Error:', err.message);
            return [];
        }
    },

    async addNotification(notif) {
        try {
            const { error } = await supabase
                .from('notifications')
                .insert([{
                    title: notif.title,
                    message: notif.message,
                    type: notif.type || 'info',
                    symbol: notif.symbol || null,
                    is_read: false
                }]);
            return !error;
        } catch (err) {
            console.error('AddNotification Error:', err.message);
            return false;
        }
    },

    async markNotificationsAsRead() {
        try {
            const { error } = await supabase
                .from('notifications')
                .update({ is_read: true })
                .eq('is_read', false);
            return !error;
        } catch (err) {
            console.error('MarkNotificationsAsRead Error:', err.message);
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
