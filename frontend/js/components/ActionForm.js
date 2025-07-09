/**
 * ActionForm Component
 * Form for creating and editing maintenance actions
 */
class ActionForm {
    constructor() {
        this.authManager = new AuthManager();
        this.apiService = new ApiService();
        this.currentAction = null;
        this.currentActionData = null; // Pour stocker les données de l'action chargée
        this.modal = null;
        this.calendarManager = window.calendarManager || new CalendarManager();
        this.locations = []; // Liste des lieux disponibles
        this.durationWarningShown = false; // Track if the warning has been shown
    }
    
    /**
     * Show the action form modal
     * @param {number|null} actionId - Action ID to edit, or null for new action
     */
    show(actionId = null) {
        this.currentActionData = null; // Réinitialiser les données
        this.durationWarningShown = false; // Reset warning state each time the modal is shown
        // Vérification du rôle utilisateur - bloquer les pilotes pour la création d'actions
        const user = this.authManager.getUser();
        const userRole = user && user.role ? user.role : 'observer';
        
        // Stocker le rôle pour utilisation ultérieure dans la classe
        this.userRole = userRole;
        
        // Les pilotes ne peuvent pas créer de nouvelles actions
        if (userRole === 'pilot' && !actionId) {
            console.error('[ActionForm] Tentative de création d\'action par un pilote bloquée');
            showToast('Les pilotes ne sont pas autorisés à créer des actions', 'error');
            return false;
        }
        
        // Les observateurs ne peuvent pas créer ni modifier d'actions
        // L'observateur a maintenant les mêmes permissions que le pilote
        if (userRole === 'observer') {
            console.log('[ActionForm] Mode lecture seule pour observateur');
            this.readOnly = true;
        }
        
        this.currentAction = actionId;
        
        // Charger d'abord les lieux depuis la configuration
        this.loadLocations().then(() => {
            this.createModal();
            
            if (actionId) {
                this.loadAction(actionId);
            }
        });
    }
    
    /**
     * Charge la liste des lieux depuis la configuration
     */
    async loadLocations() {
        try {
            this.locations = await this.apiService.getLocations();
            console.log(`[ActionForm] ${this.locations.length} lieux chargés:`, this.locations);
        } catch (error) {
            console.error('[ActionForm] Erreur lors du chargement des lieux:', error);
            this.locations = []; // Fallback to empty list
        }
    }
    
