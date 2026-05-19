/**
 * Notification Service - Handles browser push notifications, in-app toasts, and sound alerts
 */
const NotificationService = {
    _toastContainer: null,

    async requestPermission() {
        if (!("Notification" in window)) {
            console.error("This browser does not support desktop notification");
            return false;
        }

        if (Notification.permission === "granted") {
            return true;
        }

        if (Notification.permission !== "denied") {
            const permission = await Notification.requestPermission();
            return permission === "granted";
        }

        return false;
    },

    /**
     * Send both an OS-level notification AND an in-app toast
     * @param {string} title 
     * @param {string} body 
     * @param {string} icon 
     * @param {string} type - 'buy' | 'sell' | 'stoploss' | 'info'
     */
    send(title, body, icon = '/assets/logo.png', type = 'info') {
        // 1. OS-level browser push (only works if tab is NOT focused)
        if (Notification.permission === "granted") {
            try {
                new Notification(title, { body, icon });
            } catch (e) {
                // Some browsers block Notification constructor in certain contexts
                console.warn("OS Notification failed:", e);
            }
        }

        // 2. In-App Toast (always visible, even when tab is focused)
        this.showToast(title, body, type);

        // 3. Sound alert (respects mute preference)
        this.playAlertSound();
    },

    /**
     * Show an in-app toast notification that slides in from bottom-right
     */
    showToast(title, body, type = 'info') {
        this._ensureContainer();

        let iconClass = 'fa-info-circle';
        if (type === 'buy') iconClass = 'fa-shopping-cart';
        if (type === 'sell') iconClass = 'fa-hand-holding-usd';
        if (type === 'stoploss') iconClass = 'fa-exclamation-triangle';

        const toast = document.createElement('div');
        toast.className = `toast-item toast-${type}`;
        toast.innerHTML = `
            <div class="toast-icon ${type}">
                <i class="fas ${iconClass}"></i>
            </div>
            <div class="toast-body">
                <div class="toast-title">${title}</div>
                <div class="toast-msg">${body}</div>
            </div>
            <button class="toast-close" aria-label="Dismiss">
                <i class="fas fa-times"></i>
            </button>
            <div class="toast-progress"></div>
        `;

        // Close on click
        toast.querySelector('.toast-close').onclick = (e) => {
            e.stopPropagation();
            this._dismissToast(toast);
        };

        // Click toast body to dismiss
        toast.onclick = () => this._dismissToast(toast);

        this._toastContainer.appendChild(toast);

        // Cap max visible toasts at 4
        const toasts = this._toastContainer.querySelectorAll('.toast-item:not(.exiting)');
        if (toasts.length > 4) {
            this._dismissToast(toasts[0]);
        }

        // Auto-dismiss after 5 seconds
        setTimeout(() => {
            if (toast.parentNode) {
                this._dismissToast(toast);
            }
        }, 5000);
    },

    _dismissToast(toast) {
        if (!toast || toast.classList.contains('exiting')) return;
        toast.classList.add('exiting');
        setTimeout(() => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 350);
    },

    _ensureContainer() {
        if (!this._toastContainer || !document.body.contains(this._toastContainer)) {
            this._toastContainer = document.createElement('div');
            this._toastContainer.className = 'toast-container';
            this._toastContainer.id = 'toast-container';
            document.body.appendChild(this._toastContainer);
        }
    },

    /**
     * Check if sound is muted from localStorage settings
     */
    isSoundMuted() {
        try {
            const settings = JSON.parse(localStorage.getItem('nepse_settings') || '{}');
            return settings.soundMuted === true;
        } catch {
            return false;
        }
    },

    /**
     * Toggle sound mute on/off
     */
    toggleSound() {
        try {
            const settings = JSON.parse(localStorage.getItem('nepse_settings') || '{}');
            settings.soundMuted = !settings.soundMuted;
            localStorage.setItem('nepse_settings', JSON.stringify(settings));
            return settings.soundMuted;
        } catch {
            return false;
        }
    },

    playAlertSound() {
        if (this.isSoundMuted()) return;

        try {
            const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
            audio.volume = 0.4;
            audio.play().catch(() => {});
        } catch (e) {
            console.warn("Sound play failed", e);
        }
    }
};

export default NotificationService;
