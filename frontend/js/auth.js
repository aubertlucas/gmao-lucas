/**
 * Authentication Manager for GMAO application
 * Handles JWT token authentication, storage, and session management
 */
class AuthManager {
    constructor() {
        this.baseURL = 'http://frsasrvgmao:8000';
        this.token = localStorage.getItem('authToken');
        this.user = JSON.parse(localStorage.getItem('authUser') || 'null');
        this.initEventListeners();
    }
    
    /**
     * Initialize authentication-related event listeners
     */
    initEventListeners() {
        // Attach login form submission handler if the form exists
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const username = loginForm.querySelector('[name="username"]').value;
                const password = loginForm.querySelector('[name="password"]').value;
                await this.login(username, password);
            });
        }
    }
    
    /**
     * Authenticate user and store JWT token
     * @param {string} username - User's username
     * @param {string} password - User's password
     * @returns {Promise<boolean>} - Authentication success
     */
    async login(username, password) {
        try {
            const formData = new FormData();
            formData.append('username', username);
            formData.append('password', password);
            
            const response = await fetch(`${this.baseURL}/auth/login`, {
                method: 'POST',
                body: formData
            });
            
            if (response.ok) {
                const data = await response.json();
                this.token = data.access_token;
                this.user = data.user;
                localStorage.setItem('authToken', this.token);
                localStorage.setItem('authUser', JSON.stringify(this.user));
                
                // Effacer les caches de l'application
                this.clearAppCaches();
                
                // Redirection basée sur le rôle
                if (this.user.role === 'admin' || this.user.role === 'manager') {
                    window.location.href = 'dashboard.html?nocache=' + new Date().getTime();
                } else {
                    window.location.href = 'actions.html?nocache=' + new Date().getTime();
                }
                return true;
            } else {
                const errorData = await response.json();
                this.showLoginError(errorData.detail || 'Identifiants invalides');
                return false;
            }
        } catch (error) {
            console.error('Login error:', error);
            this.showLoginError('Erreur de connexion au serveur');
            return false;
        }
    }
    
    /**
     * Log user out and clear session data
     */
    logout() {
        this.token = null;
        this.user = null;
        localStorage.removeItem('authToken');
        localStorage.removeItem('authUser');
        
        // Effacer les caches de l'application
        this.clearAppCaches();
        
        // Forcer un rechargement complet sans cache pour garantir l'application des restrictions
        window.location.href = 'index.html?nocache=' + new Date().getTime();
    }
    
    /**
     * Efface les caches de l'application pour garantir l'application correcte des restrictions
     */
    clearAppCaches() {
        console.log('[AuthManager] Effacement des caches de l\'application');
        
        // Effacer les éléments de cache spécifiques à l'application
        localStorage.removeItem('actionColumnWidths');
        localStorage.removeItem('lastViewedActions');
        localStorage.removeItem('calendarActiveTab');
        
        // Effacer les sessions de l'application
        sessionStorage.clear();
        
        // Si l'API de cache est disponible, tenter de supprimer les caches
        if (window.caches) {
            try {
                // Tentative de suppression des caches de l'API Cache
                caches.keys().then(function(names) {
                    for (let name of names) {
                        caches.delete(name);
                    }
                });
                console.log('[AuthManager] Caches API supprimés');
            } catch (e) {
                console.warn('[AuthManager] Erreur lors de la suppression des caches API:', e);
            }
        }
    }
    
    /**
     * Check if user is authenticated
     * @returns {boolean} - Authentication status
     */
    isAuthenticated() {
        return !!this.token;
    }
    
    /**
     * Get the current authentication token
     * @returns {string|null} - Token or null if not authenticated
     */
    getToken() {
        return this.token;
    }
    
    /**
     * Get the current authenticated user
     * @returns {Object|null} - User object or null if not authenticated
     */
    getUser() {
        return this.user;
    }
    
    /**
     * Get user role
     * @returns {string|null} - User role or null
     */
    getUserRole() {
        return this.user ? this.user.role : null;
    }
    
    /**
     * Check if user has specific role
     * @param {string} role - Role to check
     * @returns {boolean} - Whether user has the role
     */
    hasRole(role) {
        return this.user && this.user.role === role;
    }
    
    /**
     * Get HTTP headers with authentication token
     * @returns {Object} - Headers object with Authorization
     */
    getAuthHeaders() {
        return {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json'
        };
    }
    
    /**
     * Display login error message
     * @param {string} message - Error message to display
     */
    showLoginError(message) {
        const errorElement = document.getElementById('loginError');
        if (errorElement) {
            errorElement.textContent = message;
            errorElement.style.display = 'block';
        }
    }
    
    /**
     * Validate current token with server
     * @returns {Promise<boolean>} - Token validity
     */
    async validateToken() {
        if (!this.token) return false;
        
        try {
            const response = await fetch(`${this.baseURL}/auth/me`, {
                headers: this.getAuthHeaders()
            });
            
            if (response.ok) {
                const userData = await response.json();
                this.user = userData;
                localStorage.setItem('authUser', JSON.stringify(this.user));
                return true;
            } else {
                this.logout();
                return false;
            }
        } catch (error) {
            console.error('Token validation error:', error);
            return false;
        }
    }

    hideNavItemsForRole() {
        const user = this.getUser();
        if (!user) return;

        const userRole = user.role;
        if (userRole === 'pilot' || userRole === 'observer') {
            const dashboardLink = document.getElementById('nav-dashboard');
            const configLink = document.getElementById('nav-config');

            if (dashboardLink) dashboardLink.style.display = 'none';
            if (configLink) configLink.style.display = 'none';
        }
    }
}

// Initialize authentication manager
const authManager = new AuthManager();

// Global utility functions for backward compatibility
function getToken() {
    return authManager.getToken();
}

function getCurrentUser() {
    return authManager.getUser();
}

function logout() {
    authManager.logout();
}

function isAuthenticated() {
    return authManager.isAuthenticated();
}

// Check authentication on restricted pages
document.addEventListener('DOMContentLoaded', () => {
    // Don't check on login page
    if (window.location.pathname.includes('index.html')) return;
    
    // Redirect to login if not authenticated on other pages
    if (!authManager.isAuthenticated()) {
        window.location.href = 'index.html';
    }

    // Hide nav items based on role
    authManager.hideNavItemsForRole();
});