    /**
     * Create the modal dialog
     */
    createModal() {
        // Remove existing modal if any
        const existingModal = document.getElementById('actionModal');
        if (existingModal) {
            existingModal.remove();
        }
        
        // Déterminer si l'interface sera en lecture seule ou à accès limité en fonction du rôle
        const userRole = this.userRole || 'observer';
        console.log(`[ActionForm] Création du modal pour le rôle: ${userRole}`);
        
        // S'assurer que le calendrier est correctement initialisé
        if (!this.calendarManager.currentUserId) {
            const user = this.authManager.getUser();
            if (user && user.id) {
                this.calendarManager.currentUserId = parseInt(user.id);
            }
        }
        
        const modalHTML = `
            <div class="modal fade" id="actionModal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">
                                ${this.currentAction ? 'Modifier' : 'Nouvelle'} Action
                            </h5>
                            <button type="button" class="btn-close" 
                                    data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <form id="actionForm">
                                <div class="row">
                                    <div class="col-md-6 mb-3">
                                        <label class="form-label">Titre / Action *</label>
                                        <input type="text" class="form-control" 
                                               name="title" required>
                                    </div>
                                    <div class="col-md-6 mb-3">
                                        <label class="form-label">Lieu</label>
                                        <select class="form-select" name="location_id">
                                            <option value="">Sélectionner...</option>
                                            ${this.locations.map(lieu => `<option value="${lieu.id}">${lieu.name}</option>`).join('')}
                                        </select>
                                    </div>
                                </div>
                                
                                <div class="row">
                                    <div class="col-md-6 mb-3">
                                        <label class="form-label">Priorité *</label>
                                        <select class="form-select" name="priority" required>
                                            <option value="1">1 - Haute</option>
                                            <option value="2">2 - Moyenne</option>
                                            <option value="3">3 - Basse</option>
                                            <option value="4">4 - À planifier</option>
					</select>
                                    </div>
                                    <div class="col-md-6 mb-3">
                                        <label class="form-label">Assigné à</label>
                                        <select class="form-select" name="assigned_to" id="actionAssignedTo">
                                            <option value="">Chargement des utilisateurs...</option>
                                        </select>
                                    </div>
                                </div>
                                
                                <div class="row">
                                    <div class="col-md-6 mb-3">
                                        <label class="form-label">Date planifiée</label>
                                        <input type="date" class="form-control" 
                                               name="planned_date" id="actionPlannedDate"
                                               onchange="actionForm.updateExpectedEndDate()" 
                                               oninput="actionForm.updateExpectedEndDate()">
                                        <div id="date-warning" class="text-danger mt-1" style="display: none;"></div>
                                    </div>
                                    <div class="col-md-6 mb-3">
                                        <label class="form-label">Temps de réalisation (heures)</label>
                                        <input type="number" class="form-control" 
                                               name="estimated_duration" id="actionEstimatedDuration" min="0" step="0.5"
                                               onchange="actionForm.updateExpectedEndDate()" 
                                               oninput="actionForm.updateExpectedEndDate()">
                                    </div>
                                </div>
                                <div class="row">
                                    <div class="col-md-6 mb-3">
                                        <label class="form-label">Date fin prévue</label>
                                        <input type="date" class="form-control" 
                                               name="expected_end_date" id="actionExpectedEndDate" readonly>
                                    </div>
                                </div>
                                
                                <div class="row">
                                    <div class="col-md-6 mb-3">
                                        <label class="form-label">Budget initial</label>
                                        <div class="input-group">
                                            <input type="number" class="form-control" 
                                                   name="budget_initial" min="0" step="0.01">
                                            <span class="input-group-text">€</span>
                                        </div>
                                    </div>
                                    <div class="col-md-6 mb-3">
                                        <label class="form-label">Coût total</label>
                                        <div class="input-group">
                                            <input type="number" class="form-control" 
                                                   name="actual_cost" min="0" step="0.01">
                                            <span class="input-group-text">€</span>
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="mb-3">
                                    <label class="form-label">Besoin ressource</label>
                                    <textarea class="form-control" name="resource_needs" 
                                              rows="2"></textarea>
                                </div>
                                
                                <div class="mb-3">
                                    <label class="form-label">Commentaires</label>
                                    <textarea class="form-control" name="comments" 
                                              rows="3"></textarea>
                                </div>
                                
                                <div class="row">
                                    <div class="col-md-6 mb-3">
                                        <label class="form-label">Check</label>
                                        <select class="form-select" name="check_status">
                                            <option value="NON">NON</option>
                                            <option value="OK">OK</option>
                                        </select>
                                    </div>
                                    <div class="col-md-6 mb-3">
                                        <label class="form-label">Statut final</label>
                                        <select class="form-select" name="final_status">
                                            <option value="NON">NON</option>
                                            <option value="OK">OK</option>
                                        </select>
                                    </div>
                                </div>
                                
                                <div class="mb-3">
                                    <label class="form-label">Date de réalisation</label>
                                    <input type="date" class="form-control" 
                                           name="completion_date">
                                </div>
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" 
                                    data-bs-dismiss="modal">Annuler</button>
                            <button type="button" class="btn btn-primary" 
                                    onclick="actionForm.save()">Sauvegarder</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        const modalElement = document.getElementById('actionModal');
        this.modal = new bootstrap.Modal(modalElement);
        
        // IMPORTANT: Attendre que le DOM du modal soit complètement ajouté avant de charger les utilisateurs
        setTimeout(async () => {
            // Charger la liste des utilisateurs avec les IDs explicites
            await this.populateAssignableUsers();
            
            // Configurer le calcul dynamique de la date de fin prévue
            this.setupDynamicCalculation();
            
            // Appliquer les restrictions de rôle après un court délai
            // pour s'assurer que tout le DOM est bien chargé
            this.applyRoleBasedRestrictions();
            
            const durationInput = modalElement.querySelector('input[name="estimated_duration"]');
            if (durationInput) {
                durationInput.addEventListener('input', () => {
                    if (this.durationWarningShown && durationInput.value && parseFloat(durationInput.value) > 0) {
                        durationInput.classList.remove('is-invalid');
                        this.resetSaveButton();
                        this.durationWarningShown = false;
                    }
                });
            }
            
            // Force une seconde vérification des utilisateurs après l'affichage du modal
            // pour être sûr que les pilotes sont correctement chargés
            setTimeout(async () => {
                const select = document.getElementById('actionAssignedTo');
                // Vérifier si les options sont correctes (avec les IDs)
                const hasIdsInOptions = Array.from(select.options).some(opt => opt.textContent.includes('[ID:'));
                if (!hasIdsInOptions) {
                    console.warn("[ActionForm] Les IDs ne sont pas visibles dans les options, rechargement forcé...");
                    await this.populateAssignableUsers();
                    // Recalculer la date de fin après rechargement des utilisateurs
                    this.setupDynamicCalculation();
                }
            }, 500);
        }, 0);
        
        // Gérer correctement le focus pour éviter les warnings d'accessibilité
        modalElement.addEventListener('hidden.bs.modal', () => {
            // Réinitialiser le focus quand la modale est cachée
            document.activeElement.blur();
        });
        
        // Ajouter des écouteurs pour détecter la touche Escape
        modalElement.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.modal.hide();
            }
        });
        
        this.modal.show();
        
        // Protection supplémentaire: forcer le rechargement des utilisateurs chaque fois que le modal est affiché
        modalElement.addEventListener('shown.bs.modal', async () => {
            console.log("[ActionForm] Modal affiché, vérification des utilisateurs...");
            const select = document.getElementById('actionAssignedTo');
            if (select) {
                const hasIdsInOptions = Array.from(select.options).some(opt => opt.textContent.includes('[ID:'));
                if (!hasIdsInOptions) {
                    console.warn("[ActionForm] Après affichage: IDs non visibles, rechargement...");
                    await this.populateAssignableUsers();
                }
            }
            
            // Appliquer les restrictions de rôle immédiatement après affichage du modal
            // pour s'assurer que tous les champs sont correctement traités
            console.log("[ActionForm] Application des restrictions de rôle après affichage du modal");
            this.applyRoleBasedRestrictions();
        });
        
        // S'assurer que les restrictions de rôle sont appliquées après un rechargement de page
        document.addEventListener('DOMContentLoaded', () => {
            this.enforceRoleRestrictions();
        });
        
        // Aussi après un rechargement complet (F5)
        window.addEventListener('load', () => {
            this.enforceRoleRestrictions();
        });
    }
    
    /**
     * Applique et renforce les restrictions de rôle même après rechargement
     * Cette fonction est appelée au chargement et après chaque affichage du modal
     * pour garantir que les restrictions persistent après un F5
     */
    enforceRoleRestrictions() {
        console.log('[ActionForm] Renforcement des restrictions de rôle après rechargement...');
        
        // Vérification supplémentaire du rôle utilisateur (au cas où localStorage aurait changé)
        const user = authManager.getUser();
        this.userRole = user && user.role ? user.role : 'observer';
        
        // Appliquer les restrictions UI
        const modal = document.getElementById('actionModal');
        if (!modal) return;
        
        if (this.userRole === 'pilot' || this.userRole === 'observer') {
            // Désactiver tous les champs sauf commentaires et besoins ressources
            const form = modal.querySelector('form');
            if (!form) return;
            
            const formElements = form.elements;
            for (let i = 0; i < formElements.length; i++) {
                const field = formElements[i];
                const fieldName = field.name;
                
                // Seuls les commentaires et besoins de ressources sont modifiables
                if (fieldName !== 'comments' && fieldName !== 'resource_needs') {
                    field.disabled = true;
                    field.title = 'Non modifiable pour votre rôle';
                }
            }
            
            // Désactiver le bouton de sauvegarde si aucune action n'est sélectionnée et que l'utilisateur est Pilote ou Observateur
            if (!this.currentAction) {
                const saveButton = modal.querySelector('button[type="submit"]');
                if (saveButton) {
                    saveButton.disabled = true;
                    saveButton.title = 'La création d\'action n\'est pas autorisée pour votre rôle';
                    saveButton.onclick = function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        showToast('La création d\'action n\'est pas autorisée pour votre rôle', 'warning');
                        return false;
                    };
                }
            }
            
            // Ajouter une alerte pour informer l'utilisateur
            const alertBox = modal.querySelector('.role-restriction-alert');
            if (!alertBox) {
                const alert = document.createElement('div');
                alert.className = 'alert alert-warning mt-3 role-restriction-alert';
                alert.innerHTML = `<i class="bi bi-exclamation-triangle-fill"></i> En tant que ${this.userRole === 'pilot' ? 'pilote' : 'observateur'}, vous pouvez uniquement modifier les commentaires et les besoins en ressources.`;
                
                const modalBody = modal.querySelector('.modal-body');
                if (modalBody) {
                    modalBody.insertBefore(alert, modalBody.firstChild);
                }
            }
        }
    }
    
    /**
     * Charge la liste des utilisateurs depuis l'API dédiée aux pilotes
     * et garantit l'affichage des IDs
     */
    async populateAssignableUsers() {
        const select = document.getElementById('actionAssignedTo');
        if (!select) return;

        try {
            const users = await this.apiService.getAssignableUsers();
            select.innerHTML = '<option value="">Non assigné</option>';
            users.forEach(user => {
                select.innerHTML += `<option value="${user.id}">${user.username}</option>`;
            });
            
            // Sélectionner la valeur actuelle si les données de l'action sont disponibles
            if (this.currentActionData && this.currentActionData.assigned_to) {
                select.value = this.currentActionData.assigned_to;
            }
        } catch (error) {
            console.error('Erreur lors du chargement des utilisateurs assignables:', error);
            select.innerHTML = '<option value="">Erreur de chargement</option>';
        }
    }
    
    /**
     * Load action data for editing
     * @param {number} actionId - Action ID to load
     */
    async loadAction(actionId) {
        try {
            const action = await this.apiService.getAction(actionId);
            this.currentActionData = action; // Stocker les données de l'action
            const form = document.getElementById('actionForm');
            
            // Remplissage direct du formulaire en se basant sur les attributs 'name'
            for (const key in action) {
                const input = form.elements[key];
                if (input) {
                    if (input.type === 'date' && action[key]) {
                        input.value = action[key].split('T')[0];
                    } else if (key === 'location_id' && action.location) {
                        input.value = action.location.id; // Correction: utiliser l'ID et non le nom
                    } else if (key === 'assigned_to' && action.assigned_user) {
                        input.value = action.assigned_user.id; // Gérer le cas de l'objet utilisateur
                        }
                    else {
                        input.value = action[key] !== null ? action[key] : '';
                    }
                }
            }
            
            // Assurer que les écouteurs d'événements pour le calcul dynamique sont bien activés
            this.setupDynamicEventsForExistingAction();
            
            // Appliquer les restrictions basées sur le rôle utilisateur
            this.applyRoleBasedRestrictions();
            
            // S'assurer que l'utilisateur assigné est correctement sélectionné
            // même en cas de race condition.
            this.populateAssignableUsers();
            
        } catch (error) {
            console.error('Error loading action:', error);
            showToast('Erreur lors du chargement de l\'action', 'error');
        }
    }
    
    /**
     * Méthode publique pour mettre à jour la date de fin prévue
     * Peut être appelée directement depuis les attributs HTML (onchange, oninput)
     */
    async updateExpectedEndDate() {
        const plannedDateInput = document.getElementById('actionPlannedDate');
        const durationInput = document.getElementById('actionEstimatedDuration');
        const userSelect = document.getElementById('actionAssignedTo');
        const endDateInput = document.getElementById('actionExpectedEndDate');
        
        // Vérifications de sécurité
        if (!plannedDateInput || !durationInput || !userSelect || !endDateInput) {
            console.error('ActionForm: Elements manquants pour le calcul de date');
            return;
        }
        
        // Cacher l'avertissement précédent
        const warningDiv = document.getElementById('date-warning');
        if (warningDiv) warningDiv.style.display = 'none';
        
        const plannedDate = plannedDateInput.value;
        const duration = durationInput.value;
        const userId = userSelect.value;

        // Vérifier l'exception de calendrier
        if (plannedDate && userId) {
            await this.checkExceptionAndWarn(userId, plannedDate);
        }
        
        // Vérifier que les valeurs nécessaires sont présentes
        if (!plannedDate || !duration) {
            return;
        }
        
        // S'assurer que le CalendarManager est disponible
        if (!this.calendarManager) {
            console.error('ActionForm: CalendarManager non disponible');
            
            // Tentative de récupération du CalendarManager global
            this.calendarManager = window.calendarManager;
            
            // Si toujours pas disponible, sortir
            if (!this.calendarManager) {
                return;
            }
        }
        
        // Calculer la date de fin
        const endDate = this.calendarManager.calculateEndDate(plannedDate, duration, userId);
        if (endDate) {
            endDateInput.value = endDate;
        }
    }
    
    /**
     * Configure les écouteurs d'événements pour mettre à jour dynamiquement la date de fin prévue
     * Cette méthode est conservée pour compatibilité mais n'est plus utilisée
     * car les écouteurs sont maintenant directement dans le HTML via onchange/oninput
     */
    setupDynamicCalculation() {
        // Récupérer l'utilisateur assigné pour le calcul initial
        const userSelect = document.getElementById('actionAssignedTo');
        if (userSelect) {
            userSelect.addEventListener('change', () => this.updateExpectedEndDate());
        }
        
        // Calculer la date initiale
        this.updateExpectedEndDate();
    }
    
    /**
     * Configure les écouteurs d'événements pour une action existante lors de l'édition
     * Cette méthode est appelée après le chargement des données d'une action existante
     */
    setupDynamicEventsForExistingAction() {
        // Récupérer les éléments du formulaire
        const plannedDateInput = document.getElementById('actionPlannedDate');
        const durationInput = document.getElementById('actionEstimatedDuration');
        const userSelect = document.getElementById('actionAssignedTo');
        
        // Vérifier que les éléments existent
        if (!plannedDateInput || !durationInput || !userSelect) {
            console.error('ActionForm: Éléments du formulaire non trouvés pour le calcul dynamique');
            return;
        }
        
        // Attacher manuellement les gestionnaires d'événements car ceux dans le HTML
        // ne fonctionnent pas pour les champs remplis dynamiquement
        plannedDateInput.onchange = () => this.updateExpectedEndDate();
        plannedDateInput.oninput = () => this.updateExpectedEndDate();
        durationInput.onchange = () => this.updateExpectedEndDate();
        durationInput.oninput = () => this.updateExpectedEndDate();
        userSelect.onchange = () => this.updateExpectedEndDate();
        
        console.log('ActionForm: Événements dynamiques configurés pour l\'action existante');
        
        // Déclencher le calcul initial de la date de fin prévue
        setTimeout(() => {
            // Utiliser setTimeout pour s'assurer que tous les éléments sont bien chargés
            this.updateExpectedEndDate();
            console.log('ActionForm: Calcul initial de la date de fin pour l\'action existante');
        }, 100);
    }
    
    /**
     * Applique les restrictions sur les champs du formulaire selon le rôle utilisateur
     * - Observateur : tous les champs sont en lecture seule
     * - Pilote : seuls les champs Commentaires et Besoin ressource sont modifiables
     */
    applyRoleBasedRestrictions() {
        const form = document.getElementById('actionForm');
        if (!form) {
            console.error('[ActionForm] Formulaire non trouvé pour appliquer les restrictions de rôle');
            return;
        }

        // Récupérer le rôle utilisateur
        const userRole = this.userRole || 'observer';
        console.log(`[ActionForm] Application des restrictions pour le rôle: ${userRole}`);
        
        // Supprimer d'abord tout message d'alerte existant pour éviter les doublons
        const existingAlerts = document.querySelectorAll('#actionModal .modal-body .alert');
        existingAlerts.forEach(alert => alert.remove());

        // Tous les éléments du formulaire
        const formElements = form.elements;
        
        // Pour les observateurs, tous les champs sont en lecture seule
        // L'observateur a maintenant les mêmes permissions que le pilote
        if (false) {
            console.log('[ActionForm] Mode lecture seule pour observateur - tous les champs sont désactivés');
            for (let i = 0; i < formElements.length; i++) {
                const field = formElements[i];
                field.disabled = true;
                // Ajouter un style visuel pour indiquer que le champ est en lecture seule
                field.classList.add('readonly-field');
                field.style.backgroundColor = '#f8f9fa';
                field.style.cursor = 'not-allowed';
                field.setAttribute('readonly', 'readonly');
            }
            
            // Désactiver aussi les boutons du footer
            const footerButtons = document.querySelectorAll('#actionModal .modal-footer button:not([data-bs-dismiss="modal"])');
            footerButtons.forEach(button => {
                button.disabled = true;
                button.classList.add('disabled');
                button.style.pointerEvents = 'none';
            });
            
            // Ajouter un message d'information
            const modalBody = document.querySelector('#actionModal .modal-body');
            if (modalBody) {
                const infoAlert = document.createElement('div');
                infoAlert.className = 'alert alert-info';
                infoAlert.innerHTML = '<i class="bi bi-info-circle"></i> Mode lecture seule. En tant qu\'observateur, vous ne pouvez pas modifier cette action.';
                modalBody.prepend(infoAlert);
            }
        }
        
        // Pour les pilotes, seuls les champs Commentaires et Besoin ressource sont modifiables
        else if (userRole === 'pilot' || userRole === 'observer') {
            console.log('[ActionForm] Restrictions pour pilote - seuls les commentaires et besoins ressource sont modifiables');
            
            // Désactiver tous les champs sauf commentaires et besoin ressource
            for (let i = 0; i < formElements.length; i++) {
                const field = formElements[i];
                const fieldName = field.name;
                
                // Ne pas désactiver les champs commentaires et besoin ressource
                if (fieldName === 'comments' || fieldName === 'resource_needs') {
                    console.log(`[ActionForm] Champ ${fieldName} laissé actif pour le pilote`);
                    field.disabled = false;
                } else {
                    field.disabled = true;
                }
            }
            
            // Ajouter un message d'information
            const modalBody = document.querySelector('#actionModal .modal-body');
            if (modalBody) {
                const infoAlert = document.createElement('div');
                infoAlert.className = 'alert alert-info';
                infoAlert.innerHTML = '<i class="bi bi-info-circle"></i> En tant que pilote, vous pouvez uniquement modifier les champs <strong>Commentaires</strong> et <strong>Besoin ressource</strong>.';
                modalBody.prepend(infoAlert);
            }
        }
    }

    /**
     * Save the action
     */
    async save() {
        const form = document.getElementById('actionForm');
        
        if (!validateForm(form)) {
            showToast('Veuillez remplir tous les champs obligatoires', 'warning');
            return;
        }

        const priority = parseInt(form.elements['priority'].value);
        const estimatedDurationInput = form.elements['estimated_duration'];
        
        const needsWarning = priority < 4 && (!estimatedDurationInput.value || parseFloat(estimatedDurationInput.value) <= 0);

        if (needsWarning) {
            if (!this.durationWarningShown) {
                // First click: Show visual cues and set the flag.
                this.durationWarningShown = true;
                const saveButton = form.closest('.modal-content').querySelector('.modal-footer .btn-primary');
                estimatedDurationInput.classList.add('is-invalid');
                
                if (saveButton) {
                    saveButton.classList.remove('btn-primary');
                    saveButton.classList.add('btn-warning');
                    saveButton.innerHTML = `<i class="bi bi-exclamation-triangle"></i> Confirmer (temps non défini)`;
                }
                
                showToast("Aucun temps de réalisation défini. Cliquez à nouveau sur 'Confirmer' pour sauvegarder.", "warning");
                return;
            } else {
                // Second click: Show the detailed confirmation modal.
                this.showDurationConfirmationModal();
                return;
            }
        }
        
        await this._performSave();
    }

    /**
     * Shows a custom confirmation modal about the consequences of an empty duration.
     */
    showDurationConfirmationModal() {
        const existingModal = document.getElementById('durationConfirmModal');
        if (existingModal) existingModal.remove();

        const modalHTML = `
            <div class="modal fade" id="durationConfirmModal" tabindex="-1" style="z-index: 1060;">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content border-warning">
                        <div class="modal-header bg-warning text-dark">
                            <h5 class="modal-title"><i class="bi bi-exclamation-triangle-fill"></i> Confirmation Requise</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <p>Vous êtes sur le point de sauvegarder une action sans temps de réalisation estimé.</p>
                            <p class="mb-0"><strong>Conséquences :</strong></p>
                            <ul>
                                <li>La <strong>date de fin prévue</strong> ne pourra pas être calculée.</li>
                                <li>Les indicateurs de performance (KPI) liés à cette action seront <strong>incorrects</strong> jusqu'à ce que le temps soit renseigné.</li>
                            </ul>
                            <p class="mt-3">Êtes-vous sûr de vouloir continuer ?</p>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Annuler</button>
                            <button type="button" class="btn btn-warning" id="confirmSaveWithoutDurationBtn">Oui, sauvegarder quand même</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        const confirmModalEl = document.getElementById('durationConfirmModal');
        const confirmModal = new bootstrap.Modal(confirmModalEl);
        
        document.getElementById('confirmSaveWithoutDurationBtn').onclick = async () => {
            confirmModal.hide();
            await this._performSave();
        };

        confirmModal.show();
    }

