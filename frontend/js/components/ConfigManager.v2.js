/**
 * ConfigManager Component
 * Handles the application configuration settings
 */
class ConfigManager {
    constructor() {
        this.authManager = new AuthManager();
        this.apiService = new ApiService();
        this.pilots = []; // Liste des pilotes chargés depuis l'API
        this.configuration = {
            photosFolder: 'uploads/photos',
            lieux: ['Luxe', 'Forge', 'Ancien Luxe', 'Parking'],
            pilotes: [], // Sera rempli dynamiquement depuis l'API
            schedules: {} // Sera rempli dynamiquement depuis l'API
        };
        
        // Lier toutes les méthodes importantes au contexte this
        this.resetApplicationData = this.resetApplicationData.bind(this);
        this.addPilote = this.addPilote.bind(this);
        this.resetUserPassword = this.resetUserPassword.bind(this);
        this.deletePilote = this.deletePilote.bind(this);
    }
    
    /**
     * Charge les pilotes depuis l'API
     */
    async loadPilots() {
        try {
            console.log("[ConfigManager] Chargement des pilotes depuis l'API...");
            this.pilots = await this.apiService.getPilots();
            
            // Mettre à jour la configuration avec les pilotes dynamiques
            this.configuration.pilotes = this.pilots.filter(p => p.is_active).map(p => `${p.username} [ID:${p.id}]`);
            
            // Initialiser les horaires standard par défaut pour chaque pilote
            const defaultSchedule = { days: 5, hours: 8 };
            const schedules = {};
            
            this.pilots.forEach(pilot => {
                if (pilot.is_active) {
                    const pilotKey = `${pilot.username} [ID:${pilot.id}]`;
                    // Vérifier si un horaire existait déjà pour ce pilote
                    schedules[pilotKey] = this.configuration.schedules[pilotKey] || defaultSchedule;
                }
            });
            
            this.configuration.schedules = schedules;
            console.log(`[ConfigManager] ${this.pilots.length} pilotes chargés, configuration mise à jour:`, this.configuration.pilotes);
            
            // Version 2: suppression complète de la référence à renderPilotes
            // Mise à jour directe de l'interface si possible
            if (typeof this.updatePilotesList === 'function' && document.getElementById('usersList')) {
                this.updatePilotesList();
            }
        } catch (error) {
            console.error('[ConfigManager] Erreur lors du chargement des pilotes:', error);
        }
    }
    
    async init() {
        // Check authentication
        if (!this.authManager.isAuthenticated()) {
            window.location.href = 'index.html';
            return;
        }
        
        // Set current user display
        const user = this.authManager.getUser();
        if (user) {
            document.getElementById('currentUser').textContent = user.username;
        }
        
        // Charger d'abord les pilotes pour s'assurer qu'ils sont disponibles
        await this.loadPilots();
        
        // Ensuite charger le reste de la configuration
        await this.loadConfiguration();
        this.setupEventListeners();
        
        // S'assurer que la liste des utilisateurs est mise à jour après l'initialisation complète
        if (document.getElementById('usersList')) {
            console.log('[ConfigManager] Mise à jour de la liste des utilisateurs après initialisation complète');
            this.updatePilotesList();
        }
    }
    
    setupEventListeners() {
        // Add event listener for the new pilote input
        const newPiloteInput = document.getElementById('newPilote');
        if (newPiloteInput) {
            newPiloteInput.addEventListener('keyup', (e) => {
                if (e.key === 'Enter') {
                    this.addPilote();
                }
            });
        }
        
        // Ajouter l'écouteur d'événement pour le bouton d'ajout d'utilisateur
        const addUserButton = document.getElementById('addUserButton');
        if (addUserButton) {
            console.log('[ConfigManager] Initialisation du bouton d\'ajout d\'utilisateur');
            addUserButton.addEventListener('click', () => {
                console.log('[ConfigManager] Clic sur le bouton d\'ajout d\'utilisateur');
                this.addPilote();
            });
        }
    }
    
    async loadConfiguration() {
        try {
            this.showLoading();
            // Try to get configuration from API
            const config = await this.apiService.getConfiguration();
            if (config) {
                this.configuration = config;
            }
            this.updateDisplay();
            this.hideLoading();
        } catch (error) {
            console.error('Error loading configuration:', error);
            showToast('Utilisation de la configuration par défaut', 'warning');
            this.updateDisplay();
            this.hideLoading();
        }
    }
    
