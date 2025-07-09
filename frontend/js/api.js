/**
 * API Service for GMAO application
 * Centralized service for handling all API requests
 */
class ApiService {
    constructor() {
        this.baseURL = 'http://frsasrvgmao:8000';
        this.authManager = authManager || new AuthManager();
    }
    
    /**
     * Make an API request with proper authentication
     * @param {string} endpoint - API endpoint
     * @param {Object} options - Fetch options
     * @returns {Promise<Object>} - Response data
     */
    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        
        const headers = { ...(options.headers || {}) };

        // The browser will automatically set the correct 'Content-Type' for FormData.
        // For all other requests, we assume JSON.
        if (!(options.body instanceof FormData)) {
            headers['Content-Type'] = 'application/json';
        }
        
        // Add auth headers if authenticated
        if (this.authManager.isAuthenticated()) {
            Object.assign(headers, this.authManager.getAuthHeaders());
        }
        
        const config = {
            ...options,
            headers,
        };
        
        try {
            const response = await fetch(url, config);
            
            // Handle authentication errors
            if (response.status === 401) {
                this.authManager.logout();
                return null;
            }
            
            if (!response.ok) {
                // Tenter de récupérer les détails de l'erreur du serveur
                const errorData = await response.json().catch(() => ({}));
                
                // Pour les erreurs 422, afficher plus de détails de validation
                if (response.status === 422 && errorData.detail) {
                    console.error('Validation errors:', JSON.stringify(errorData, null, 2));
                    // Si c'est un tableau de validations, le formater de façon lisible
                    if (Array.isArray(errorData.detail)) {
                        const errorMessages = errorData.detail.map(err => 
                            `Champ '${err.loc.join('.')}': ${err.msg} (valeur reçue: ${JSON.stringify(err.input)})`
                        ).join('\n');
                        throw new Error(`Erreurs de validation:\n${errorMessages}`);
                    }
                }
                
                throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
            }
            
            // Return JSON response or empty object if no content
            return response.status !== 204 ? await response.json() : {};
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    }
    
    // Action Management
    
    /**
     * Get all actions with optional filters
     * @param {Object} filters - Query parameters
     * @returns {Promise<Array>} - List of actions
     */
    async getActions(filters = {}) {
        // Filtrer les valeurs null ou undefined avant de les convertir en paramètres d'URL
        const cleanedFilters = {};
        
        for (const [key, value] of Object.entries(filters)) {
            if (value !== null && value !== undefined) {
                cleanedFilters[key] = value;
            }
        }
        
        const params = new URLSearchParams(cleanedFilters);
        console.log('[ApiService] Récupération des actions avec filtres:', cleanedFilters);
        return this.request(`/actions?${params}`);
    }
    
    /**
     * Get all actions ordered by ID for diagnostics
     * @returns {Promise<Array>} - List of actions
     */
    async getDiagnosticActions() {
        return this.request('/actions/diagnostic');
    }
    
    /**
     * Get a single action by ID
     * @param {number} actionId - Action ID
     * @returns {Promise<Object>} - Action details
     */
    async getAction(actionId) {
        return this.request(`/actions/${actionId}`);
    }
    
