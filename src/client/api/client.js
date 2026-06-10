import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - ensure token is always sent
api.interceptors.request.use(
  (config) => {
    // Try to get token from localStorage with multiple fallback keys
    const raw = localStorage.getItem('so-auth-storage') || localStorage.getItem('so-auth-storage-ALT');
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        // Support multiple token property paths (zustand persist format variations)
        const token = parsed?.state?.token || parsed?.token || parsed?.accessToken;
        if (token && token.length > 0) {
          config.headers['Authorization'] = `Bearer ${token}`;
        }
      } catch (e) {
        console.error('[API] Token parse error:', e);
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Handle 401 - unauthorized (no token)
    if (error.response?.status === 401) {
      localStorage.removeItem('so-auth-storage');
      localStorage.removeItem('so-auth-storage-ALT');
      window.location.href = '/login';
    }
    // Handle 403 - forbidden (invalid/expired token)
    if (error.response?.status === 403) {
      const errorMessage = error.response?.data?.error?.message || '';
      if (errorMessage.includes('token') || errorMessage.includes('Invalid') || errorMessage.includes('expired')) {
        localStorage.removeItem('so-auth-storage');
        localStorage.removeItem('so-auth-storage-ALT');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;