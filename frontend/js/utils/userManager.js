/**
 * UserManager - Gestionnaire centralisé des utilisateurs pour l'application GMAO
 * Fournit des méthodes cohérentes pour charger et afficher les utilisateurs
 */
class UserManager {
    constructor() {
        this.apiService = new ApiService();
        this.users = [];
        this.loaded = false;
    }

    /**
     * Charge la liste des utilisateurs depuis l'API
     * @param {string|null} [role=null] - Rôle des utilisateurs à charger (null pour tous les rôles)
     * @param {boolean} [forceReload=false] - Forcer le rechargement même si déjà chargé
     * @returns {Promise<Array>} Liste des utilisateurs
     */
    async loadUsers(role = null, forceReload = false) {
        try {
            if (!this.loaded || forceReload) {
                console.log(`[UserManager] Chargement des utilisateurs avec le rôle: ${role}`);
                this.users = await this.apiService.getUsers(role);
                
                // Trier les utilisateurs dans un ordre déterministe (par ID)
                this.users.sort((a, b) => a.id - b.id);
                
                this.loaded = true;
                console.log('[UserManager] Utilisateurs chargés et triés par ID:', this.users);
            }
            return this.users;
        } catch (error) {
            console.error('[UserManager] Erreur lors du chargement des utilisateurs:', error);
            throw error;
        }
    }

    /**
     * Remplit un sélecteur d'utilisateurs avec des options cohérentes
     * @param {HTMLSelectElement} selectElement - Élément select à remplir
     * @param {boolean} addEmptyOption - Ajouter une option vide au début
     * @param {string} emptyLabel - Texte pour l'option vide (par défaut: "Non assigné")
     * @param {string} role - Rôle des utilisateurs à charger (par défaut: 'pilot')
     * @param {boolean} forceReload - Forcer le rechargement des utilisateurs
     */
    async populateUserSelect(selectElement, addEmptyOption = true, emptyLabel = "Non assigné", role = null, forceReload = true) {
        if (!selectElement) {
            console.error('[UserManager] Élément select non trouvé');
            return;
        }

        try {
            // Vider le sélecteur
            selectElement.innerHTML = '';
            
            // Ajouter un indicateur de chargement
            const loadingOption = document.createElement('option');
            loadingOption.textContent = 'Chargement des utilisateurs...';
            loadingOption.disabled = true;
            selectElement.appendChild(loadingOption);
            
            // Charger les utilisateurs avec le rôle spécifié et forcer le rechargement si demandé
            const users = await this.loadUsers(role, forceReload);
            
            // Vider à nouveau le sélecteur pour enlever l'indicateur de chargement
            selectElement.innerHTML = '';
            
            // Important: Log des utilisateurs pour débogage
            console.log(`[UserManager] ${users.length} utilisateurs disponibles avec le rôle ${role}:`, 
                users.map(u => ({ id: u.id, username: u.username })));
            
            // Utilisateurs standard à ajouter au sélecteur
            const standardUsers = [
                // Ajouter une option vide si demandé (ne modifie pas les IDs)
                ...(addEmptyOption ? [{ id: "", username: emptyLabel }] : []),
                // Ajouter les utilisateurs actifs avec leur ID exact de la base de données
                ...users.filter(user => user.is_active)
            ];
            
            // Ajouter chaque option au sélecteur
            standardUsers.forEach(user => {
                const option = document.createElement('option');
                option.value = user.id; // Utilise l'ID exact de la base de données
                option.textContent = user.username;
                
                // Pour les options autres que l'option vide, ajouter l'ID comme information
                if (user.id) {
                    // Formaté pour être toujours visible, même avec les styles CSS personnalisés
                    option.textContent = `${user.username} [ID:${user.id}]`;
                    
                    // Utiliser l'attribut title pour afficher l'information complète au survol
                    option.title = `Utilisateur: ${user.username}, ID: ${user.id}`;
                    
                    // Ajouter une classe spéciale pour permettre le ciblage par CSS
                    option.classList.add('user-option-with-id');
                }
                
                // Ajouter des attributs data pour garantir que l'information est toujours accessible
                option.setAttribute('data-user-id', user.id);
                option.setAttribute('data-user-name', user.username);
                selectElement.appendChild(option);
            });
            
            console.log(`[UserManager] ${standardUsers.length} options ajoutées au sélecteur, dont ${addEmptyOption ? 1 : 0} option vide`);
            
            // Note: Si besoin de mettre à jour un sélecteur Bootstrap, le faire ici
            // Mais sans utiliser jQuery directement pour éviter les dépendances
        } catch (error) {
            console.error('[UserManager] Erreur lors du remplissage du sélecteur:', error);
            
            // Réinitialiser le sélecteur de façon sécurisée
            selectElement.innerHTML = '';
            
            // Ajouter une option vide qui servira de message d'erreur mais avec une valeur vide
            const errorOption = document.createElement('option');
            errorOption.value = ''; // IMPORTANT: Valeur vide pour éviter les erreurs
            errorOption.textContent = 'Erreur de chargement';
            errorOption.selected = true;
            selectElement.appendChild(errorOption);
            
            // Ajouter une option par défaut pour l'administrateur
            const adminOption = document.createElement('option');
            adminOption.value = '1'; // L'ID 1 est généralement l'administrateur
            adminOption.textContent = 'Admin';
            selectElement.appendChild(adminOption);
        }
    }

    /**
     * Récupère un utilisateur par son ID
     * @param {number} userId - ID de l'utilisateur
     * @returns {Object|null} - Utilisateur trouvé ou null
     */
    async getUserById(userId) {
        try {
            const users = await this.loadUsers();
            return users.find(user => user.id == userId) || null;
        } catch (error) {
            console.error(`[UserManager] Erreur lors de la recherche de l'utilisateur ${userId}:`, error);
            return null;
        }
    }

    /**
     * Récupère un utilisateur par son nom d'utilisateur
     * @param {string} username - Nom d'utilisateur
     * @returns {Object|null} - Utilisateur trouvé ou null
     */
    async getUserByUsername(username) {
        try {
            const users = await this.loadUsers();
            return users.find(user => user.username === username) || null;
        } catch (error) {
            console.error(`[UserManager] Erreur lors de la recherche de l'utilisateur "${username}":`, error);
            return null;
        }
    }
}

// Créer une instance unique pour toute l'application
window.userManager = window.userManager || new UserManager();