    /**
     * Create a new action
     * @param {Object} data - Action data
     * @returns {Promise<Object>} - Created action
     */
    async createAction(data) {
        return this.request('/actions', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }
    
    /**
     * Update an existing action
     * @param {number} actionId - Action ID
     * @param {Object} data - Updated action data
     * @returns {Promise<Object>} - Updated action
     */
    async updateAction(actionId, data) {
        return this.request(`/actions/${actionId}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }
    
    /**
     * Delete an action
     * @param {number} actionId - Action ID
     * @returns {Promise<Object>} - Deletion response
     */
    async deleteAction(actionId) {
        return this.request(`/actions/${actionId}`, {
            method: 'DELETE'
        });
    }
    
    /**
     * Update a specific field in an action
     * @param {number} actionId - Action ID
     * @param {string} field - Field name
     * @param {any} value - New field value
     * @returns {Promise<Object>} - Updated action
     */
    async updateActionField(actionId, field, value) {
        return this.request(`/actions/${actionId}/field`, {
            method: 'PATCH',
            body: JSON.stringify({ field, value })
        });
    }
    
    /**
     * Update action status
     * @param {number} actionId - Action ID
     * @param {string} status - New status
     * @returns {Promise<Object>} - Updated action
     */
    async updateActionStatus(actionId, status) {
        return this.request(`/actions/${actionId}/status`, {
            method: 'PUT',
            body: JSON.stringify({ status })
        });
    }
    
    /**
     * Calculate predicted end date for an action
     * @param {number} actionId - Action ID
     * @returns {Promise<Object>} - Predicted end date info
     */
    async calculateEndDate(actionId) {
        return this.request(`/actions/${actionId}/calculate-end-date`, {
            method: 'POST'
        });
    }
    
    async reorderActions(orderedIds) {
        return this.request('/actions/reorder', {
            method: 'POST',
            body: JSON.stringify(orderedIds)
        });
    }
    
    // Dashboard Management

    /**
     * Get dashboard statistics
     * @param {number|null} pilotId - Optional pilot ID to filter stats
     * @returns {Promise<Object>} - Dashboard stats
     */
    async getDashboardStats(pilotId = null) {
        let endpoint = '/dashboard/stats';
        if (pilotId) {
            endpoint += `?assigned_to=${pilotId}`;
        }
        return this.request(endpoint);
    }

    /**
     * Get dashboard alerts/critical actions
     * @returns {Promise<Array>} - List of critical actions
     */
    async getDashboardAlerts() {
        return this.request('/dashboard/alerts');
    }
    
    // Photo Management
    
    /**
     * Upload photos for an action
     * @param {number} actionId - Action ID
     * @param {FileList} files - Photo files to upload
     * @returns {Promise<Object>} - Upload response
     */
    async uploadPhotos(actionId, files) {
        const formData = new FormData();
        
        for (let i = 0; i < files.length; i++) {
            formData.append('files', files[i]);
        }
        
        return fetch(`${this.baseURL}/actions/${actionId}/photos`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.authManager.token}`
            },
            body: formData
        }).then(response => {
            if (!response.ok) throw new Error('Upload failed');
            return response.json();
        });
    }
    
    /**
     * Get photos for an action
     * @param {number} actionId - Action ID
     * @returns {Promise<Array>} - List of photos
     */
    async getActionPhotos(actionId) {
        return this.request(`/actions/${actionId}/photos`);
    }
    
    /**
     * Delete a photo
     * @param {number} photoId - Photo ID
     * @returns {Promise<Object>} - Deletion response
     */
    async deletePhoto(photoId) {
        return this.request(`/photos/${photoId}`, {
            method: 'DELETE'
        });
    }
    
    // Calendar Management

    /**
     * Checks if a user has a calendar exception on a specific date.
     * @param {number} userId - The ID of the user.
     * @param {string} date - The date to check in 'YYYY-MM-DD' format.
     * @returns {Promise<Object|null>} - The exception object if one exists, otherwise null.
     */
    async checkUserException(userId, date) {
        if (!userId || !date) {
            return Promise.resolve(null);
        }
        return this.request(`/calendar/users/${userId}/exceptions/check?date=${date}`);
    }
    
    // Configuration Management
    
    /**
     * Get active locations
     * @returns {Promise<Array>} - List of location objects
     */
    async getLocations() {
        return this.request('/config/locations');
    }
    
    /**
     * Create a new location
     * @param {Object} data - Location data
     * @returns {Promise<Object>} - Created location
     */
    async createLocation(data) {
        return this.request('/config/locations', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }
    
    /**
     * Get users with optional role filtering
     * @param {string} [role] - Optional role filter (admin, manager, pilot, observer)
     * @returns {Promise<Array>} - List of users
     */
    async getUsers(role) {
        const endpoint = role ? `/users?role=${role}` : '/users';
        console.log(`[ApiService] Récupération des utilisateurs avec endpoint: ${endpoint}`);
        return this.request(endpoint);
    }
    
    /**
     * Get assignable users (all active users)
     * @returns {Promise<Array>} - List of users
     */
    async getAssignableUsers() {
        console.log(`[ApiService] Récupération des utilisateurs assignables via l'endpoint /users/assignable`);
        return this.request('/users/assignable');
    }
    
    /**
     * Create a new user with specified role
     * @param {Object} userData - User data including username, email, password, and role
     * @returns {Promise<Object>} - Created user
     */
    async createUser(userData) {
        console.log(`[ApiService] Création d'un nouvel utilisateur avec le rôle: ${userData.role}`);
        return this.request('/users', {
            method: 'POST',
            body: JSON.stringify(userData)
        });
    }
    
    /**
     * Get a user's work calendar
     * @param {number} userId - User ID
     * @returns {Promise<Object>} - Work calendar data
     */
    async getUserCalendar(userId) {
        return this.request(`/users/${userId}/calendar`);
    }
    
    /**
     * Update a user's work calendar
     * @param {number} userId - User ID
     * @param {Object} calendarData - Updated calendar data
     * @returns {Promise<Object>} - Updated calendar
     */
    async updateUserCalendar(userId, calendarData) {
        return this.request(`/users/${userId}/calendar`, {
            method: 'PUT',
            body: JSON.stringify(calendarData)
        });
    }
    
    /**
     * Delete a user/pilot
     * @param {number} userId - User ID to delete
     * @returns {Promise<Object>} - Deletion response
     */
    async deleteUser(userId) {
        console.log(`[ApiService] Suppression de l'utilisateur avec ID: ${userId}`);
        return this.request(`/users/${userId}`, {
            method: 'DELETE'
        });
    }
    
    /**
     * Get full configuration
     * @returns {Promise<Object>} - Complete configuration
     */
    async getConfiguration() {
        return this.request('/config/all');
    }
    
    /**
     * Save configuration
     * @param {Object} config - Configuration data
     * @returns {Promise<Object>} - Save response
     */
    async saveConfiguration(config) {
        return this.request('/config/save', {
            method: 'POST',
            body: JSON.stringify(config)
        });
    }
    
    /**
     * Met à jour une action individuelle
     * @param {Number} id - ID de l'action à mettre à jour
     * @param {Object} data - Données à mettre à jour
     * @returns {Promise<Object>} - Réponse de l'API
     */
    async updateAction(id, data) {
        return this.request(`/actions/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }
    
    /**
     * Met à jour l'ordre des actions en modifiant chaque action individuellement
     * Cette méthode est maintenue pour compatibilité mais n'est plus utilisée.
     * La nouvelle implémentation utilise directement updateAction avec le champ number
     * @param {Array} orderData - Données d'ordre contenant id, position et numero_actions
     * @returns {Promise<Array>} - Tableau des réponses de mise à jour
     */
    async updateActionOrder(orderData) {
        // Créer un tableau de promesses pour chaque mise à jour d'action
        const updatePromises = orderData.map(item => {
            return this.updateAction(item.id, {
                number: item.position + 1 // Convertir position (0-based) en number (1-based)
            });
        });
        
        // Exécuter toutes les mises à jour en parallèle
        return Promise.all(updatePromises);
    }
    
    /**
     * Réinitialise le mot de passe d'un utilisateur (admin uniquement)
     * @param {number} userId - ID de l'utilisateur
     * @param {string} newPassword - Nouveau mot de passe
     * @returns {Promise<Object>} - Réponse de l'API
     */
    async resetUserPassword(userId, newPassword) {
        console.log(`[ApiService] Réinitialisation du mot de passe pour l'utilisateur ${userId}`);
        return this.request('/admin/reset-password', {
            method: 'POST',
            body: JSON.stringify({
                user_id: userId,
                new_password: newPassword
            })
        });
    }
}

// Initialize API service
const apiService = new ApiService();
