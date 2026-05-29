// Global fetch interceptor to catch 401 and redirect to login with a toast
(function() {
  const originalFetch = window.fetch;
  window.fetch = async function(input, init) {
    try {
      const response = await originalFetch(input, init);
      
      if (response.status === 401) {
        const url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
        const isAuthRoute = url.includes('/api/auth/login') || url.includes('/api/auth/register');
        const isRefreshRoute = url.includes('/api/auth/refresh');
        
        if (!isAuthRoute && window.auth && window.auth.isLoggedIn()) {
          // If this is a refresh attempt that failed, or if we don't have a refresh token to try
          if (isRefreshRoute || !window.auth.refreshToken) {
            window.auth.clearTokens();
            sessionStorage.setItem('login_toast_message', 'Session expired. Please log in again.');
            window.location.href = '/pages/login.html';
          }
        }
      }
      return response;
    } catch (error) {
      throw error;
    }
  };
})();

// Frontend Authentication State Manager
class AuthManager {
  constructor() {
    this.accessToken = localStorage.getItem('accessToken');
    this.refreshToken = localStorage.getItem('refreshToken');
    this.user = this.loadUser();
    this.isAuthenticated = !!this.accessToken;
    this.API_BASE = 'https://nepse-hub-backend-7uwu.onrender.com';

    // Cached data — fetched once on page load
    this._cachedTransactions = null;
    this._cachedWatchlist = null;
    this._transactionsLoaded = false;
    this._watchlistLoaded = false;

    // Fetch once on page load if authenticated
    if (this.isAuthenticated) {
      this._initDataPromise = this._fetchInitialData();
    }
  }

  // Fetch transactions & watchlist once on page load
  async _fetchInitialData() {
    try {
      const [transRes, watchRes] = await Promise.allSettled([
        this.apiCall('/api/transactions'),
        this.apiCall('/api/watchlist')
      ]);

      if (transRes.status === 'fulfilled' && transRes.value.ok) {
        this._cachedTransactions = await transRes.value.json();
        this._transactionsLoaded = true;
      }

      if (watchRes.status === 'fulfilled' && watchRes.value.ok) {
        this._cachedWatchlist = await watchRes.value.json();
        this._watchlistLoaded = true;
      }
    } catch (err) {
      console.error('Initial data fetch error:', err);
    }
  }

  // Get cached transactions (no new API call)
  async getCachedTransactions() {
    if (this._initDataPromise) await this._initDataPromise;
    return this._cachedTransactions || { success: false, data: [] };
  }

  // Get cached watchlist (no new API call)
  async getCachedWatchlist() {
    if (this._initDataPromise) await this._initDataPromise;
    return this._cachedWatchlist || [];
  }

  // Invalidate transaction cache (call after add/delete)
  invalidateTransactions() {
    this._transactionsLoaded = false;
    this._cachedTransactions = null;
  }

  // Invalidate watchlist cache (call after add/remove/update)
  invalidateWatchlist() {
    this._watchlistLoaded = false;
    this._cachedWatchlist = null;
  }

  // Refresh transaction cache from API
  async refreshTransactions() {
    try {
      const response = await this.apiCall('/api/transactions');
      if (response.ok) {
        this._cachedTransactions = await response.json();
        this._transactionsLoaded = true;
      }
    } catch (err) {
      console.error('Refresh transactions error:', err);
    }
    return this._cachedTransactions || { success: false, data: [] };
  }

  // Refresh watchlist cache from API
  async refreshWatchlist() {
    try {
      const response = await this.apiCall('/api/watchlist');
      if (response.ok) {
        this._cachedWatchlist = await response.json();
        this._watchlistLoaded = true;
      }
    } catch (err) {
      console.error('Refresh watchlist error:', err);
    }
    return this._cachedWatchlist || [];
  }

  // Load user from localStorage
  loadUser() {
    const userJson = localStorage.getItem('user');
    const user = userJson ? JSON.parse(userJson) : null;
    if (user && !user.id && this.accessToken) {
      this.getCurrentUser().then(updatedUser => {
        if (updatedUser) this.user = updatedUser;
      });
    }
    return user;
  }

  // Save user to localStorage
  saveUser(user) {
    this.user = user;
    localStorage.setItem('user', JSON.stringify(user));
  }