    updateDisplay() {
        // Update photos folder
        document.getElementById('photosFolder').value = this.configuration.photosFolder || 'uploads/photos';
        
        // Update locations list
        this.updateLieuxTable();
        
        // Update pilots list
        this.updatePilotesList();
        
        // Update schedules
        this.updateScheduleTable();
    }
    
    updateLieuxTable() {
        const tbody = document.getElementById('lieuxTableBody');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        
        this.configuration.lieux.forEach((lieu, index) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="excel-row-number">${18 + index}</td>
                <td class="editable-lieu" contenteditable="true" 
                    onblur="configManager.updateLieu(${index}, this.textContent)">${lieu}</td>
                <td>
                    <button class="btn btn-sm btn-outline-danger" onclick="configManager.deleteLieu(${index})">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });
        
        // Add row for new location
        const newRow = document.createElement('tr');
        newRow.innerHTML = `
            <td class="excel-row-number">${18 + this.configuration.lieux.length}</td>
            <td class="editable-lieu new-lieu" contenteditable="true" 
                placeholder="Nouveau lieu..." 
                onblur="configManager.addLieuFromCell(this)"></td>
            <td>
                <button class="btn btn-sm btn-success" onclick="configManager.addLieuFromCell(document.querySelector('.new-lieu'))">
                    <i class="bi bi-plus"></i>
                </button>
            </td>
        `;
        tbody.appendChild(newRow);
    }
    
    /**
     * Met à jour l'affichage de la liste des utilisateurs, groupés par rôle
     */
    async updatePilotesList() {
        const container = document.getElementById('usersList');
        if (!container) return;
        
        try {
            container.innerHTML = '<div class="text-center"><div class="spinner-border spinner-border-sm" role="status"></div> Chargement des utilisateurs...</div>';
            
            // Récupérer la liste complète des utilisateurs (tous rôles confondus)
            const users = await this.apiService.getUsers();
            
            // Créer un dictionnaire username -> user pour un accès facile
            const userDict = {};
            users.forEach(user => {
                userDict[user.username] = user;
            });
            
            // Mettre à jour la liste des pilotes dans la configuration
            // pour garantir qu'elle correspond aux utilisateurs réels
            this.configuration.pilotes = users.map(u => u.username);
            
            // Afficher la liste
            container.innerHTML = '';
            
            if (users.length === 0) {
                container.innerHTML = '<div class="alert alert-info">Aucun utilisateur n\'est disponible. Créez votre premier utilisateur ci-dessous.</div>';
                return;
            }
            
            // Grouper les utilisateurs par rôle
            const usersByRole = {
                'admin': [],
                'manager': [],
                'pilot': [],
                'observer': []
            };
            
            users.forEach(user => {
                const role = user.role || 'observer';
                if (!usersByRole[role]) {
                    usersByRole[role] = [];
                }
                usersByRole[role].push(user);
            });
            
            // Créer un accordéon pour chaque groupe de rôle
            const accordion = document.createElement('div');
            accordion.className = 'accordion';
            accordion.id = 'usersAccordion';
            
            // Ordre d'affichage des rôles
            const roleOrder = ['admin', 'manager', 'pilot', 'observer'];
            
            roleOrder.forEach((role, index) => {
                if (!usersByRole[role] || usersByRole[role].length === 0) return;
                
                const roleLabel = this.getRoleLabel(role);
                const roleId = `role-${role}`;
                
                const accordionItem = document.createElement('div');
                accordionItem.className = 'accordion-item';
                
                const isFirst = index === 0;
                
                accordionItem.innerHTML = `
                    <h2 class="accordion-header">
                        <button class="accordion-button ${!isFirst ? 'collapsed' : ''}" type="button" 
                                data-bs-toggle="collapse" data-bs-target="#${roleId}"
                                aria-expanded="${isFirst ? 'true' : 'false'}" aria-controls="${roleId}">
                            ${roleLabel} <span class="badge bg-secondary ms-2">${usersByRole[role].length}</span>
                        </button>
                    </h2>
                    <div id="${roleId}" class="accordion-collapse collapse ${isFirst ? 'show' : ''}"
                         data-bs-parent="#usersAccordion">
                        <div class="accordion-body p-2">
                            <div class="list-group list-group-flush">
                                ${usersByRole[role].map(user => `
                                    <div class="list-group-item user-item">
                                        <div class="d-flex justify-content-between align-items-center">
                                            <div>
                                                <h6 class="mb-0">${user.username}</h6>
                                                <small class="text-muted">Email: ${user.email || 'Non renseigné'}</small>
                                            </div>
                                            <div class="btn-group btn-group-sm">
                                                <button class="btn btn-sm btn-outline-warning" 
                                                        onclick="configManager.showResetPasswordModal('${user.username}', ${user.id})">
                                                    <i class="bi bi-key"></i> Réinitialiser MDP
                                                </button>
                                                <button class="btn btn-sm btn-outline-danger" 
                                                        onclick="configManager.deletePilote('${user.username}', ${user.id})">
                                                    <i class="bi bi-trash"></i> Supprimer
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                `;
                
                accordion.appendChild(accordionItem);
            });
            
            container.appendChild(accordion);
            
            console.log('[ConfigManager] Liste des utilisateurs mise à jour, groupée par rôle:', usersByRole);
        } catch (error) {
            console.error('Erreur lors de la récupération des utilisateurs:', error);
            container.innerHTML = '<div class="alert alert-danger">Erreur lors du chargement des utilisateurs.</div>';
        }
    }
    
    async updateScheduleTable() {
        const tbody = document.getElementById('scheduleTableBody');
        if (!tbody) return;
        
        try {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center"><div class="spinner-border spinner-border-sm" role="status"></div> Chargement des horaires...</td></tr>';
            
            // Récupérer la liste des pilotes via la nouvelle API accessible à tous
            const users = await this.apiService.getPilots();
            
            // S'assurer que les horaires sont définis pour chaque utilisateur
            users.forEach(user => {
                if (!this.configuration.schedules[user.username]) {
                    this.configuration.schedules[user.username] = { days: 5, hours: 8 };
                }
            });
            
            // Afficher le tableau des horaires
            tbody.innerHTML = '';
            
            Object.entries(this.configuration.schedules).forEach(([pilote, schedule], index) => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td class="excel-row-number">${18 + index}</td>
                    <td>${pilote}</td>
                    <td>
                        <input type="number" min="0" max="7" value="${schedule.days}" 
                            onchange="configManager.updateSchedule('${pilote}', 'days', parseInt(this.value))" 
                            class="form-control form-control-sm">
                    </td>
                    <td>
                        <input type="number" min="0" max="24" value="${schedule.hours}" 
                            onchange="configManager.updateSchedule('${pilote}', 'hours', parseInt(this.value))" 
                            class="form-control form-control-sm">
                    </td>
                `;
                tbody.appendChild(row);
            });
            
        } catch (error) {
            console.error('Erreur lors de la mise à jour du tableau des horaires:', error);
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-danger">Erreur lors du chargement des horaires</td></tr>';
        }
    }
    
    showLoading() {
        const loadingElement = document.getElementById('configLoading');
        if (loadingElement) {
            loadingElement.style.display = 'flex';
        }
    }
    
    hideLoading() {
        const loadingElement = document.getElementById('configLoading');
        if (loadingElement) {
            loadingElement.style.display = 'none';
        }
    }
    
    addLieu() {
        const newLieuInput = document.getElementById('newLieu');
        if (!newLieuInput || !newLieuInput.value.trim()) return;
        
        const newLieu = newLieuInput.value.trim();
        
        // Vérifier si ce lieu existe déjà
        if (this.configuration.lieux.includes(newLieu)) {
            showToast(`Le lieu "${newLieu}" existe déjà.`, 'warning');
            return;
        }
        
        // Ajouter le nouveau lieu
        this.configuration.lieux.push(newLieu);
        
        // Mettre à jour l'affichage
        this.updateLieuxTable();
        
        // Vider le champ de saisie
        newLieuInput.value = '';
        
        // Sauvegarder la configuration
        this.saveConfiguration();
        
        showToast(`Lieu "${newLieu}" ajouté avec succès.`, 'success');
    }
    
    addLieuFromCell(cell) {
        if (!cell) return;
        
        const newLieu = cell.textContent.trim();
        if (!newLieu) return;
        
        // Vérifier si ce lieu existe déjà
        if (this.configuration.lieux.includes(newLieu)) {
            showToast(`Le lieu "${newLieu}" existe déjà.`, 'warning');
            cell.textContent = '';
            return;
        }
        
        // Ajouter le nouveau lieu
        this.configuration.lieux.push(newLieu);
        
        // Mettre à jour l'affichage
        this.updateLieuxTable();
        
        // Sauvegarder la configuration
        this.saveConfiguration();
        
        showToast(`Lieu "${newLieu}" ajouté avec succès.`, 'success');
    }
    
    updateLieu(index, newValue) {
        if (index < 0 || index >= this.configuration.lieux.length || !newValue.trim()) return;
        
        const oldValue = this.configuration.lieux[index];
        const newLieu = newValue.trim();
        
        // Vérifier si ce lieu existe déjà ailleurs dans la liste
        if (this.configuration.lieux.indexOf(newLieu) !== -1 && this.configuration.lieux.indexOf(newLieu) !== index) {
            showToast(`Le lieu "${newLieu}" existe déjà.`, 'warning');
            this.updateLieuxTable(); // Restaurer l'ancien affichage
            return;
        }
        
        // Mettre à jour le lieu
        this.configuration.lieux[index] = newLieu;
        
        // Sauvegarder la configuration
        this.saveConfiguration();
        
        showToast(`Lieu modifié: "${oldValue}" → "${newLieu}".`, 'success');
    }
    
    deleteLieu(index) {
        if (index < 0 || index >= this.configuration.lieux.length) return;
        
        const lieu = this.configuration.lieux[index];
        
        // Confirmer la suppression
        if (!confirm(`Êtes-vous sûr de vouloir supprimer le lieu "${lieu}" ?`)) {
            return;
        }
        
        // Supprimer le lieu
        this.configuration.lieux.splice(index, 1);
        
        // Mettre à jour l'affichage
        this.updateLieuxTable();
        
        // Sauvegarder la configuration
        this.saveConfiguration();
        
        showToast(`Lieu "${lieu}" supprimé avec succès.`, 'success');
    }
    
    async addPilote() {
        console.log('[ConfigManager] Tentative d\'ajout d\'un utilisateur');
        
        // Récupérer les valeurs du formulaire
        const username = document.getElementById('newUsername')?.value;
        const password = document.getElementById('newPassword')?.value;
        const roleSelect = document.getElementById('newUserRole');
        const role = roleSelect ? roleSelect.value : 'pilot'; // Par défaut, c'est un pilote
        
        // Validation basique
        if (!username || !password) {
            console.error('[ConfigManager] Nom d\'utilisateur ou mot de passe manquant');
            showToast('Veuillez remplir tous les champs obligatoires', 'error');
            return;
        }
        
        try {
            this.showLoading();
            
            // Appeler l'API pour créer l'utilisateur
            console.log(`[ConfigManager] Création de l'utilisateur ${username} avec le rôle ${role}`);
            const response = await this.apiService.request('/users', {
                method: 'POST',
                body: JSON.stringify({
                    username,
                    password,
                    role
                })
            });
            
            // Vérifier la réponse
            if (response && response.id) {
                console.log('[ConfigManager] Utilisateur créé avec succès:', response);
                showToast(`L'utilisateur ${username} a été créé avec succès`, 'success');
                
                // Recharger la liste des pilotes
                await this.loadPilots();
                
                // Réinitialiser le formulaire
                document.getElementById('newUsername').value = '';
                document.getElementById('newPassword').value = '';
                if (roleSelect) roleSelect.value = 'pilot'; // Réinitialiser le rôle à pilot
            } else {
                console.error('[ConfigManager] Erreur lors de la création de l\'utilisateur:', response);
                showToast(`Erreur lors de la création de l'utilisateur: ${response?.detail || 'Erreur inconnue'}`, 'error');
            }
        } catch (error) {
            console.error('[ConfigManager] Exception lors de la création de l\'utilisateur:', error);
            showToast(`Exception: ${error.message || 'Erreur inconnue'}`, 'error');
        } finally {
            this.hideLoading();
        }
    }
    
    updateSchedule(pilote, field, value) {
        if (!this.configuration.schedules[pilote]) return;
        
        // Mettre à jour l'horaire
        this.configuration.schedules[pilote][field] = value;
        
        // Sauvegarder la configuration
        this.saveConfiguration();
        
        showToast(`Horaire pour ${pilote} mis à jour: ${field} = ${value}.`, 'success');
    }
    
    async saveConfiguration() {
        try {
            this.showLoading();
            
            // Enregistrer la configuration via l'API
            await this.apiService.saveConfiguration(this.configuration);
            
            this.hideLoading();
            
            console.log('[ConfigManager] Configuration sauvegardée avec succès.');
        } catch (error) {
            console.error('Error saving configuration:', error);
            showToast('Erreur lors de la sauvegarde de la configuration.', 'error');
            this.hideLoading();
        }
    }
    
    // Réinitialisation des données de l'application
    async resetApplicationData() {
        try {
            console.log('[ConfigManager] Réinitialisation des données de l\'application...');
            await this.apiService.resetApplicationData();
            showToast('Données de l\'application réinitialisées avec succès.', 'success');
        } catch (error) {
            console.error('Erreur lors de la réinitialisation des données:', error);
            showToast('Erreur lors de la réinitialisation des données.', 'error');
        }
    }
    
    /**
     * Supprime un pilote (utilisateur) du système
     * @param {string} username - Nom d'utilisateur du pilote
     * @param {number} userId - ID de l'utilisateur à supprimer
     */
    async deletePilote(username, userId) {
        try {
            // Confirmation avant suppression
            if (!confirm(`Êtes-vous sûr de vouloir supprimer le pilote "${username}" (ID: ${userId}) ?`)) {
                return;
            }
            
            console.log(`[ConfigManager] Suppression du pilote ${username} (ID: ${userId})`);
            
            // Appel de l'API pour supprimer l'utilisateur
            await this.apiService.deleteUser(userId);
            
            // Afficher un message de succès
            showToast(`Pilote "${username}" supprimé avec succès.`, 'success');
            
            // Rafraîchir la liste des pilotes
            await this.loadPilots();
            this.updatePilotesList();
        } catch (error) {
            console.error(`[ConfigManager] Erreur lors de la suppression du pilote ${username}:`, error);
            showToast(`Erreur lors de la suppression du pilote "${username}": ${error.message}`, 'error');
        }
    }
    
    /**
     * Affiche le modal de réinitialisation de mot de passe pour un utilisateur
     * @param {string} username - Nom d'utilisateur
     * @param {number} userId - ID de l'utilisateur
     */
    showResetPasswordModal(username, userId) {
        // Réinitialiser le formulaire
        document.getElementById('resetPasswordForm').reset();
        
        // Définir les valeurs des champs cachés
        document.getElementById('resetPasswordUserId').value = userId;
        document.getElementById('resetPasswordUserName').textContent = username;
        
        // Afficher le modal
        const modal = new bootstrap.Modal(document.getElementById('resetPasswordModal'));
        modal.show();
    }
    
    /**
     * Réinitialise le mot de passe d'un utilisateur (admin uniquement)
     */
    async resetUserPassword() {
        try {
            const userId = document.getElementById('resetPasswordUserId').value;
            const newPassword = document.getElementById('newPassword').value;
            const confirmPassword = document.getElementById('confirmNewPassword').value;
            const username = document.getElementById('resetPasswordUserName').textContent;
            
            // Vérifications
            if (!newPassword || !confirmPassword) {
                showToast('Veuillez remplir tous les champs', 'warning');
                return;
            }
            
            if (newPassword !== confirmPassword) {
                showToast('Les mots de passe ne correspondent pas', 'warning');
                return;
            }
            
            if (newPassword.length < 6) {
                showToast('Le mot de passe doit contenir au moins 6 caractères', 'warning');
                return;
            }
            
            this.showLoading();
            
            // Appel de l'API pour réinitialiser le mot de passe
            await this.apiService.resetUserPassword(parseInt(userId), newPassword);
            
            this.hideLoading();
            
            // Fermer le modal
            const modalElement = document.getElementById('resetPasswordModal');
            const modal = bootstrap.Modal.getInstance(modalElement);
            modal.hide();
            
            // Afficher un message de succès
            showToast(`Mot de passe réinitialisé avec succès pour "${username}"`, 'success');
            
        } catch (error) {
            this.hideLoading();
            console.error('[ConfigManager] Erreur lors de la réinitialisation du mot de passe:', error);
            showToast(`Erreur lors de la réinitialisation du mot de passe: ${error.message}`, 'error');
        }
    }
    
    /**
     * Ajoute un nouvel utilisateur avec le rôle sélectionné
     * Cette fonction est appelée depuis le bouton d'ajout d'utilisateur dans l'interface admin
     */
    async addPilote() {
        try {
            const username = document.getElementById('newPiloteName').value.trim();
            const email = document.getElementById('newPiloteEmail').value.trim();
            const password = document.getElementById('newPilotePassword').value;
            const confirmPassword = document.getElementById('newPilotePasswordConfirm').value;
            const role = document.getElementById('newUserRole').value;
            
            // Vérifications des champs obligatoires
            if (!username || !email || !password || !confirmPassword) {
                showToast('Veuillez remplir tous les champs obligatoires', 'warning');
                return;
            }
            
            // Vérification de la correspondance des mots de passe
            if (password !== confirmPassword) {
                showToast('Les mots de passe ne correspondent pas', 'warning');
                return;
            }
            
            // Vérification de la longueur du mot de passe
            if (password.length < 6) {
                showToast('Le mot de passe doit contenir au moins 6 caractères', 'warning');
                return;
            }
            
            // Vérification du format de l'email
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                showToast('Veuillez entrer une adresse email valide', 'warning');
                return;
            }
            
            this.showLoading();
            
            const userData = {
                username,
                email,
                password,
                role
            };
            
            console.log(`[ConfigManager] Création d'un nouvel utilisateur avec le rôle: ${role}`);
            
            // Appel de l'API pour créer l'utilisateur
            const newUser = await this.apiService.createUser(userData);
            
            // Réinitialiser le formulaire
            document.getElementById('addPiloteForm').reset();
            
            this.hideLoading();
            
            // Afficher un message de succès
            const roleLabel = this.getRoleLabel(role);
            showToast(`Nouvel utilisateur "${username}" (${roleLabel}) créé avec succès`, 'success');
            
            // Rafraîchir la liste des utilisateurs
            await this.loadPilots();
            this.updatePilotesList();
            
        } catch (error) {
            this.hideLoading();
            console.error('[ConfigManager] Erreur lors de la création de l\'utilisateur:', error);
            showToast(`Erreur lors de la création de l'utilisateur: ${error.message}`, 'error');
        }
    }
    
    /**
     * Retourne le libellé français d'un rôle
     * @param {string} role - Code du rôle (admin, manager, pilot, observer)
     * @returns {string} - Libellé du rôle
     */
    getRoleLabel(role) {
        const roles = {
            'admin': 'Administrateur',
            'manager': 'Manager',
            'pilot': 'Pilote',
            'observer': 'Observateur'
        };
        
        return roles[role] || role;
    }
    
    /**
     * Supprime un utilisateur par son ID
     * @param {string} username - Nom de l'utilisateur à supprimer
     * @param {number} userId - ID de l'utilisateur à supprimer
     */
    async deletePilote(username, userId) {
        if (!confirm(`Êtes-vous sûr de vouloir supprimer l'utilisateur "${username}" ? Cette action est irréversible.`)) {
            return;
        }
        
        try {
            this.showLoading();
            
            // Appel de l'API pour supprimer l'utilisateur
            await this.apiService.deleteUser(userId);
            
            this.hideLoading();
            
            // Afficher un message de succès
            showToast(`Utilisateur "${username}" supprimé avec succès`, 'success');
            
            // Rafraîchir la liste des utilisateurs
            await this.loadPilots();
            this.updatePilotesList();
            
        } catch (error) {
            this.hideLoading();
            console.error('[ConfigManager] Erreur lors de la suppression de l\'utilisateur:', error);
            showToast(`Erreur lors de la suppression de l'utilisateur: ${error.message}`, 'error');
        }
    }
}
