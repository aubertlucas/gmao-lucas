/**
 * CalendarManager Component
 * Gère les calendriers de travail des utilisateurs (horaires et exceptions)
 * VERSION: 2025-06-03 - Protection contre les requêtes multiples active
 */
class CalendarManager {
    constructor(apiService) {
        this.apiService = apiService || new ApiService();
        this.authManager = new AuthManager();
        this.currentUserId = null;
        this.schedule = [];
        this.exceptions = [];
        this.dayNames = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
        // Verrou pour éviter les requêtes multiples
        this.savingException = false;
        this.deletingException = false;
        this.exceptionTypes = [
            { value: 'holiday', label: 'Jour férié', color: '#FF9800' },
            { value: 'vacation', label: 'Congés', color: '#4CAF50' },
            { value: 'sick', label: 'Maladie', color: '#F44336' },
            { value: 'training', label: 'Formation', color: '#2196F3' },
            { value: 'other', label: 'Autre', color: '#9C27B0' }
        ];
        
        // Nouveau : Map pour stocker les gestionnaires d'événements actifs
        this.eventListeners = new Map();
        
        // Nouveau : ID unique pour cette instance
        this.instanceId = `calendar_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        
        // NOUVEAU : Instance unique du modal Bootstrap
        this.modalInstance = null;
    }

    /**
     * Initialise le gestionnaire de calendrier
     * @param {string} containerId - ID du conteneur pour le calendrier
     * @param {number} userId - ID de l'utilisateur dont on veut gérer le calendrier
     */
    async init(containerId, userId) {
        try {
            console.log(`[CalendarManager ${this.instanceId}] Début d'initialisation avec userId: ${userId}`);
            
            // Nettoyer toute instance précédente de manière plus agressive
            if (window.calendarManagerInstance && window.calendarManagerInstance !== this) {
                console.log('[CalendarManager] Destruction de l\'instance précédente');
                try {
                    window.calendarManagerInstance.destroy();
                } catch (error) {
                    console.warn('[CalendarManager] Erreur lors de la destruction de l\'ancienne instance:', error);
                }
                window.calendarManagerInstance = null;
            }
            
            // Nettoyer complètement tous les modaux existants avant de commencer
            const existingModals = document.querySelectorAll('#exceptionModal');
            existingModals.forEach(modal => {
                console.log('[CalendarManager] Suppression modal orphelin lors de l\'init');
                modal.remove();
            });
            
            // Nettoyer complètement tout état de modal existant
            this.cleanupBodyBootstrapState();
            
            // Stocker la référence globale
            window.calendarManagerInstance = this;
            console.log(`[CalendarManager] Instance globale définie: ${this.instanceId}`);
            
            // Vérifier si une exception a été supprimée récemment (après un rechargement)
            if (localStorage.getItem('calendarJustDeletedException') === 'true') {
                this._justDeletedException = true;
                
                // Vérifier si la suppression est récente (moins de 30 secondes)
                const deletionDate = localStorage.getItem('calendarDeletionDate');
                if (deletionDate) {
                    const deletionTime = new Date(deletionDate).getTime();
                    const currentTime = new Date().getTime();
                    const timeDiff = currentTime - deletionTime;
                    
                    // Si plus de 30 secondes se sont écoulées, réinitialiser
                    if (timeDiff > 30000) {
                        this._justDeletedException = false;
                        localStorage.removeItem('calendarJustDeletedException');
                        localStorage.removeItem('calendarDeletionDate');
                    }
                }
            }
            
            // Vérifier si on doit revenir à un utilisateur spécifique après un rechargement
            const lastUserId = localStorage.getItem('calendarLastUserId');
            if (lastUserId && !userId) {
                userId = parseInt(lastUserId, 10);
                localStorage.removeItem('calendarLastUserId');
                console.log(`[CalendarManager] Restauration de l'utilisateur ${userId} après rechargement`);
            }

            this.currentUserId = userId || null;
            console.log(`[CalendarManager] ID utilisateur défini: ${userId}`);

            // Si pas d'ID utilisateur fourni, on ne fait rien
            if (!userId) return;
            
            // Récupérer le conteneur
            const container = document.getElementById(containerId);
            if (!container) {
                console.error(`[CalendarManager] Conteneur ${containerId} non trouvé`);
                return;
            }
            
            this.container = container;
            
            // Charger les données de l'utilisateur
            await this.loadUserData();
            
            // Créer l'interface utilisateur
            this.renderUI();
            
            // Configurer les événements
            this.setupEventListeners();
            
            // Vérifier si on doit montrer le modal d'exceptions après un rechargement
            if (localStorage.getItem('calendarShowExceptionOnLoad') === 'true') {
                localStorage.removeItem('calendarShowExceptionOnLoad');
                // Attendre un court instant pour que l'UI soit complètement chargée
                setTimeout(() => {
                    console.log('[CalendarManager] Affichage du modal d\'exception après rechargement');
                    this._justDeletedException = false; // Réinitialiser pour éviter une boucle
                    localStorage.removeItem('calendarJustDeletedException');
                    this.showExceptionModal();
                }, 500);
            }
            
            console.log(`[CalendarManager ${this.instanceId}] Initialisation terminée avec succès`);
        } catch (error) {
            console.error('[CalendarManager] Erreur lors de l\'initialisation:', error);
        }
    }

    /**
     * Charge les données de l'utilisateur (horaires et exceptions)
     */
    async loadUserData() {
        try {
            this.showLoading();

            // Charger l'horaire hebdomadaire
            this.schedule = await this.apiService.request(`/calendar/users/${this.currentUserId}/schedule`);
            console.log('Horaires chargés:', this.schedule);

            // Charger les exceptions de calendrier (des 6 derniers mois aux 12 prochains mois)
            const today = new Date();
            const sixMonthsAgo = new Date(today);
            sixMonthsAgo.setMonth(today.getMonth() - 6);
            
            const nextYear = new Date(today);
            nextYear.setMonth(today.getMonth() + 12);
            
            const startDate = sixMonthsAgo.toISOString().split('T')[0];
            const endDate = nextYear.toISOString().split('T')[0];
            
            this.exceptions = await this.apiService.request(
                `/calendar/users/${this.currentUserId}/exceptions?start_date=${startDate}&end_date=${endDate}`
            );
            console.log('Exceptions chargées:', this.exceptions);

            this.hideLoading();
        } catch (error) {
            console.error('Erreur lors du chargement des données de calendrier:', error);
            showToast('Erreur lors du chargement des données de calendrier', 'error');
            this.hideLoading();
        }
    }

    /**
     * Crée l'interface utilisateur
     */
    renderUI() {
        if (!this.container) return;

        this.container.innerHTML = `
            <div class="calendar-manager-container">
                <div class="row">
                    <div class="col-lg-5 d-flex">
                        <div class="card mb-4 flex-fill">
                            <div class="card-header bg-light">
                                <h5 class="mb-0 text-primary"><i class="bi bi-calendar-week me-2"></i> Horaires hebdomadaires</h5>
                            </div>
                            <div class="card-body d-flex flex-column">
                                <div class="table-responsive">
                                    <table class="table table-borderless">
                                        <thead class="table-light">
                                            <tr>
                                                <th>Jour</th>
                                                <th class="text-center">Travaillé</th>
                                                <th>Heures</th>
                                            </tr>
                                        </thead>
                                        <tbody id="scheduleTableBody">
                                            <!-- Rempli dynamiquement -->
                                        </tbody>
                                    </table>
                                </div>
                                <div class="d-flex justify-content-end mt-auto pt-3">
                                    <button class="btn btn-primary" id="saveScheduleBtn">
                                        <i class="bi bi-save me-2"></i> Enregistrer
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="col-lg-7 d-flex">
                        <div class="card mb-4 flex-fill">
                            <div class="card-header bg-light">
                                <h5 class="mb-0 text-warning"><i class="bi bi-calendar-x me-2"></i> Exceptions de calendrier</h5>
                            </div>
                            <div class="card-body">
                                <div class="mb-3">
                                    <button class="btn btn-warning" id="addExceptionBtn">
                                        <i class="bi bi-plus-circle me-2"></i> Ajouter une exception
                                    </button>
                                </div>
                                
                                <div class="exceptions-list-container">
                                    <table class="table table-hover">
                                        <thead class="table-light">
                                            <tr>
                                                <th>Date</th>
                                                <th>Type</th>
                                                <th>Description</th>
                                                <th class="text-center">Absence</th>
                                                <th class="text-center">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody id="exceptionsTableBody">
                                            <!-- Rempli dynamiquement -->
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Remplir les tableaux
        this.renderScheduleTable();
        this.renderExceptionsTable();
    }

    /**
     * Remplit le tableau des horaires hebdomadaires
     */
    renderScheduleTable() {
        const tbody = document.getElementById('scheduleTableBody');
        if (!tbody) return;

        tbody.innerHTML = '';

        // S'assurer que nous avons 7 jours (0-6)
        const scheduleByDay = {};
        this.schedule.forEach(item => {
            scheduleByDay[item.day_of_week] = item;
        });

        // Créer une ligne pour chaque jour
        for (let day = 0; day < 7; day++) {
            const daySchedule = scheduleByDay[day] || {
                day_of_week: day,
                is_working_day: day < 5,  // Lundi-Vendredi par défaut
                working_hours: day < 5 ? 8 : 0
            };

            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${this.dayNames[day]}</td>
                <td class="text-center">
                    <div class="form-check form-switch d-flex justify-content-center">
                        <input class="form-check-input" type="checkbox" 
                               id="workingDay${day}" 
                               data-day="${day}"
                               ${daySchedule.is_working_day ? 'checked' : ''}>
                    </div>
                </td>
                <td style="width: 100px;">
                    <input type="number" class="form-control form-control-sm text-center" 
                           id="workingHours${day}" 
                           data-day="${day}"
                           min="0" max="24" step="0.5" 
                           value="${daySchedule.working_hours}"
                           ${daySchedule.is_working_day ? '' : 'disabled'}>
                </td>
            `;
            tbody.appendChild(row);
        }
    }

    /**
     * Remplit le tableau des exceptions de calendrier avec regroupement
     */
    renderExceptionsTable() {
        const tbody = document.getElementById('exceptionsTableBody');
        if (!tbody) return;

        tbody.innerHTML = '';

        if (this.exceptions.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">Aucune exception de calendrier</td></tr>`;
            return;
        }

        // Trier les exceptions par date, du plus ancien au plus récent, pour faciliter le regroupement
        const sortedExceptions = [...this.exceptions].sort((a, b) => new Date(a.exception_date) - new Date(b.exception_date));

        const groupedExceptions = [];
        let i = 0;
        while (i < sortedExceptions.length) {
            const current = sortedExceptions[i];
            const group = {
                startDate: current.exception_date,
                endDate: current.exception_date,
                type: current.exception_type,
                description: current.description,
                children: [current]
            };

            let j = i + 1;
            while (j < sortedExceptions.length) {
                const next = sortedExceptions[j];
                const expectedNextDate = new Date(group.endDate);
                expectedNextDate.setDate(expectedNextDate.getDate() + 1);

                // Vérifier si le jour suivant est consécutif et a les mêmes propriétés
                if (next.exception_date === expectedNextDate.toISOString().split('T')[0] &&
                    next.exception_type === group.type &&
                    next.description === group.description) {
                    group.endDate = next.exception_date;
                    group.children.push(next);
                    j++;
                } else {
                    break;
                }
            }

            groupedExceptions.push(group);
            i = j;
        }

        // Trier les groupes par date de début (plus récentes en premier) pour l'affichage
        groupedExceptions.sort((a, b) => new Date(b.startDate) - new Date(a.startDate));

        groupedExceptions.forEach((group, index) => {
            const groupId = `group-${index}`;
            const typeInfo = this.exceptionTypes.find(t => t.value === group.type) || { label: 'Inconnu', color: '#999' };
            const isGroup = group.children.length > 1;

            if (isGroup) {
                const groupExceptionIds = group.children.map(child => child.id).join(',');
                // Ligne de groupe
                const groupRow = document.createElement('tr');
                groupRow.className = 'exception-group-row';
                groupRow.dataset.groupId = groupId;
                groupRow.innerHTML = `
                    <td>
                        <i class="bi bi-chevron-right toggle-icon me-2"></i>
                        ${this.formatDateFr(group.startDate)} - ${this.formatDateFr(group.endDate)} (${group.children.length} jours)
                    </td>
                    <td><span class="badge" style="background-color: ${typeInfo.color};">${typeInfo.label}</span></td>
                    <td>${group.description || '-'}</td>
                    <td class="text-center">-</td>
                    <td class="text-center">
                        <button class="btn btn-sm btn-outline-danger delete-group-exception" 
                                data-group-ids="${groupExceptionIds}" 
                                title="Supprimer tout le groupe">
                            <i class="bi bi-trash"></i>
                        </button>
                    </td>
                `;
                tbody.appendChild(groupRow);
            }

            // Lignes enfants (toujours créées, mais cachées pour les groupes)
            group.children.forEach(exception => {
                const childRow = document.createElement('tr');
                childRow.className = 'exception-child-row';
                if (isGroup) {
                    childRow.dataset.parentGroupId = groupId;
                } else {
                    childRow.style.display = 'table-row'; // Afficher si c'est une exception seule
                }
                
                // Calculer les heures d'absence pour l'affichage
                const normalHours = this.getUserNormalHoursForDate(this.currentUserId, exception.exception_date);
                const absenceHours = Math.max(0, normalHours - exception.working_hours);
                const absenceDisplay = absenceHours === normalHours ? `${absenceHours}h (complet)` : `${absenceHours}h`;
                
                childRow.innerHTML = `
                    <td class="${isGroup ? 'ps-4' : ''}">${this.formatDateFr(exception.exception_date)}</td>
                    <td><span class="badge" style="background-color: ${typeInfo.color}; font-size: 0.8em; padding: 0.4em 0.6em;">${typeInfo.label}</span></td>
                    <td>${exception.description || '-'}</td>
                    <td class="text-center">${absenceDisplay}</td>
                    <td class="text-center">
                        <button class="btn btn-sm btn-outline-primary edit-exception" data-id="${exception.id}" title="Modifier"><i class="bi bi-pencil"></i></button>
                        <button class="btn btn-sm btn-outline-danger delete-exception" data-id="${exception.id}" title="Supprimer"><i class="bi bi-trash"></i></button>
                    </td>
                `;
                tbody.appendChild(childRow);
            });
        });
        
        this.setupDynamicEventListeners();
    }

    /**
     * Nettoie tous les gestionnaires d'événements existants
     */
    cleanupEventListeners() {
        console.log(`[CalendarManager ${this.instanceId}] Nettoyage des gestionnaires d\'événements`);
        
        let cleanedCount = 0;
        this.eventListeners.forEach((listener, key) => {
            const [elementId, event] = key.split('::');
            const el = document.getElementById(elementId);
            if (el && listener) {
                try {
                    el.removeEventListener(event, listener);
                    cleanedCount++;
                    console.log(`[CalendarManager] Event listener supprimé: ${key}`);
                } catch (error) {
                    console.warn(`[CalendarManager] Erreur lors de la suppression de l'event listener ${key}:`, error);
                }
            }
        });
        
        console.log(`[CalendarManager ${this.instanceId}] ${cleanedCount} event listeners nettoyés`);
        this.eventListeners.clear();
    }

    /**
     * Attache un gestionnaire d'événement avec tracking
     */
    attachEventListener(elementId, event, handler) {
        const element = document.getElementById(elementId);
        if (!element) return;
        
        const key = `${elementId}::${event}`;
        
        // Supprimer l'ancien gestionnaire s'il existe
        if (this.eventListeners.has(key)) {
            const oldHandler = this.eventListeners.get(key);
            element.removeEventListener(event, oldHandler);
        }
        
        // Créer un wrapper pour le handler avec logging
        const wrappedHandler = (e) => {
            console.log(`[CalendarManager ${this.instanceId}] Événement ${event} déclenché sur ${elementId}`);
            handler.call(this, e);
        };
        
        // Attacher le nouveau gestionnaire
        element.addEventListener(event, wrappedHandler);
        this.eventListeners.set(key, wrappedHandler);
    }

    /**
     * Configure les écouteurs d'événements
     */
    setupEventListeners() {
        console.log('[CalendarManager] Configuration des gestionnaires d\'événements');
        
        // Nettoyer tous les gestionnaires existants d'abord
        this.cleanupEventListeners();
        
        // IMPORTANT: Empêcher la soumission automatique du formulaire qui cause des requêtes multiples
        this.attachEventListener('exceptionForm', 'submit', (e) => {
            console.log('[CalendarManager] Interception de la soumission du formulaire');
            e.preventDefault();
            e.stopPropagation();
            return false;
        });
        
        // Gestionnaire pour les cases à cocher "jour travaillé"
        document.querySelectorAll('[id^="workingDay"]').forEach(checkbox => {
            const day = checkbox.dataset.day;
            this.attachEventListener(checkbox.id, 'change', (e) => {
                const hoursInput = document.getElementById(`workingHours${day}`);
                
                if (e.target.checked) {
                    hoursInput.disabled = false;
                    if (parseFloat(hoursInput.value) === 0) {
                        hoursInput.value = "8";
                    }
                } else {
                    hoursInput.disabled = true;
                    hoursInput.value = "0";
                }
            });
        });

        // Bouton pour enregistrer l'horaire
        this.attachEventListener('saveScheduleBtn', 'click', async () => {
            const btn = document.getElementById('saveScheduleBtn');
            if (btn.disabled) return;
            
            btn.disabled = true;
            try {
                await this.saveSchedule();
            } finally {
                btn.disabled = false;
            }
        });

        // Bouton pour ajouter une exception
        this.attachEventListener('addExceptionBtn', 'click', () => {
            if (this._justDeletedException) {
                console.log('[DEBUG] Rechargement nécessaire après suppression');
                localStorage.setItem('calendarLastUserId', this.currentUserId);
                localStorage.setItem('calendarShowExceptionOnLoad', 'true');
                
                // Sauvegarder l'onglet actuel avant rechargement
                const activeTab = document.querySelector('.nav-tabs .nav-link.active');
                if (activeTab) {
                    localStorage.setItem('calendarActiveTab', activeTab.id);
                }
                
                window.location.reload();
            } else {
                this.showExceptionModal();
            }
        });

        // Gestionnaires pour les boutons d'édition et suppression (délégation d'événements)
        this.setupDynamicEventListeners();
    }

    /**
     * Configure les gestionnaires pour les éléments dynamiques
     */
    setupDynamicEventListeners() {
        const exceptionsTable = document.getElementById('exceptionsTableBody');
        if (!exceptionsTable) return;
        
        console.log('[CalendarManager] Configuration des gestionnaires dynamiques');
        
        // Utiliser la délégation d'événements pour les boutons dynamiques
        const tableHandler = (e) => {
            const editBtn = e.target.closest('.edit-exception');
            const deleteBtn = e.target.closest('.delete-exception');
            const groupRow = e.target.closest('.exception-group-row');
            const deleteGroupBtn = e.target.closest('.delete-group-exception');

            if (deleteGroupBtn) {
                e.preventDefault();
                e.stopPropagation();
                const idsToDelete = deleteGroupBtn.dataset.groupIds.split(',');
                this.deleteExceptionGroup(idsToDelete);
                return;
            }
            
            if (groupRow) {
                const groupId = groupRow.dataset.groupId;
                groupRow.classList.toggle('expanded');
                document.querySelectorAll(`[data-parent-group-id="${groupId}"]`).forEach(childRow => {
                    childRow.classList.toggle('expanded');
                });
            }

            if (editBtn) {
                e.preventDefault();
                e.stopPropagation();
                
                // Protection contre les clics multiples
                if (editBtn.dataset.processing === 'true') {
                    console.log('[PROTECTION] Édition déjà en cours - IGNORÉ');
                    return;
                }
                
                editBtn.dataset.processing = 'true';
                const exceptionId = editBtn.dataset.id;
                console.log(`[DYNAMIC] Édition exception ${exceptionId}`);
                
                setTimeout(() => {
                    editBtn.dataset.processing = 'false';
                }, 1000);
                
                this.editException(exceptionId);
            } else if (deleteBtn) {
                e.preventDefault();
                e.stopPropagation();
                
                // Protection contre les clics multiples
                if (deleteBtn.dataset.processing === 'true') {
                    console.log('[PROTECTION] Suppression déjà en cours - IGNORÉ');
                    return;
                }
                
                deleteBtn.dataset.processing = 'true';
                const exceptionId = deleteBtn.dataset.id;
                console.log(`[DYNAMIC] Suppression exception ${exceptionId}`);
                
                setTimeout(() => {
                    deleteBtn.dataset.processing = 'false';
                }, 2000);
                
                this.deleteException(exceptionId);
            }
        };
        
        // Supprimer TOUS les anciens gestionnaires
        const key = 'exceptionsTableBody::click';
        if (this.eventListeners.has(key)) {
            const oldHandler = this.eventListeners.get(key);
            exceptionsTable.removeEventListener('click', oldHandler);
            console.log('[CalendarManager] Ancien gestionnaire dynamique supprimé');
        }
        
        // Attacher le nouveau gestionnaire
        exceptionsTable.addEventListener('click', tableHandler);
        this.eventListeners.set(key, tableHandler);
        console.log('[CalendarManager] Nouveau gestionnaire dynamique attaché');
    }

    /**
     * Enregistre l'horaire hebdomadaire
     */
    async saveSchedule() {
        try {
            this.showLoading();

            // Collecter les données du formulaire
            const scheduleData = [];
            for (let day = 0; day < 7; day++) {
                const isWorkingDay = document.getElementById(`workingDay${day}`).checked;
                const workingHours = parseFloat(document.getElementById(`workingHours${day}`).value) || 0;

                scheduleData.push({
                    user_id: this.currentUserId,
                    day_of_week: day,
                    is_working_day: isWorkingDay,
                    working_hours: isWorkingDay ? workingHours : 0
                });
            }

            // Envoyer les données à l'API
            const response = await this.apiService.request(`/calendar/users/${this.currentUserId}/schedule`, {
                method: 'PUT',
                body: JSON.stringify(scheduleData)
            });

            // Mettre à jour les données locales
            this.schedule = response;

            showToast('Horaire hebdomadaire enregistré avec succès', 'success');
            this.hideLoading();
        } catch (error) {
            console.error('Erreur lors de l\'enregistrement de l\'horaire:', error);
            showToast('Erreur lors de l\'enregistrement de l\'horaire', 'error');
            this.hideLoading();
        }
    }

    /**
     * Crée le modal HTML dynamiquement
     */
    createExceptionModal() {
        // Supprimer tout modal existant dans le DOM
        const existingModal = document.getElementById('exceptionModal');
        if (existingModal) {
            console.log('[MODAL] Suppression du modal existant du DOM');
            existingModal.remove();
        }
        
        // Nettoyer complètement l'état Bootstrap
        this.cleanupBodyBootstrapState();
        
        const modalHTML = `
            <div class="modal fade" id="exceptionModal" tabindex="-1" aria-hidden="true">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header bg-warning text-dark">
                            <h5 class="modal-title" id="exceptionModalTitle">Ajouter une exception</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fermer"></button>
                        </div>
                        <div class="modal-body">
                            <form id="exceptionForm">
                                <input type="hidden" id="exceptionId" value="">
                                
                                <div class="row mb-3">
                                    <div class="col-md-6">
                                        <label for="exceptionDateStart" class="form-label">Date de début</label>
                                        <input type="date" class="form-control" id="exceptionDateStart" required>
                                    </div>
                                    <div class="col-md-6">
                                        <label for="exceptionDateEnd" class="form-label">Date de fin</label>
                                        <input type="date" class="form-control" id="exceptionDateEnd">
                                        <div class="form-text text-muted">
                                            Optionnel. Si renseigné, crée des exceptions pour tous les jours de la période.
                                        </div>
                                    </div>
                                </div>
                                <div class="mb-3" id="dateRangeSummary" style="display: none;">
                                    <div class="alert alert-info">
                                        <i class="bi bi-info-circle"></i> <span id="dateRangeSummaryText"></span>
                                    </div>
                                </div>
                                
                                <div class="mb-3">
                                    <label for="exceptionType" class="form-label">Type</label>
                                    <select class="form-select" id="exceptionType" required>
                                        ${this.exceptionTypes.map(type => 
                                            `<option value="${type.value}">${type.label}</option>`
                                        ).join('')}
                                    </select>
                                </div>
                                
                                <div class="mb-3">
                                    <label for="exceptionDescription" class="form-label">Description</label>
                                    <input type="text" class="form-control" id="exceptionDescription" 
                                           placeholder="Description optionnelle">
                                </div>
                                
                                <div class="mb-3">
                                    <label for="exceptionHours" class="form-label">Heures d'absence</label>
                                    <input type="number" class="form-control" id="exceptionHours" 
                                           min="0" max="24" step="0.5" value="0">
                                    <div class="form-text text-muted">
                                        Nombre d'heures d'absence ce jour-là (0 = aucune absence, journée normale)
                                    </div>
                                    <div id="hoursInfo" class="form-text text-info" style="display: none;">
                                        <i class="bi bi-info-circle"></i> <span id="hoursInfoText"></span>
                                    </div>
                                </div>
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Annuler</button>
                            <button type="button" class="btn btn-warning" id="saveExceptionBtn">Enregistrer</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        console.log('[MODAL] Création du nouveau modal HTML');
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        return document.getElementById('exceptionModal');
    }

    /**
     * Nettoie complètement l'état Bootstrap du body
     */
    cleanupBodyBootstrapState() {
        console.log('[MODAL] Nettoyage complet de l\'état Bootstrap du body');
        
        // Supprimer toutes les classes modal de Bootstrap
        document.body.classList.remove('modal-open');
        
        // Supprimer tous les styles inline
        document.body.style.removeProperty('overflow');
        document.body.style.removeProperty('padding-right');
        
        // Supprimer TOUS les attributs data-bs-* de Bootstrap
        const attributesToRemove = [];
        for (let i = 0; i < document.body.attributes.length; i++) {
            const attr = document.body.attributes[i];
            if (attr.name.startsWith('data-bs-')) {
                attributesToRemove.push(attr.name);
            }
        }
        
        attributesToRemove.forEach(attrName => {
            console.log(`[MODAL] Suppression attribut ${attrName}`);
            document.body.removeAttribute(attrName);
        });
        
        // Forcer la réinitialisation complète du style
        document.body.style.cssText = document.body.style.cssText.replace(/overflow[^;]*;?/g, '');
        document.body.style.cssText = document.body.style.cssText.replace(/padding-right[^;]*;?/g, '');
        
        console.log('[MODAL] État Bootstrap du body complètement nettoyé');
    }

    /**
     * Affiche le modal pour ajouter/éditer une exception
     * @param {number} exceptionId - ID de l'exception à éditer (optionnel)
     */
    async showExceptionModal(exceptionId = null) {
        // Vérifier si une opération est déjà en cours
        if (window._globalExceptionLock === true || this.deletingException) {
            showToast('Une opération est en cours. Veuillez attendre qu\'elle se termine.', 'warning');
            return;
        }
        
        console.log(`[MODAL] Ouverture du modal - Instance actuelle: ${this.modalInstance ? 'existe' : 'null'}`);
        
        // ÉTAPE 0: Nettoyage préventif COMPLET avant toute création
        console.log('[MODAL] Nettoyage préventif complet');
        this.cleanupBodyBootstrapState();
        
        // ÉTAPE 1: S'assurer qu'aucun modal n'est déjà ouvert
        if (this.modalInstance) {
            console.log('[MODAL] Fermeture de l\'instance existante');
            try {
                // Forcer la fermeture immédiate sans animation
                this.modalInstance._element.style.display = 'none';
                this.modalInstance.hide();
                this.modalInstance.dispose();
            } catch (error) {
                console.warn('[MODAL] Erreur lors de la fermeture:', error);
            }
            this.modalInstance = null;
        }
        
        // Nettoyage supplémentaire : attendre un instant pour que toute fermeture soit terminée
        await new Promise(resolve => setTimeout(resolve, 50));
        
        // ÉTAPE 2: Créer le modal HTML fraîchement dans le DOM
        const modalElement = this.createExceptionModal();
        
        // ÉTAPE 3: Réinitialiser le formulaire
        document.getElementById('exceptionForm').reset();
        document.getElementById('exceptionId').value = '';
        
        // Masquer le résumé de plage de dates
        document.getElementById('dateRangeSummary').style.display = 'none';
        
        // Par défaut, affichage pour ajout
        document.getElementById('exceptionModalTitle').textContent = 'Ajouter une exception';
        document.getElementById('exceptionDateEnd').parentElement.style.display = 'block';
        
        // Si c'est une modification
        if (exceptionId) {
            const exception = this.exceptions.find(e => e.id == exceptionId);
            if (exception) {
                document.getElementById('exceptionModalTitle').textContent = 'Modifier l\'exception';
                document.getElementById('exceptionId').value = exception.id;
                document.getElementById('exceptionDateStart').value = exception.exception_date;
                document.getElementById('exceptionDateEnd').parentElement.style.display = 'none';
                document.getElementById('exceptionDescription').value = exception.description || '';
                
                // Le type d'exception sera défini après la configuration des event listeners
                
                // Convertir working_hours en heures d'absence pour l'affichage
                const normalHours = this.getUserNormalHoursForDate(this.currentUserId, exception.exception_date);
                const absenceHours = Math.max(0, normalHours - exception.working_hours);
                document.getElementById('exceptionHours').value = absenceHours;
                
                console.log(`[EDIT] Exception ${exception.id}: ${normalHours}h normales - ${exception.working_hours}h travaillées = ${absenceHours}h d'absence`);
            }
        } else {
            // Définir la date de début par défaut à aujourd'hui
            const today = new Date().toISOString().split('T')[0];
            document.getElementById('exceptionDateStart').value = today;
        }
        
        // ÉTAPE 4: CONFIGURER LES EVENT LISTENERS
        this.setupModalEventListeners();
        
        // ÉTAPE 5: Créer UNE SEULE instance Bootstrap Modal avec backdrop
        console.log('[MODAL] Création d\'une nouvelle instance Bootstrap Modal avec backdrop');
        this.modalInstance = new bootstrap.Modal(modalElement, {
            backdrop: 'static', // Backdrop sombre mais pas de fermeture en cliquant dessus
            keyboard: false     // Empêcher la fermeture avec Escape
        });
        
        // ÉTAPE 6: Gérer les événements de fermeture du modal
        modalElement.addEventListener('hidden.bs.modal', () => {
            const wasSuccessClose = this.modalInstance && this.modalInstance._isClosingAfterSuccess;
            console.log(`[MODAL] Modal fermé - nettoyage complet${wasSuccessClose ? ' (après succès)' : ''}`);
            
            if (this.modalInstance) {
                console.log('[MODAL] Disposal de l\'instance Bootstrap');
                try {
                    this.modalInstance.dispose();
                } catch (error) {
                    console.warn('[MODAL] Erreur lors du disposal:', error);
                }
                this.modalInstance = null;
            }
            
            // Supprimer complètement le modal du DOM
            console.log('[MODAL] Suppression du modal du DOM');
            modalElement.remove();
            
            // Nettoyer complètement l'état Bootstrap
            this.cleanupBodyBootstrapState();
            
            console.log('[MODAL] Event listener de fermeture terminé');
        }, { once: true });
        
        // ÉTAPE 7: Appliquer les données d'exception après configuration (si édition)
        if (exceptionId) {
            const exception = this.exceptions.find(e => e.id == exceptionId);
            if (exception) {
                setTimeout(() => {
                    const typeSelect = document.getElementById('exceptionType');
                    if (typeSelect) {
                        typeSelect.value = exception.exception_type;
                        console.log(`[EDIT] Type d'exception appliqué après configuration: ${typeSelect.value}`);
                        
                        // Déclencher la mise à jour des informations d'heures
                        const updateEvent = new Event('change', { bubbles: true });
                        document.getElementById('exceptionDateStart').dispatchEvent(updateEvent);
                    }
                }, 100);
            }
        }
        
        // ÉTAPE 8: Afficher le modal
        console.log('[MODAL] Affichage du modal');
        this.modalInstance.show();
    }

    /**
     * Configure les event listeners du modal (appelé une seule fois)
     */
    setupModalEventListeners() {
        const startDateInput = document.getElementById('exceptionDateStart');
        const endDateInput = document.getElementById('exceptionDateEnd');
        const exceptionForm = document.getElementById('exceptionForm');
        const saveExceptionBtn = document.getElementById('saveExceptionBtn');
        
        if (!startDateInput || !endDateInput || !exceptionForm || !saveExceptionBtn) {
            console.error('[MODAL] Éléments du modal non trouvés');
            return;
        }
        
        // ÉTAPE 1: NETTOYER ABSOLUMENT TOUS LES EVENT LISTENERS EXISTANTS
        console.log('[MODAL] Nettoyage des event listeners du modal');
        
        // Cloner et remplacer les éléments pour supprimer TOUS les event listeners
        const newSaveBtn = saveExceptionBtn.cloneNode(true);
        saveExceptionBtn.parentNode.replaceChild(newSaveBtn, saveExceptionBtn);
        
        const newForm = exceptionForm.cloneNode(true);
        exceptionForm.parentNode.replaceChild(newForm, exceptionForm);
        
        // Re-récupérer les références après clonage
        const cleanForm = document.getElementById('exceptionForm');
        const cleanSaveBtn = document.getElementById('saveExceptionBtn');
        const cleanStartDate = document.getElementById('exceptionDateStart');
        const cleanEndDate = document.getElementById('exceptionDateEnd');
        
        // Fonction pour mettre à jour le résumé de la plage de dates
        const updateDateRangeSummary = () => {
            const startDate = cleanStartDate.value;
            const endDate = cleanEndDate.value;
            const summaryDiv = document.getElementById('dateRangeSummary');
            const summaryText = document.getElementById('dateRangeSummaryText');
            
            if (endDate && startDate && startDate <= endDate) {
                const dates = this.generateDateRange(startDate, endDate);
                summaryDiv.style.display = 'block';
                if (dates.length === 1) {
                    summaryText.textContent = `1 exception sera créée pour le ${this.formatDateFr(startDate)}.`;
                } else {
                    summaryText.textContent = `${dates.length} exceptions seront créées pour la période du ${this.formatDateFr(startDate)} au ${this.formatDateFr(endDate)}.`;
                }
            } else {
                summaryDiv.style.display = 'none';
            }
        };
        
        // ÉTAPE 2: ATTACHER LES NOUVEAUX EVENT LISTENERS UNE SEULE FOIS
        
        // Event listener unique pour la date de début
        cleanStartDate.addEventListener('change', () => {
            // Assurer que la date de fin n'est pas antérieure à la date de début
            if (cleanEndDate.value && cleanEndDate.value < cleanStartDate.value) {
                cleanEndDate.value = cleanStartDate.value;
            }
            cleanEndDate.min = cleanStartDate.value;
            updateDateRangeSummary();
        }, { once: false });
        
        // Event listener unique pour la date de fin
        cleanEndDate.addEventListener('change', updateDateRangeSummary, { once: false });
        
        // Fonction pour mettre à jour les informations sur les heures
        const updateHoursInfo = () => {
            const startDate = cleanStartDate.value;
            const hoursInput = document.getElementById('exceptionHours');
            const hoursInfo = document.getElementById('hoursInfo');
            const hoursInfoText = document.getElementById('hoursInfoText');
            
            if (startDate && hoursInput && hoursInfo && hoursInfoText) {
                const normalHours = this.getUserNormalHoursForDate(this.currentUserId, startDate);
                let absenceHours = parseFloat(hoursInput.value) || 0;
                
                // Validation: limiter les heures d'absence aux heures normales
                if (absenceHours > normalHours) {
                    absenceHours = normalHours;
                    hoursInput.value = normalHours;
                }
                
                const workingHours = Math.max(0, normalHours - absenceHours);
                
                // Mettre à jour le maximum pour les heures d'absence
                hoursInput.max = normalHours;
                
                // Changer la couleur selon la situation
                hoursInput.classList.remove('is-invalid', 'is-valid');
                if (absenceHours > normalHours) {
                    hoursInput.classList.add('is-invalid');
                } else if (absenceHours > 0) {
                    hoursInput.classList.add('is-valid');
                }
                
                if (normalHours > 0) {
                    hoursInfo.style.display = 'block';
                    if (absenceHours === normalHours) {
                        hoursInfoText.textContent = `Heures normales: ${normalHours}h → Absence complète (0h travaillées)`;
                        hoursInfoText.className = 'form-text text-warning';
                    } else if (absenceHours > 0) {
                        hoursInfoText.textContent = `Heures normales: ${normalHours}h → Heures travaillées après absence: ${workingHours}h`;
                        hoursInfoText.className = 'form-text text-info';
                    } else {
                        hoursInfoText.textContent = `Heures normales: ${normalHours}h → Aucune absence (journée normale)`;
                        hoursInfoText.className = 'form-text text-success';
                    }
                } else {
                    hoursInfo.style.display = 'block';
                    hoursInfoText.textContent = `Ce jour n'est normalement pas travaillé (${normalHours}h)`;
                    hoursInfoText.className = 'form-text text-muted';
                }
            }
        };
        
        // Event listeners pour les changements de date et heures
        cleanStartDate.addEventListener('change', updateHoursInfo, { once: false });
        document.getElementById('exceptionHours').addEventListener('input', updateHoursInfo, { once: false });
        
        // EMPÊCHER ABSOLUMENT LA SOUMISSION DU FORMULAIRE
        cleanForm.addEventListener('submit', (e) => {
            console.log('[MODAL] Interception submit du formulaire - BLOQUÉ');
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            return false;
        }, { once: false });
        
        // Empêcher la soumission avec la touche Entrée
        cleanForm.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                console.log('[MODAL] Touche Entrée interceptée - BLOQUÉE');
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                return false;
            }
        }, { once: false });
        
        // ÉTAPE 3: GESTIONNAIRE UNIQUE POUR LE BOUTON DE SAUVEGARDE
        console.log('[MODAL] Attachement de l\'event listener UNIQUE au bouton saveExceptionBtn');
        
        // Variable pour s'assurer qu'une seule exécution est possible
        let isExecuting = false;
        
        cleanSaveBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            
            console.log(`[MODAL] Clic sur saveExceptionBtn détecté - isExecuting: ${isExecuting}`);
            
            // PROTECTION ABSOLUE : Vérifier si déjà en cours d'exécution
            if (isExecuting) {
                console.log('[PROTECTION] Exécution déjà en cours - IGNORÉ');
                return;
            }
            
            // PROTECTION : Vérifier le verrou global
            if (window._globalExceptionLock === true) {
                console.log('[PROTECTION] Verrou global actif - IGNORÉ');
                return;
            }
            
            // PROTECTION : Vérifier le verrou d'instance
            if (this.savingException === true) {
                console.log('[PROTECTION] Verrou d\'instance actif - IGNORÉ');
                return;
            }
            
            // MARQUER COMME EN COURS D'EXÉCUTION (pas le verrou d'instance ici)
            isExecuting = true;
            
                            // Protection basique contre les double-clics rapides
                const now = Date.now();
                const lastClick = parseInt(cleanSaveBtn.dataset.lastClick || '0', 10);
                
                // Ignorer les clics trop rapprochés (moins de 1 seconde)
                if (now - lastClick < 1000) {
                    console.log('[PROTECTION] Double-clic rapide - IGNORÉ');
                    isExecuting = false;
                    return;
                }
            
            // Enregistrer le timestamp et désactiver le bouton
            cleanSaveBtn.dataset.lastClick = now.toString();
            cleanSaveBtn.disabled = true;
            cleanSaveBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Enregistrement...';
            
            try {
                console.log('[MODAL] Début de l\'exécution de saveException');
                await this.saveException();
                console.log('[MODAL] Sauvegarde terminée avec succès');
            } catch (error) {
                console.error('[MODAL] Erreur lors de la sauvegarde:', error);
                showToast('Erreur: ' + error.message, 'error');
                
                // Rétablir le bouton en cas d'erreur
                if (cleanSaveBtn) {
                    cleanSaveBtn.disabled = false;
                    cleanSaveBtn.innerHTML = 'Enregistrer';
                }
            } finally {
                // TOUJOURS libérer le verrou local
                console.log('[MODAL] Libération du verrou d\'exécution local');
                isExecuting = false;
                
                // Rétablir le bouton après un court délai
                setTimeout(() => {
                    if (cleanSaveBtn && document.body.contains(cleanSaveBtn)) {
                        cleanSaveBtn.disabled = false;
                        cleanSaveBtn.innerHTML = 'Enregistrer';
                    }
                }, 800);
            }
        }, { once: false });
        
        // ÉTAPE 4: DÉSACTIVER LES EVENT LISTENERS BOOTSTRAP POUR ÉVITER LES CONFLITS
        const closeBtns = document.querySelectorAll('#exceptionModal [data-bs-dismiss="modal"]');
        closeBtns.forEach(btn => {
            // Supprimer l'attribut data-bs-dismiss pour éviter les conflits
            btn.removeAttribute('data-bs-dismiss');
            
                         // Ajouter notre propre gestionnaire de fermeture
             btn.addEventListener('click', (e) => {
                 e.preventDefault();
                 e.stopPropagation();
                 console.log('[MODAL] Fermeture manuelle du modal');
                 if (this.modalInstance && !isExecuting && !this.savingException) {
                     this.modalInstance.hide();
                 }
             }, { once: false });
        });
        
        // Initialiser les min/max des datepickers
        if (cleanStartDate.value) {
            cleanEndDate.min = cleanStartDate.value;
            // Déclencher la mise à jour des informations d'heures après initialisation
            setTimeout(() => updateHoursInfo(), 100);
        }
        
        console.log('[MODAL] Tous les event listeners du modal configurés PROPREMENT');
    }

    /**
     * Édite une exception existante
     * @param {string} exceptionId - ID de l'exception à éditer
     */
    editException(exceptionId) {
        const exception = this.exceptions.find(e => e.id == exceptionId);
        if (exception) {
            this.showExceptionModal(exception.id);
        } else {
            showToast('Exception non trouvée', 'error');
        }
    }

    /**
     * Enregistre une exception ou une plage d'exceptions de calendrier
     * @returns {Promise} - Une promesse résolue quand l'enregistrement est terminé
     */
    async saveException() {
        // PROTECTION MULTI-NIVEAUX CONTRE LES REQUÊTES MULTIPLES (assouplies)
        
        // Niveau 0: Verrou d'instance
        if (this.savingException === true) {
            console.error('[PROTECTION L0] Verrou d\'instance actif - Requête refusée');
            throw new Error('Une opération d\'enregistrement est déjà en cours sur cette instance.');
        }
        
        // Niveau 1: Verrou global avec timestamp (assoupli)
        const now = Date.now();
        if (window._globalExceptionLock === true) {
            const lockTime = window._globalExceptionLockTime || 0;
            const timeSinceLock = now - lockTime;
            
            // Si le verrou est actif depuis moins de 3 secondes, on refuse
            if (timeSinceLock < 3000) {
                console.error('[PROTECTION L1] Verrou global actif - Requête refusée');
                throw new Error('Une opération d\'enregistrement est déjà en cours. Veuillez patienter...');
            } else {
                // Verrou ancien, on le libère et on continue
                console.warn('[PROTECTION L1] Verrou global expiré, libération automatique');
                window._globalExceptionLock = false;
                window._globalExceptionLockTime = null;
            }
        }
        
        // Niveau 2: Protection légère par signature de données
        const startDate = document.getElementById('exceptionDateStart').value;
        const absenceHours = parseFloat(document.getElementById('exceptionHours').value) || 0;
        
        // Convertir les heures d'absence en heures travaillées
        const normalHours = this.getUserNormalHoursForDate(this.currentUserId, startDate);
        const workingHours = Math.max(0, normalHours - absenceHours);
        
        console.log(`[CONVERSION] Heures normales: ${normalHours}h, Absence: ${absenceHours}h → Travaillées: ${workingHours}h`);
        
        const formData = {
            user_id: this.currentUserId,
            start_date: startDate,
            end_date: document.getElementById('exceptionDateEnd').value || null,
            type: document.getElementById('exceptionType').value,
            description: document.getElementById('exceptionDescription').value,
            hours: workingHours // Heures travaillées après conversion
        };
        
        const requestSignature = JSON.stringify(formData);
        const lastRequestSignature = localStorage.getItem('lastExceptionRequestSignature');
        const lastRequestTime = parseInt(localStorage.getItem('lastExceptionRequestTime') || '0');
        
        // Si la même requête a été faite dans la dernière seconde, on refuse
        if (requestSignature === lastRequestSignature && (now - lastRequestTime) < 1000) {
            console.error('[PROTECTION L2] Requête identique très rapide - Requête refusée');
            throw new Error('Veuillez attendre un instant avant de réessayer.');
        }
        
        // MAINTENANT activer les verrous APRÈS toutes les vérifications
        this.savingException = true;
        window._globalExceptionLock = true;
        window._globalExceptionLockTime = now;
        
        // Enregistrer cette requête
        localStorage.setItem('lastExceptionRequestSignature', requestSignature);
        localStorage.setItem('lastExceptionRequestTime', now.toString());
        
        // Identifiant unique pour tracer cette requête
        const requestId = `save_${now}_${Math.random().toString(36).substring(2, 9)}`;
        console.log(`[CalendarManager] saveException appelé - ID: ${requestId} - VERROUS ACTIVÉS`);
        
        // Protection supplémentaire : vérifier si on a récemment supprimé une exception
        const deletionTime = localStorage.getItem('calendarDeletionDate');
        if (deletionTime) {
            const timeSinceDeletion = now - new Date(deletionTime).getTime();
            if (timeSinceDeletion < 1000) { // Moins d'1 seconde
                console.log('[PROTECTION L3] Ajout trop rapide après suppression - attente...');
                await new Promise(resolve => setTimeout(resolve, 1000 - timeSinceDeletion));
            }
        }
        
        try {
            console.log(`[${requestId}] Début de saveException avec protection multi-niveaux`);
            this.showLoading();
            
            const exceptionId = document.getElementById('exceptionId').value;
            const startDate = formData.start_date;
            const endDate = formData.end_date;
            const exceptionType = formData.type;
            const exceptionDescription = formData.description;
            const exceptionHours = formData.hours;
            
            console.log(`[${requestId}] Données: id=${exceptionId}, startDate=${startDate}, type=${exceptionType}`);

            // Si c'est une modification d'exception existante
            if (exceptionId) {
                const exceptionData = {
                    user_id: this.currentUserId,
                    exception_date: startDate,
                    exception_type: exceptionType,
                    description: exceptionDescription,
                    working_hours: exceptionHours
                };
                
                console.log(`[${requestId}] Modification de l'exception ${exceptionId}`);
                
                // Mettre à jour une exception existante
                const response = await this.apiService.request(
                    `/calendar/users/${this.currentUserId}/exceptions/${exceptionId}`, 
                    {
                        method: 'PUT',
                        body: JSON.stringify(exceptionData)
                    }
                );
                
                // Mettre à jour l'exception dans le tableau local
                const index = this.exceptions.findIndex(e => e.id == exceptionId);
                if (index !== -1) {
                    this.exceptions[index] = response;
                }
                
                showToast('Exception mise à jour avec succès', 'success');
            } 
            // Si c'est une plage de dates (ajout uniquement)
            else if (endDate && startDate <= endDate) {
                // Générer toutes les dates de la plage
                const dates = this.generateDateRange(startDate, endDate);
                console.log(`[${requestId}] Création de ${dates.length} exceptions pour la période du ${startDate} au ${endDate}`);
                
                // Compteur pour le nombre d'exceptions ajoutées avec succès
                let successCount = 0;
                
                // Créer une exception pour chaque date SÉQUENTIELLEMENT pour éviter les conflits
                for (const date of dates) {
                    const exceptionData = {
                        user_id: this.currentUserId,
                        exception_date: date,
                        exception_type: exceptionType,
                        description: exceptionDescription,
                        working_hours: exceptionHours
                    };
                    
                    try {
                        // Vérifier avant chaque requête si le verrou global est toujours actif
                        if (window._globalExceptionLock !== true) {
                            throw new Error('Verrou global perdu pendant l\'opération');
                        }
                        
                        console.log(`[${requestId}] Envoi exception pour ${date}`);
                        
                        // Créer une nouvelle exception avec protection
                        const response = await this.apiService.request(
                            `/calendar/users/${this.currentUserId}/exceptions`, 
                            {
                                method: 'POST',
                                body: JSON.stringify(exceptionData)
                            }
                        );
                        
                        console.log(`[${requestId}] Succès pour ${date}:`, response.id);
                        
                        // Ajouter la nouvelle exception au tableau local
                        this.exceptions.push(response);
                        successCount++;
                        
                        // Petit délai entre les requêtes pour éviter la surcharge
                        if (dates.length > 1) {
                            await new Promise(resolve => setTimeout(resolve, 200));
                        }
                    } catch (error) {
                        console.error(`[${requestId}] Erreur pour ${date}:`, error.message);
                        
                        // Si c'est une erreur de doublon, ne pas compter comme une erreur critique
                        if (error.message && error.message.includes('existe déjà')) {
                            console.log(`[${requestId}] Exception déjà existante pour ${date} - ignorée`);
                        }
                    }
                }
                
                if (successCount === dates.length) {
                    showToast(`${successCount} exceptions ajoutées avec succès`, 'success');
                } else if (successCount > 0) {
                    showToast(`${successCount}/${dates.length} exceptions ajoutées. Certaines existaient déjà.`, 'warning');
                } else {
                    showToast('Aucune exception n\'a pu être ajoutée', 'error');
                }
            } 
            // Si c'est une date unique (ajout)
            else {
                const exceptionData = {
                    user_id: this.currentUserId,
                    exception_date: startDate,
                    exception_type: exceptionType,
                    description: exceptionDescription,
                    working_hours: exceptionHours
                };
                
                console.log(`[${requestId}] Création exception unique pour ${startDate}`);
                
                // Créer une nouvelle exception
                const response = await this.apiService.request(
                    `/calendar/users/${this.currentUserId}/exceptions`, 
                    {
                        method: 'POST',
                        body: JSON.stringify(exceptionData)
                    }
                );
                
                console.log(`[${requestId}] Exception créée:`, response.id);
                
                // Ajouter la nouvelle exception au tableau local
                this.exceptions.push(response);
                
                showToast('Exception ajoutée avec succès', 'success');
            }

            // Fermer le modal UNIQUEMENT si l'opération a réussi
            if (this.modalInstance) {
                console.log(`[${requestId}] Fermeture du modal après succès`);
                // Marquer que la fermeture est intentionnelle pour éviter les conflits
                this.modalInstance._isClosingAfterSuccess = true;
                this.modalInstance.hide();
            }

            // Mettre à jour l'affichage
            this.renderExceptionsTable();
            
            // Nettoyer les indicateurs de suppression récente
            localStorage.removeItem('calendarJustDeletedException');
            localStorage.removeItem('calendarDeletionDate');
            this._justDeletedException = false;
            
            console.log(`[${requestId}] Opération terminée avec succès`);
            this.hideLoading();
        } catch (error) {
            console.error(`[${requestId}] Erreur:`, error);
            showToast(`Erreur: ${error.message}`, 'error');
            this.hideLoading();
            throw error;
        } finally {
            // Toujours libérer TOUS les verrous
            console.log(`[${requestId}] Libération des verrous`);
            this.savingException = false;
            window._globalExceptionLock = false;
            window._globalExceptionLockTime = null;
            this.hideLoading();
            
            // Nettoyer la signature de requête après un délai plus court
            setTimeout(() => {
                localStorage.removeItem('lastExceptionRequestSignature');
                localStorage.removeItem('lastExceptionRequestTime');
            }, 2000);
        }
    }

    /**
     * Calcule la date de fin prévue en fonction de la date de début, du nombre d'heures et des exceptions de calendrier
     * @param {string} startDate - Date de début au format YYYY-MM-DD
     * @param {number} hours - Nombre d'heures estimées
     * @param {number} userId - ID de l'utilisateur (pour prendre en compte son calendrier)
     * @returns {string} - Date de fin calculée au format YYYY-MM-DD
     */
    calculateEndDate(startDate, hours, userId = null) {
        // Si la date ou les heures ne sont pas spécifiées, retourner null
        if (!startDate || !hours) return null;
        
        // Convertir les paramètres au bon format
        const startDateObj = new Date(startDate);
        hours = parseFloat(hours);
        userId = userId ? parseInt(userId) : this.currentUserId;
        
        if (isNaN(startDateObj.getTime()) || isNaN(hours) || hours <= 0) return null;
        
        // Date de début (cloner pour ne pas modifier l'original)
        let currentDate = new Date(startDateObj);
        // Heures restantes à planifier
        let remainingHours = hours;
        // Nombre de jours à ajouter
        let daysToAdd = 0;
        
        // Récupérer l'horaire de l'utilisateur (ou utiliser un horaire par défaut)
        const userSchedule = this.schedule.length > 0 ? this.schedule : [
            {day: 0, working: true, hours: 8},  // Lundi
            {day: 1, working: true, hours: 8},  // Mardi
            {day: 2, working: true, hours: 8},  // Mercredi
            {day: 3, working: true, hours: 8},  // Jeudi
            {day: 4, working: true, hours: 8},  // Vendredi
            {day: 5, working: false, hours: 0}, // Samedi
            {day: 6, working: false, hours: 0}  // Dimanche
        ];
        
        // Boucler jusqu'à ce que toutes les heures soient planifiées
        while (remainingHours > 0) {
            // Obtenir le jour de la semaine (0 = Lundi, 6 = Dimanche dans notre système)
            const dayOfWeek = (currentDate.getDay() + 6) % 7; // Convertir dimanche=0 en dimanche=6
            
            // Vérifier si c'est un jour travaillé selon l'horaire
            const daySchedule = userSchedule.find(d => d.day === dayOfWeek);
            const isWorkingDay = daySchedule && daySchedule.working;
            const workingHoursForDay = isWorkingDay ? daySchedule.hours : 0;
            
            // Vérifier s'il y a une exception pour ce jour
            const dateString = currentDate.toISOString().split('T')[0];
            const exceptionForDay = this.exceptions.find(e => e.exception_date === dateString);
            
            // Si c'est un jour normal de travail sans exception
            if (isWorkingDay && !exceptionForDay) {
                // Si les heures restantes sont inférieures aux heures de travail disponibles pour la journée
                if (remainingHours <= workingHoursForDay) {
                    // On a fini
                    remainingHours = 0;
                } else {
                    // On travaille toute la journée et on continue le jour suivant
                    remainingHours -= workingHoursForDay;
                }
            } 
            // Si c'est un jour avec une exception mais des heures de travail sont définies
            else if (exceptionForDay && exceptionForDay.working_hours > 0) {
                // Si les heures restantes sont inférieures aux heures disponibles pour la journée
                if (remainingHours <= exceptionForDay.working_hours) {
                    // On a fini
                    remainingHours = 0;
                } else {
                    // On travaille selon les heures définies dans l'exception
                    remainingHours -= exceptionForDay.working_hours;
                }
            }
            
            // Si on n'a pas fini, passer au jour suivant
            if (remainingHours > 0) {
                daysToAdd++;
                currentDate.setDate(currentDate.getDate() + 1);
            }
        }
        
        // Calculer la date de fin en ajoutant le nombre de jours nécessaires
        const endDate = new Date(startDateObj);
        endDate.setDate(endDate.getDate() + daysToAdd);
        
        // Retourner la date au format YYYY-MM-DD
        return endDate.toISOString().split('T')[0];
    }
    
    /**
     * Supprime un groupe d'exceptions
     * @param {Array<string>} exceptionIds - IDs des exceptions à supprimer
     */
    async deleteExceptionGroup(exceptionIds) {
        if (!Array.isArray(exceptionIds) || exceptionIds.length === 0) return;

        if (!confirm(`Êtes-vous sûr de vouloir supprimer ce groupe de ${exceptionIds.length} exceptions ? Cette action est irréversible.`)) {
            return;
        }

        if (this.deletingException) {
            console.warn('[CalendarManager] Une suppression d\'exception est déjà en cours - Requête ignorée');
            return;
        }

        this.deletingException = true;
        this.showLoading();

        try {
            const deletePromises = exceptionIds.map(id =>
                this.apiService.request(
                    `/calendar/users/${this.currentUserId}/exceptions/${id}`,
                    { method: 'DELETE' }
                )
            );

            const results = await Promise.allSettled(deletePromises);

            let successCount = 0;
            results.forEach(result => {
                if (result.status === 'fulfilled') {
                    successCount++;
                } else {
                    console.error('Erreur lors de la suppression d\'une exception du groupe:', result.reason);
                }
            });

            if (successCount > 0) {
                showToast(`${successCount} sur ${exceptionIds.length} exception(s) supprimée(s) avec succès.`, 'success');
            } else {
                showToast('Échec de la suppression du groupe d\'exceptions.', 'error');
            }

            // Rafraîchir les données depuis le serveur pour garantir la cohérence
            await this.loadUserData();
            this.renderExceptionsTable();

        } catch (error) {
            console.error('Erreur lors de la suppression du groupe d\'exceptions:', error);
            showToast('Erreur lors de la suppression du groupe d\'exceptions.', 'error');
        } finally {
            this.deletingException = false;
            this.hideLoading();
        }
    }

    /**
     * Supprime une exception
     * @param {string} exceptionId - ID de l'exception à supprimer
     */
    async deleteException(exceptionId) {
        if (!confirm('Êtes-vous sûr de vouloir supprimer cette exception ?')) {
            return;
        }
        
        // Vérifier si une suppression est déjà en cours
        if (this.deletingException) {
            console.warn('[CalendarManager] Une suppression d\'exception est déjà en cours - Requête ignorée');
            return;
        }
        
        // Vérifier si une sauvegarde est en cours
        if (window._globalExceptionLock === true) {
            showToast('Une opération d\'enregistrement est en cours. Veuillez attendre.', 'warning');
            return;
        }
        
        // Activer le verrou de suppression
        this.deletingException = true;
        console.log('[DEBUG] Verrou de suppression activé');

        try {
            this.showLoading();
            
            // Récupérer l'exception pour avoir les détails avant suppression
            const exceptionToDelete = this.exceptions.find(e => e.id == exceptionId);
            console.log(`[DEBUG] Tentative de suppression de l'exception ${exceptionId} pour la date ${exceptionToDelete?.exception_date}`);

            // Supprimer l'exception via l'API
            await this.apiService.request(
                `/calendar/users/${this.currentUserId}/exceptions/${exceptionId}`, 
                { method: 'DELETE' }
            );
            console.log(`[DEBUG] Requête DELETE réussie pour l'exception ${exceptionId}`);

            // Marquer qu'une exception a été supprimée récemment avec timestamp précis
            this._justDeletedException = true;
            const deletionTimestamp = new Date().toISOString();
            localStorage.setItem('calendarJustDeletedException', 'true');
            localStorage.setItem('calendarDeletionDate', deletionTimestamp);
            
            console.log(`[DEBUG] Exception supprimée, drapeau _justDeletedException activé (${deletionTimestamp})`);
            
            // Suppression locale et mise à jour de l'UI
            this.exceptions = this.exceptions.filter(e => e.id != exceptionId);
            
            // Afficher un message de succès
            showToast('Exception supprimée avec succès', 'success');
            this.hideLoading();
            
            // Mettre à jour l'affichage
            this.renderExceptionsTable();
            
        } catch (error) {
            console.error('Erreur lors de la suppression de l\'exception:', error);
            showToast(`Erreur lors de la suppression de l'exception: ${error.message}`, 'error');
            this.hideLoading();
        } finally {
            // Libérer le verrou dans tous les cas
            this.deletingException = false;
            console.log('[DEBUG] Verrou de suppression désactivé');
        }
    }

    /**
     * Génère une plage de dates entre deux dates (incluses)
     * @param {string} startDate - Date de début au format YYYY-MM-DD
     * @param {string} endDate - Date de fin au format YYYY-MM-DD
     * @returns {Array<string>} - Tableau de dates au format YYYY-MM-DD
     */
    generateDateRange(startDate, endDate) {
        const result = [];
        
        // Convertir en objets Date
        const start = new Date(startDate);
        const end = new Date(endDate);
        
        // Cloner la date de début pour itérer
        const current = new Date(start);
        
        // Tant qu'on n'a pas dépassé la date de fin
        while (current <= end) {
            // Ajouter la date courante au format YYYY-MM-DD
            result.push(current.toISOString().split('T')[0]);
            
            // Passer au jour suivant
            current.setDate(current.getDate() + 1);
        }
        
        return result;
    }
    
    /**
     * Formate une date au format français (DD/MM/YYYY)
     * @param {string} dateStr - Date au format YYYY-MM-DD
     * @returns {string} - Date au format DD/MM/YYYY
     */
    formatDateFr(dateStr) {
        if (!dateStr) return '';
        
        const parts = dateStr.split('-');
        if (parts.length !== 3) return dateStr;
        
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }

    /**
     * Affiche un indicateur de chargement
     */
    showLoading() {
        let loadingOverlay = this.container.querySelector('.loading-overlay');
        if (!loadingOverlay) {
            loadingOverlay = document.createElement('div');
            loadingOverlay.className = 'loading-overlay';
            loadingOverlay.innerHTML = `
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Chargement...</span>
                </div>
            `;
            this.container.appendChild(loadingOverlay);
        } else {
            loadingOverlay.style.display = 'flex';
        }
    }

    /**
     * Cache l'indicateur de chargement
     */
    hideLoading() {
        const loadingOverlay = this.container.querySelector('.loading-overlay');
        if (loadingOverlay) {
            loadingOverlay.style.display = 'none';
        }
    }

    /**
     * Nettoie les ressources lors de la destruction
     */
    destroy() {
        console.log(`[CalendarManager ${this.instanceId}] Destruction de l\'instance`);
        
        // Nettoyer l'instance du modal Bootstrap
        if (this.modalInstance) {
            console.log('[CalendarManager] Nettoyage de l\'instance modal');
            try {
                this.modalInstance.hide();
                this.modalInstance.dispose();
            } catch (error) {
                console.warn('[CalendarManager] Erreur lors du nettoyage modal:', error);
            }
            this.modalInstance = null;
        }
        
        // Supprimer le modal HTML du DOM s'il existe
        const existingModal = document.getElementById('exceptionModal');
        if (existingModal) {
            console.log('[CalendarManager] Suppression du modal HTML du DOM');
            existingModal.remove();
        }
        
        // Nettoyer complètement l'état Bootstrap
        this.cleanupBodyBootstrapState();
        
        // Réinitialiser TOUS les flags et verrous d'instance
        this.deletingException = false;
        this.savingException = false;
        this._justDeletedException = false;
        
        // S'assurer que les verrous globaux sont libérés si cette instance les possédait
        if (window._globalExceptionLock === true) {
            console.log('[CalendarManager] Libération forcée du verrou global lors de la destruction');
            window._globalExceptionLock = false;
            window._globalExceptionLockTime = null;
        }
        
        // Nettoyer les event listeners
        this.cleanupEventListeners();
        
        // Si c'est l'instance globale, la supprimer
        if (window.calendarManagerInstance === this) {
            console.log('[CalendarManager] Suppression de la référence globale');
            window.calendarManagerInstance = null;
        }
        
        console.log(`[CalendarManager ${this.instanceId}] Destruction terminée`);
    }

    /**
     * Récupère les heures normales de travail pour un utilisateur un jour donné
     * @param {number} userId - ID de l'utilisateur
     * @param {string} date - Date au format YYYY-MM-DD
     * @returns {number} - Nombre d'heures normales pour ce jour
     */
    getUserNormalHoursForDate(userId, date) {
        if (!date) return 8; // Par défaut 8h
        
        // Convertir la date en jour de la semaine (0=Lundi, 6=Dimanche)
        const dateObj = new Date(date);
        const dayOfWeek = (dateObj.getDay() + 6) % 7;
        
        // Chercher dans l'horaire de l'utilisateur
        const daySchedule = this.schedule.find(s => s.day_of_week === dayOfWeek);
        
        if (daySchedule && daySchedule.is_working_day) {
            return daySchedule.working_hours || 8;
        }
        
        // Si pas d'horaire défini, utiliser les valeurs par défaut
        return dayOfWeek < 5 ? 8 : 0; // 8h lun-ven, 0h weekend
    }

}

// Exporter la classe pour l'utiliser ailleurs
if (typeof module !== 'undefined') {
    module.exports = CalendarManager;
}
