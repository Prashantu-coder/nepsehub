/**
 * Notification Service - Handles browser push notifications and price alerts
 */
const NotificationService = {
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

    send(title, body, icon = '/assets/logo.png') {
        if (Notification.permission === "granted") {
            new Notification(title, {
                body: body,
                icon: icon
            });
            
            // Also play a subtle alert sound if possible
            this.playAlertSound();
        }
    },

    playAlertSound() {
        try {
            const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
            audio.volume = 0.5;
            audio.play();
        } catch (e) {
            console.warn("Sound play failed", e);
        }
    }
};

export default NotificationService;