    /**
     * Performs the actual data collection and API call to save the action.
     */
    async _performSave() {
        const form = document.getElementById('actionForm');
        try {
            // Définir un objet data avec toutes les propriétés explicitement nulles pour définir la structure
            let data = {
                number: null,
                title: null,
                location_id: null,
                description: null,
                comments: null,
                assigned_to: null,
                resource_needs: null,
                budget_initial: null,
                actual_cost: null,
                priority: 4, // Valeur par défaut (4 = À planifier)
                estimated_duration: null,
                planned_date: null,
                check_status: "NON",
                final_status: "NON",
                completion_date: null
            };
            
            // Collect form data et remplacer les valeurs nulles par les valeurs du formulaire
            const formData = new FormData(form);
            
            // Parcourir les données du formulaire et les appliquer à l'objet data
            for (const [key, value] of formData.entries()) {
                // Traiter les champs spéciaux
                if (key === 'title') {
                    // Le titre peut être une chaîne vide
                    data[key] = value;
                }
                else if (key === 'priority') {
                    // Priorité doit être un entier
                    data[key] = value ? parseInt(value) : 2;
                }
                else if (key === 'assigned_to') {
                    // Pilote doit être un entier ou null
                    if (value) {
                        // Convertir en nombre et garantir que c'est bien un ID valide
                        const userId = parseInt(value);
                        data[key] = userId;
                        console.log(`[ActionForm] Utilisateur assigné: ID=${userId} (valeur originale: ${value})`);
                    } else {
                        data[key] = null;
                    }
                }
                else if (key === 'location_id') {
                    // Location doit être un ID numérique ou null
                    // Note: Le backend attend un ID numérique pour location_id, pas un nom de lieu
                    // Temporairement, nous allons utiliser une fonction de mappage simple
                    const locationMap = {
                        'Luxe': 1,
                        'Forge': 2,
                        'Ancien Luxe': 3,
                        'Parking': 4
                    };
                    
                    // Si la valeur est dans notre map, utiliser l'ID correspondant
                    if (value && locationMap[value]) {
                        data[key] = locationMap[value];
                    } else {
                        data[key] = null;
                    }
                }
                else if (key === 'budget_initial' || key === 'actual_cost' || key === 'estimated_duration') {
                    // Les valeurs monétaires et durées doivent être des nombres
                    data[key] = value ? parseFloat(value) : null;
                }
                else if (key === 'planned_date' || key === 'completion_date') {
                    // Les dates doivent être au format ISO ou null
                    data[key] = value || null;
                }
                else if (key === 'check_status' || key === 'final_status') {
                    // Les statuts ont une valeur par défaut
                    data[key] = value || "NON";
                }
                else if (key === 'description' || key === 'comments' || key === 'resource_needs') {
                    // Ces champs peuvent être des chaînes vides ou null
                    data[key] = value || null;
                }
                else {
                    // Autres champs génériques
                    data[key] = value || null;
                }
            }
            
            // Débug
            console.log('Données envoyées au serveur:', data);
            
            // Vérifier que les données sont conformes au modèle attendu
            if (!data.title) {
                data.title = ''; // S'assurer que le titre n'est jamais null mais peut être vide
            }
            
            let result;
            
            if (this.currentAction) {
                // Update existing action
                result = await this.apiService.updateAction(this.currentAction, data);
                showToast('Action mise à jour avec succès', 'success');
            } else {
                // Create new action
                result = await this.apiService.createAction(data);
                showToast('Action créée avec succès', 'success');
            }
            
            // Stocker l'ID de l'action créée/modifiée pour pouvoir la mettre en évidence
            const actionId = result.id;
            
            // Close modal
            this.modal.hide();
            
            // Forcer le rechargement complet de la liste d'actions
            if (window.actionsList) {
                // Forcer un petit délai pour s'assurer que le backend a bien traité les données
                setTimeout(async () => {
                    await window.actionsList.loadActions();
                    
                    // Mettre en évidence l'action nouvellement créée/modifiée
                    if (actionId) {
                        const row = document.querySelector(`tr[data-action-id="${actionId}"]`);
                        if (row) {
                            row.classList.add('highlight-new');
                            setTimeout(() => {
                                row.classList.remove('highlight-new');
                            }, 3000);
                        }
                    }
                }, 300);
            }
        } catch (error) {
            console.error('Error saving action:', error);
            showToast('Erreur lors de la sauvegarde', 'error');
        }
    }
    
