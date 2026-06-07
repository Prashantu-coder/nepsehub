// Theme Switcher Implementation with Toast Notifications & Active Theme Highlight
class ThemeManager {
  constructor() {
    this.themes = ['classic-dark', 'pitch-black', 'slate-gray', 'midnight-blue', 'light'];
    this.themeNames = {
      'classic-dark': 'Classic Dark',
      'pitch-black': 'Pitch Black',
      'slate-gray': 'Slate Gray',
      'midnight-blue': 'Midnight Blue',
      'light': 'Light Mode'
    };
    this.themeIcons = {
      'classic-dark': '🌙',
      'pitch-black': '⚫',
      'slate-gray': '🗻',
      'midnight-blue': '🌃',
      'light': '☀️'
    };
    this.currentTheme = localStorage.getItem('theme') || 'classic-dark';
    this.init();
  }

  init() {
    // Apply theme without showing toast (on page load)
    this.applyTheme(this.currentTheme, true);
    this.createThemeSwitcher();
  }

  applyTheme(theme, skipToast = false) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    this.currentTheme = theme;
    
    // Update active class in dropdown if switcher exists
    this.updateActiveThemeInSwitcher();
    
    // Update toggle button icon
    const toggleIcon = document.querySelector('.theme-toggle-btn .theme-icon');
    if (toggleIcon) {
      toggleIcon.textContent = this.themeIcons[theme];
    }
    
    // Show toast only on user change (skipToast false)
    if (!skipToast) {
      this.showToast(`Theme changed to ${this.themeNames[theme]}`, 'success');
    }
  }

  updateActiveThemeInSwitcher() {
    const dropdown = document.querySelector('.theme-dropdown');
    if (!dropdown) return;
    
    const buttons = dropdown.querySelectorAll('[data-theme]');
    buttons.forEach(btn => {
      const theme = btn.getAttribute('data-theme');
      if (theme === this.currentTheme) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  showToast(message, type = 'info') {
    // Remove existing toast if any
    const existingToast = document.querySelector('.theme-toast');
    if (existingToast) existingToast.remove();

    // Create toast element
    const toast = document.createElement('div');
    toast.className = 'theme-toast';
    
    let icon = '🎨';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';
    
    toast.innerHTML = `${icon} ${message}`;
    
    toast.style.cssText = `
      position: fixed;
      bottom: 80px;
      right: 80px;
      background: var(--surface-solid, #1e1e2f);
      color: var(--text-primary, #ffffff);
      padding: 12px 20px;
      border-radius: 8px;
      border-left: 4px solid var(--primary, #10b981);
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      z-index: 10000;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 14px;
      font-weight: 500;
      backdrop-filter: blur(8px);
      animation: fadeInUp 0.3s ease;
      transition: opacity 0.3s;
    `;
    
    if (!document.querySelector('#toast-keyframes')) {
      const style = document.createElement('style');
      style.id = 'toast-keyframes';
      style.textContent = `
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `;
      document.head.appendChild(style);
    }
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  createThemeSwitcher() {
    const switcher = document.createElement('div');
    switcher.className = 'theme-switcher';
    const currentIcon = this.themeIcons[this.currentTheme];
    switcher.innerHTML = `
      <button class="theme-toggle-btn" aria-label="Switch theme">
        <span class="theme-icon">${currentIcon}</span>
      </button>
      <div class="theme-dropdown">
        <button data-theme="classic-dark">🌙 Classic Dark</button>
        <button data-theme="pitch-black">⚫ Pitch Black</button>
        <button data-theme="slate-gray">🗻 Slate Gray</button>
        <button data-theme="midnight-blue">🌃 Midnight Blue</button>
        <button data-theme="light">☀️ Light Mode</button>
      </div>
    `;

    document.body.appendChild(switcher);
    // Apply active class to current theme button
    this.updateActiveThemeInSwitcher();
    this.attachEventListeners(switcher);
  }

  attachEventListeners(switcher) {
    const toggleBtn = switcher.querySelector('.theme-toggle-btn');
    const dropdown = switcher.querySelector('.theme-dropdown');
    const themeButtons = switcher.querySelectorAll('[data-theme]');

    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('active');
    });

    themeButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const theme = btn.getAttribute('data-theme');
        // User changed theme → show toast
        this.applyTheme(theme, false);
        dropdown.classList.remove('active');
      });
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!switcher.contains(e.target)) {
        dropdown.classList.remove('active');
      }
    });
  }
}

// Initialize theme manager
const themeManager = new ThemeManager();