  // Login and store tokens
  setTokens(accessToken, refreshToken, user) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    this.isAuthenticated = true;

    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    this.saveUser(user);
  }

  // Logout and clear tokens
  clearTokens() {
    this.accessToken = null;
    this.refreshToken = null;
    this.user = null;
    this.isAuthenticated = false;

    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
  }

  // Get Authorization header
  getAuthHeader() {
    return {
      Authorization: `Bearer ${this.accessToken}`,
    };
  }

  // API call helper with auth
  async apiCall(endpoint, options = {}) {
    const url = endpoint.startsWith('http') ? endpoint : `${this.API_BASE}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    // Add auth token if available and not a public endpoint
    const publicAuthEndpoints = ['/api/auth/login', '/api/auth/register', '/api/auth/refresh'];
    const isPublicAuth = publicAuthEndpoints.some(ep => url.includes(ep));
    if (this.accessToken && !isPublicAuth) {
      headers.Authorization = `Bearer ${this.accessToken}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      // If 401, try to refresh token
      if (response.status === 401 && this.refreshToken) {
        const refreshed = await this.refreshAccessToken();
        if (refreshed) {
          // Retry the request with new token
          headers.Authorization = `Bearer ${this.accessToken}`;
          return await fetch(url, {
            ...options,
            headers,
          });
        } else {
          // Refresh failed, logout
          this.clearTokens();
          sessionStorage.setItem('login_toast_message', 'Session expired. Please log in again.');
          window.location.href = '/pages/login.html';
          return response;
        }
      }

      return response;
    } catch (error) {
      console.error('API call error:', error);
      throw error;
    }
  }

  // Refresh access token using refresh token
  async refreshAccessToken() {
    if (!this.refreshToken) {
      return false;
    }

    try {
      const response = await fetch(`${this.API_BASE}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: this.refreshToken }),
      });

      if (!response.ok) {
        return false;
      }

      const data = await response.json();
      this.accessToken = data.accessToken;
      localStorage.setItem('accessToken', data.accessToken);
      return true;
    } catch (error) {
      console.error('Token refresh error:', error);
      return false;
    }
  }

  // Register new user
  async register(email, username, password) {
    try {
      const response = await fetch(`${this.API_BASE}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, username, password }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Registration failed');
      }

      const data = await response.json();
      this.setTokens(data.accessToken, data.refreshToken, {
        id: data.id,
        code: data.code,
        email: data.email,
        username: data.username,
      });

      return data;
    } catch (error) {
      console.error('Registration error:', error);
      throw error;
    }
  }

  // Login with code and password
  async login(code, password) {
    try {
      const response = await fetch(`${this.API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, password }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Login failed');
      }

      const data = await response.json();
      this.setTokens(data.accessToken, data.refreshToken, {
        id: data.id,
        code: data.code,
        email: data.email,
        username: data.username,
      });

      return data;
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  }

  // Logout
  async logout() {
    try {
      await fetch(`${this.API_BASE}/api/auth/logout`, {
        method: 'POST',
        headers: this.getAuthHeader(),
      });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      this.clearTokens();
    }
  }

  // Get current user info
  async getCurrentUser() {
    try {
      const response = await this.apiCall('/api/auth/me');

      if (!response.ok) {
        throw new Error('Failed to get user info');
      }

      const data = await response.json();
      this.saveUser(data);
      return data;
    } catch (error) {
      console.error('Get user error:', error);
      return null;
    }
  }

  // Check if user is authenticated
  isLoggedIn() {
    return this.isAuthenticated && !!this.accessToken;
  }

  // Get user data
  getUser() {
    return this.user;
  }

  // Get current user ID from cached user object or by parsing JWT
  getUserId() {
    if (this.user && this.user.id) return this.user.id;
    if (this.accessToken) {
      const decoded = this.parseJwt(this.accessToken);
      if (decoded && decoded.userId) {
        if (this.user) {
          this.user.id = decoded.userId;
          this.saveUser(this.user);
        } else {
          this.saveUser({ id: decoded.userId });
        }
        return decoded.userId;
      }
    }
    return null;
  }

  // Helper to decode JWT token on client side
  parseJwt(token) {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      return JSON.parse(jsonPayload);
    } catch (e) {
      return null;
    }
  }
}

// Create global auth instance
const auth = new AuthManager();
window.auth = auth;