    /**
     * Resets the save button to its original state.
     */
    resetSaveButton() {
        const modal = document.getElementById('actionModal');
        if (!modal) return;
        const saveButton = modal.querySelector('.modal-footer .btn-warning, .modal-footer .btn-primary');
        if (saveButton) {
            saveButton.classList.remove('btn-warning');
            saveButton.classList.add('btn-primary');
            saveButton.innerHTML = 'Sauvegarder';
        }
    }
    
    /**
     * Edit an action - alias for show method for backward compatibility
     * @param {number} actionId - Action ID to edit
     */
    edit(actionId) {
        this.show(actionId);
    }

    /**
     * Vérifie si un pilote a une exception à une date donnée et affiche un avertissement dans le formulaire.
     * @param {number} userId - L'ID de l'utilisateur.
     * @param {string} date - La date à vérifier (YYYY-MM-DD).
     */
    async checkExceptionAndWarn(userId, date) {
        const warningDiv = document.getElementById('date-warning');
        if (!warningDiv) return;

        warningDiv.style.display = 'none'; // Cacher par défaut

        try {
            const exception = await this.apiService.checkUserException(userId, date);
            if (exception) {
                const user = (await this.apiService.getAssignableUsers()).find(u => u.id == userId);
                const userName = user ? user.username : 'Ce pilote';
                const exceptionTypeInfo = {
                    "holiday": "un jour férié",
                    "vacation": "en congés",
                    "sick": "en arrêt maladie",
                    "training": "en formation",
                    "other": "indisponible (autre)"
                };
                const reason = exceptionTypeInfo[exception.exception_type] || "indisponible";

                warningDiv.textContent = `Attention : ${userName} est ${reason} à cette date.`;
                warningDiv.style.display = 'block';
            }
        } catch (error) {
            console.error("Erreur lors de la vérification de l'exception :", error);
        }
    }
}

