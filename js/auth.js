// Frontend Authentication State Manager
class AuthManager {
  constructor() {
    this.accessToken = localStorage.getItem('accessToken');
    this.refreshToken = localStorage.getItem('refreshToken');
    this.user = this.loadUser();
    this.isAuthenticated = !!this.accessToken;
    this.API_BASE = 'https://nepse-hub-backend-7uwu.onrender.com';
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
    if (this.accessToken && !url.includes('/api/auth/')) {
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