// Initialize ActionForm when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.actionForm = new ActionForm();

    /**
     * Vérifie si un pilote a une exception à une date donnée et affiche un avertissement dans le formulaire.
     * @param {number} userId - L'ID de l'utilisateur.
     * @param {string} date - La date à vérifier (YYYY-MM-DD).
     */
    ActionForm.prototype.checkExceptionAndWarn = async function(userId, date) {
        const warningDiv = document.getElementById('date-warning');
        if (!warningDiv) return;

        warningDiv.style.display = 'none'; // Cacher par défaut

        try {
            const exception = await this.apiService.checkUserException(userId, date);
            if (exception) {
                const user = (await this.apiService.getAssignableUsers()).find(u => u.id == userId);
                const userName = user ? user.username : 'Ce pilote';
                const exceptionTypeInfo = {
                    "holiday": "un jour férié",
                    "vacation": "en congés",
                    "sick": "en arrêt maladie",
                    "training": "en formation",
                    "other": "indisponible (autre)"
                };
                const reason = exceptionTypeInfo[exception.exception_type] || "indisponible";

                warningDiv.textContent = `Attention : ${userName} est ${reason} à cette date.`;
                warningDiv.style.display = 'block';
            }
        } catch (error) {
            console.error("Erreur lors de la vérification de l'exception :", error);
        }
    };
});

