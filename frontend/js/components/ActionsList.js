/**
 * ActionsList Component
 * Excel-like interface for managing maintenance actions
 */

class ActionsList {
    constructor(container) {
        this.container = container;
        this.authManager = new AuthManager();
        this.apiService = new ApiService();
        this.actions = [];
        this.filteredActions = [];
        this.selectedRows = new Set();
        this.sortConfig = { key: null, direction: 'asc' };
        this.filters = {
            status: null,
            machine_id: null,
            type_id: null,
            assigned_to: null
        };
        this.searchTerm = '';
        this.editingCell = null;
        this.columnWidths = this.getDefaultColumnWidths();
        this.isResizing = false;
        this.currentResizeColumn = null;
        this.startResizeX = 0;
        this.startResizeWidth = 0;
        this.assignableUsers = []; // Liste des utilisateurs assignables
        this.locations = []; // Liste des lieux disponibles
        this.actionToMove = null; // Pour la nouvelle fonctionnalité de déplacement
        
        this.columnVisibility = this.loadColumnVisibility();
        this.rowFilters = this.loadRowFilters();
        
        // Récupération du rôle utilisateur courant pour les restrictions
        const user = this.authManager.getUser();
        this.userRole = user && user.role ? user.role : 'observer';
        console.log('[ActionsList] Rôle utilisateur détecté:', this.userRole);
        
        this.initEventListeners();
        // Charger immédiatement les utilisateurs et les lieux
        this.loadAssignableUsers();
        this.loadLocations();
        
        // S'assurer que les restrictions de rôle sont appliquées à chaque chargement
        document.addEventListener('DOMContentLoaded', () => {
            this.enforceRoleRestrictions();
        });
        
        // Aussi après un rechargement de page (F5)
        window.addEventListener('load', () => {
            this.enforceRoleRestrictions();
        });
    }
    
    /**
     * Initializes the component, loads data, and renders the table.
     */
    async init() {
        this.showLoading();
        await Promise.all([
            this.loadAssignableUsers(),
            this.loadLocations()
        ]);
        await this.loadActions();
        this.hideLoading();
    }
    
    /**
     * Get default column widths
     * @returns {Object} - Column width configurations
     */
    getDefaultColumnWidths() {
        // Try to load saved column widths first
        const savedWidths = this.loadColumnWidths();
        if (savedWidths) {
            return savedWidths;
        }
        
        // Otherwise return default widths
        return {
            'select': '40px',
            'number': '80px',
            'quick_actions': '80px',
            'photos': '80px', 
            'location': '140px',
            'title': '200px',
            'comments': '150px',
            'assigned_user': '120px',
            'resource_needs': '120px',
            'budget_initial': '100px',
            'actual_cost': '100px',
            'priority': '80px',
            'estimated_duration': '120px',
            'planned_date': '110px',
            'check_status': '80px',
            'predicted_end_date': '110px',
            'final_status': '100px',
            'completion_date': '110px'
        };
    }
    
    /**
     * Save column widths to localStorage
     */
    saveColumnWidths() {
        try {
            localStorage.setItem('gmao_column_widths', JSON.stringify(this.columnWidths));
            console.log('[ActionsList] Column widths saved to localStorage');
        } catch (error) {
            console.error('[ActionsList] Error saving column widths:', error);
        }
    }
    
    /**
     * Load column widths from localStorage
     * @returns {Object|null} - Saved column widths or null if not found
     */
    loadColumnWidths() {
        try {
            const savedWidths = localStorage.getItem('gmao_column_widths');
            if (savedWidths) {
                return JSON.parse(savedWidths);
            }
        } catch (error) {
            console.error('[ActionsList] Error loading column widths:', error);
        }
        return null;
    }
    
    /**
     * Fit columns to container width automatically
     */
    fitColumnsToContainer() {
        const table = document.querySelector('.excel-table');
        const container = document.querySelector('.excel-container');
        if (!table || !container) return;
        
        const containerWidth = container.clientWidth;
        const tableWidth = table.offsetWidth;
        const headers = document.querySelectorAll('.excel-header-cell');
        
        // If table is narrower than container, expand columns proportionally
        if (tableWidth < containerWidth) {
            const ratio = containerWidth / tableWidth;
            
            headers.forEach(header => {
                const field = header.dataset.field;
                if (!field) return;
                
                // Get current width without 'px'
                const currentWidth = this.columnWidths[field];
                if (!currentWidth) return;
                
                const numericWidth = parseInt(currentWidth);
                const newWidth = Math.floor(numericWidth * ratio);
                
                this.columnWidths[field] = newWidth + 'px';
            });
            
            this.saveColumnWidths();
            this.applyColumnWidths();
            
            showToast('Les colonnes ont été ajustées automatiquement', 'success');
        }
    }
    
    /**
     * Apply column widths to the table headers and cells
     */
    applyColumnWidths() {
        const headers = document.querySelectorAll('.excel-header-cell');
        
        headers.forEach(header => {
            const field = header.dataset.field;
            if (field && this.columnWidths[field]) {
            header.style.width = this.columnWidths[field];
                header.style.minWidth = this.columnWidths[field];
            
            const columnIndex = Array.from(header.parentNode.children).indexOf(header);
                if (columnIndex > -1) {
                    const cells = document.querySelectorAll(`.excel-table tr > td:nth-child(${columnIndex + 1})`);
                    cells.forEach(cell => {
                cell.style.width = this.columnWidths[field];
            });
                }
            }
        });
    }
    
    /**
     * Start column resize
     * @param {Event} e - Mouse event
     * @param {string} field - Column field name
     */
    startColumnResize(e, field) {
        if (!field) return;
        
        e.preventDefault(); // Prevent text selection
        
        this.isResizing = true;
        this.currentResizeColumn = field;
        this.startResizeX = e.clientX;
        
        const currentWidth = this.columnWidths[field];
        this.startResizeWidth = parseInt(currentWidth);
        
        // Bind functions once to allow for proper removal
        this.boundHandleColumnResize = this.handleColumnResize.bind(this);
        this.boundStopColumnResize = this.stopColumnResize.bind(this);
        
        document.addEventListener('mousemove', this.boundHandleColumnResize);
        document.addEventListener('mouseup', this.boundStopColumnResize);
        
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    }
    
    /**
     * Handle column resize
     * @param {Event} e - Mouse event
     */
    handleColumnResize(e) {
        if (!this.isResizing) return;
        
        // Calculate width change
        const deltaX = e.clientX - this.startResizeX;
        let newWidth = Math.max(50, this.startResizeWidth + deltaX); // Minimum width of 50px
        
        // Update column width
        this.columnWidths[this.currentResizeColumn] = newWidth + 'px';
        
        // Apply to DOM
        this.applyColumnWidths();
    }
    
    /**
     * Stop column resize
     */
    stopColumnResize() {
        if (!this.isResizing) return;
        
        this.isResizing = false;
        
        this.saveColumnWidths();
        
        // Remove the bound listeners
        document.removeEventListener('mousemove', this.boundHandleColumnResize);
        document.removeEventListener('mouseup', this.boundStopColumnResize);
        
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    }
    
    /**
     * Initialize event listeners
     */
    initEventListeners() {
        // Global events for keyboard navigation
        document.addEventListener('keydown', this.handleKeyDown.bind(this));

        // Event delegation for action buttons (edit, delete, move, photo)
        this.container.addEventListener('click', (e) => {
            const button = e.target.closest('button');
            if (!button) return;

            // Robust: read the ID directly from the clicked button.
            const actionId = parseInt(button.dataset.actionId);
            if (!actionId) return;

            if (button.classList.contains('action-edit-btn')) {
                this.editAction(actionId);
            } else if (button.classList.contains('action-delete-btn')) {
                this.deleteAction(actionId);
            } else if (button.classList.contains('action-move-btn')) {
                this.selectActionForMove(actionId);
            } else if (button.classList.contains('photo-btn')) {
                this.showPhotos(actionId);
            }
        });

        // Event listeners for new filter menus
        this.container.addEventListener('change', (e) => {
            if (e.target.classList.contains('filter-checkbox')) {
                this.handleStatusFilterChange(e);
            } else if (e.target.id === 'filterAssignedTo') {
                this.handleAssignedToFilterChange(e);
            }
        });

        this.container.addEventListener('click', (e) => {
            if (e.target.closest('.column-visibility-toggle')) {
                this.handleColumnVisibilityChange(e);
            }
        });

        // Setup column width resizing
        const widthResizers = this.container.querySelectorAll('.column-resizer');
        widthResizers.forEach(resizer => {
            resizer.addEventListener('mousedown', (e) => {
                const field = e.target.dataset.field;
                this.startColumnResize(e, field);
            });
        });
        
        // Setup editable cells
        this.container.querySelectorAll('.editable-cell').forEach(cell => {
            cell.addEventListener('dblclick', () => this.editCell(cell));
        });
        
        // Gestionnaire pour la case à cocher "Sélectionner tout"
        const selectAllCheckbox = this.container.querySelector('#selectAllCheckbox');
        if (selectAllCheckbox) {
            if (this.userRole === 'pilot' || this.userRole === 'observer') {
                selectAllCheckbox.disabled = true;
                selectAllCheckbox.title = "Les pilotes ne sont pas autorisés à sélectionner des actions";
            }

            selectAllCheckbox.addEventListener('change', (e) => {
                this.toggleSelectAll(e.target.checked);
            });
        }
        
        // Gestionnaires pour les cases à cocher individuelles
        this.container.querySelectorAll('.action-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const actionId = parseInt(e.target.dataset.actionId);
                this.toggleRowSelection(actionId);
            });
        });
        this.container.querySelectorAll('.dropdown-menu').forEach(menu => {
            menu.addEventListener('click', (e) => e.stopPropagation());
        });
    }
    
    /**
     * Load actions from the server
     * @param {Object} filters - Optional filters
     */
    async loadActions(filters = {}) {
        try {
            this.showLoading();
            
            const user = this.authManager.getUser();
            const userRole = user ? user.role : 'observer';

            // Force filter for pilots
            if (userRole === 'pilot') {
                this.rowFilters.assigned_to = user.id;
            }
            
            // Fusionner les filtres
            const mergedFilters = { ...this.rowFilters, ...filters };
            
            // Nettoyer les filtres pour éviter les valeurs null ou undefined
            const cleanedFilters = {};
            for (const [key, value] of Object.entries(mergedFilters)) {
                // Ignore empty or undefined strings for filters that expect other types
                if (key === 'assigned_to' && (value === '' || value === undefined)) continue;

                if (value !== null && value !== undefined) {
                    cleanedFilters[key] = value;
                }
            }
            
            console.log('[ActionsList] Filtres nettoyés avant appel API:', cleanedFilters);
            const actions = await this.apiService.getActions(cleanedFilters);
            this.actions = actions || [];
            this.applyFiltersAndSort();
            this.render();
        } catch (error) {
            console.error('Error loading actions:', error);
            showToast('Erreur lors du chargement des actions', 'error');
            this.actions = [];
            this.filteredActions = [];
            this.render();
        } finally {
            this.hideLoading();
        }
    }
    
    /**
     * Charge la liste des utilisateurs assignables depuis l'API
     */
    async loadAssignableUsers() {
        try {
            console.log("[ActionsList] Chargement des utilisateurs assignables via l'API...");
            this.assignableUsers = await this.apiService.getAssignableUsers();
            console.log(`[ActionsList] ${this.assignableUsers.length} utilisateurs chargés:`, this.assignableUsers);
            
            // Si le tableau est déjà affiché, rafraîchir le rendu pour mettre à jour les sélecteurs
            if (this.actions.length > 0) {
                this.renderTable();
            }
        } catch (error) {
            console.error('[ActionsList] Erreur lors du chargement des utilisateurs:', error);
            this.assignableUsers = []; // Réinitialiser en cas d'erreur
        }
    }
    
    /**
     * Charge la liste des lieux depuis la configuration
     */
    async loadLocations() {
        try {
            // Vérifier si configManager est disponible
            if (window.configManager && window.configManager.configuration && window.configManager.configuration.lieux) {
                console.log('[ActionsList] Chargement des lieux depuis ConfigManager');
                this.locations = window.configManager.configuration.lieux;
            } else {
                // Sinon, récupérer directement la configuration via l'API
                console.log('[ActionsList] ConfigManager non disponible, chargement des lieux via API...');
                const config = await this.apiService.getConfiguration();
                if (config && config.lieux) {
                    this.locations = config.lieux;
                } else {
                    // Utiliser des valeurs par défaut si tout échoue
                    console.warn('[ActionsList] Impossible de récupérer les lieux, utilisation des valeurs par défaut');
                    this.locations = ['Luxe', 'Forge', 'Ancien Luxe', 'Parking'];
                }
            }
            console.log(`[ActionsList] ${this.locations.length} lieux chargés:`, this.locations);
            
            // Si le tableau est déjà affiché, rafraîchir le rendu pour mettre à jour les sélecteurs de lieux
            if (this.actions.length > 0) {
                this.renderTable();
            }
        } catch (error) {
            console.error('[ActionsList] Erreur lors du chargement des lieux:', error);
            // Utiliser des valeurs par défaut en cas d'erreur
            this.locations = ['Luxe', 'Forge', 'Ancien Luxe', 'Parking'];
        }
    }
    
    /**
     * Génère les options HTML pour un sélecteur d'utilisateurs
     * @param {Object} assignedUser - L'utilisateur actuellement assigné à l'action
     * @returns {string} - Code HTML des options pour le sélecteur
     */
    generateAssignableUsersOptionsHtml(assignedUser) {
        let optionsHtml = '<option value="">Non assigné</option>';
        
        const assignedId = assignedUser ? assignedUser.id : null;
        
        if (this.assignableUsers && this.assignableUsers.length > 0) {
            this.assignableUsers.forEach(user => {
                if (user.is_active) {
                    const isSelected = assignedId && assignedId === user.id ? 'selected' : '';
                    optionsHtml += `<option value="${user.id}" ${isSelected}>${user.username} [ID:${user.id}]</option>`;
                }
            });
        } else {
            console.warn('[ActionsList] Aucun utilisateur disponible pour le sélecteur');
        }
        
        return optionsHtml;
    }
    
    /**
     * Génère les options HTML pour un sélecteur de lieux
     * @param {string} currentLocation - Le lieu actuellement sélectionné pour l'action
     * @returns {string} - Code HTML des options pour le sélecteur
     */
    generateLocationOptionsHtml(currentLocation) {
        let optionsHtml = '<option value="">Sélectionner...</option>';
        
        // Vérifier si nous avons chargé des lieux depuis la configuration
        if (this.locations && this.locations.length > 0) {
            // Générer les options à partir des lieux chargés
            this.locations.forEach(lieu => {
                const isSelected = currentLocation === lieu ? 'selected' : '';
                optionsHtml += `<option value="${lieu}" ${isSelected}>${lieu}</option>`;
            });
        } else {
            // Message d'alerte en cas d'absence de lieux
            console.warn('[ActionsList] Aucun lieu disponible pour le sélecteur');
        }
        
        return optionsHtml;
    }
    
    /**
     * Toggle selection of a single row
     * @param {number} actionId - Action ID to toggle selection
     */
    toggleRowSelection(actionId) {
        if (this.selectedRows.has(actionId)) {
            this.selectedRows.delete(actionId);
        } else {
            this.selectedRows.add(actionId);
        }
        
        // Update UI to reflect selection state
        const row = document.querySelector(`tr[data-action-id="${actionId}"]`);
        if (row) {
            if (this.selectedRows.has(actionId)) {
                row.classList.add('selected-row');
                // Mettre à jour la case à cocher
                const checkbox = row.querySelector('.action-checkbox');
                if (checkbox) checkbox.checked = true;
            } else {
                row.classList.remove('selected-row');
                // Mettre à jour la case à cocher
                const checkbox = row.querySelector('.action-checkbox');
                if (checkbox) checkbox.checked = false;
            }
        }
        
        // Update toolbar
        this.updateSelectionToolbar();
    }
    
    /**
     * Toggle selection of all rows
     * @param {boolean} checked - Whether to select or deselect all
     */
    toggleSelectAll(checked) {
        if (checked) {
            // Select all visible actions
            this.filteredActions.forEach(action => {
                this.selectedRows.add(action.id);
            });
        } else {
            // Deselect all
            this.selectedRows.clear();
        }
        
        // Update UI
        this.render();
        this.updateSelectionToolbar();
    }
    
    /**
     * Show loading indicator
     */
    showLoading() {
        // Create loading overlay if it doesn't exist
        let loadingOverlay = document.getElementById('actionsLoadingOverlay');
        if (!loadingOverlay) {
            loadingOverlay = document.createElement('div');
            loadingOverlay.id = 'actionsLoadingOverlay';
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
     * Hide loading indicator
     */
    hideLoading() {
        const loadingOverlay = document.getElementById('actionsLoadingOverlay');
        if (loadingOverlay) {
            loadingOverlay.style.display = 'none';
        }
    }
    
    /**
     * Apply filters and sorting to actions
     */
    applyFiltersAndSort() {
        // Apply status and assignment filters first
        this.filteredActions = this.actions.filter(action => {
            // Status filter
            const isCompleted = action.final_status === 'OK';
            const isTbd = action.priority === 4;
            const isInProgress = !isCompleted && !isTbd;

            if (!this.rowFilters.status.completed && isCompleted) return false;
            if (!this.rowFilters.status.in_progress && isInProgress) return false;
            if (!this.rowFilters.status.tbd && isTbd) return false;

            // Assigned_to filter
            if (this.rowFilters.assigned_to && action.assigned_to != this.rowFilters.assigned_to) {
                return false;
            }

            // Apply search term filter
            if (this.searchTerm) {
                const searchLower = this.searchTerm.toLowerCase();
                const matchesSearch = 
                    (action.title && action.title.toLowerCase().includes(searchLower)) ||
                    (action.location && action.location.name && action.location.name.toLowerCase().includes(searchLower)) ||
                    (action.comments && action.comments.toLowerCase().includes(searchLower)) ||
                    (action.assigned_user && action.assigned_user.username && action.assigned_user.username.toLowerCase().includes(searchLower)) ||
                    (action.resource_needs && action.resource_needs.toLowerCase().includes(searchLower));
                
                if (!matchesSearch) return false;
            }
            
            // Apply other filters
            for (const key in this.filters) {
                if (this.filters[key] && action[key] !== this.filters[key]) {
                    return false;
                }
            }
            
            return true;
        });
        
        // Apply sorting
        if (this.sortConfig.key) {
            this.filteredActions.sort((a, b) => {
                const aValue = this.getSortValue(a, this.sortConfig.key);
                const bValue = this.getSortValue(b, this.sortConfig.key);

                const isANull = aValue === null || aValue === undefined || aValue === '';
                const isBNull = bValue === null || bValue === undefined || bValue === '';

                if (isANull && isBNull) return 0;
                if (isANull) return 1; // nulls to bottom
                if (isBNull) return -1; // nulls to bottom
                
                let result = 0;
                
                // Prioritize specific keys for numeric sort
                const numericKeys = ['number', 'budget_initial', 'actual_cost', 'priority', 'estimated_duration', 'photo_count'];
                if (numericKeys.includes(this.sortConfig.key)) {
                    result = parseFloat(aValue) - parseFloat(bValue);
                } else if (this.sortConfig.key.includes('date')) {
                    // Date comparison
                    result = new Date(aValue) - new Date(bValue);
                } else {
                // String comparison
                    result = String(aValue).localeCompare(String(bValue), 'fr', { sensitivity: 'base' });
                }

                return this.sortConfig.direction === 'asc' ? result : -result;
            });
        }
        
        this.render(); // Re-render the table with the filtered and sorted actions
    }
    
    /**
     * Render the table header
     * @returns {string} - Header HTML
     */
    renderTableHeader() {
        const columns = [
            { key: 'select', label: '', sortable: false },
            { key: 'number', label: 'N°', sortable: true },
            { key: 'quick_actions', label: 'Actions', sortable: false },
            { key: 'photos', label: '📷', sortable: true, dataKey: 'photo_count' },
            { key: 'location', label: '📍 Lieu', sortable: true },
            { key: 'title', label: '⚙️ Action', sortable: true },
            { key: 'comments', label: '💬 Commentaires', sortable: false },
            { key: 'assigned_user', label: '👤 Assigné à', sortable: true },
            { key: 'resource_needs', label: '🔧 Besoin Ressource', sortable: false },
            { key: 'budget_initial', label: '💰 Budget', sortable: true },
            { key: 'actual_cost', label: '💸 Coût total', sortable: true },
            { key: 'priority', label: '🎯 Priorité', sortable: true },
            { key: 'estimated_duration', label: '⏱️ Temps réalisation', sortable: true },
            { key: 'planned_date', label: '📅 Date planifiée', sortable: true },
            { key: 'check_status', label: '✓ Check', sortable: true },
            { key: 'predicted_end_date', label: '🎯 Date fin prévue', sortable: true },
            { key: 'final_status', label: '📊 Statut final', sortable: true },
            { key: 'completion_date', label: '✅ Date réalisation', sortable: true }
        ];

        this.columns = columns; // Store for other methods
        
        return `
            <tr class="table-primary excel-header">
                ${columns.map((col, index) => {
                    const sortKey = col.dataKey || col.key;
                    const width = this.columnWidths[col.key] || this.getDefaultColumnWidths()[col.key];
                    return `
                        <th class="excel-header-cell ${col.sortable ? 'sortable-column' : ''}"
                            data-field="${col.key}"
                            style="width: ${width}; position: relative;">
                            <div class="header-cell-content" ${col.sortable ? `onclick="actionsList.sort('${sortKey}')"` : ''}>
                            <span class="column-letter">${this.getExcelColumnLetter(index)}</span>
                            <span class="column-title">${col.label}</span>
                            ${col.sortable ? `
                                <span class="sort-indicator">
                                    ${this.sortConfig.key === sortKey 
                                        ? (this.sortConfig.direction === 'asc' ? '▲' : '▼') 
                                        : '▲▼'}
                                </span>
                            ` : ''}
                            ${col.key === 'select' ? `
                                <input type="checkbox" class="form-check-input" id="selectAllCheckbox" 
                                       ${this.userRole === 'pilot' || this.userRole === 'observer' ? 'disabled="disabled" title="Les pilotes ne sont pas autorisés à sélectionner des actions"' : ''}>
                            ` : ''}
                        </div>
                            <div class="column-resizer" data-field="${col.key}"></div>
                    </th>
                    `;
                }).join('')}
            </tr>
        `;
    }
    
    /**
     * Render the complete table
     */
    render() {
        // Vérifier et appliquer les restrictions de rôle à chaque rendu
        setTimeout(() => this.enforceRoleRestrictions(), 100);
        const tableHTML = `
            <div class="excel-toolbar mb-3">
                <div class="row align-items-center">
                    <div class="col-md-6">
                        <div class="input-group">
                            <input type="text" class="form-control" placeholder="Rechercher..." 
                                   id="searchInput" value="${this.searchTerm}">
                            <button class="btn btn-outline-secondary" type="button" 
                                    onclick="actionsList.search(document.getElementById('searchInput').value)">
                                <i class="bi bi-search"></i>
                            </button>
                            <button class="btn btn-outline-secondary" type="button" 
                                    title="Réinitialiser la recherche"
                                    onclick="actionsList.resetSearch()">
                                <i class="bi bi-x-lg"></i>
                            </button>
                        </div>
                    </div>
                    <div class="col-md-6 text-end">
                        <div class="btn-group">
                            <button class="btn btn-outline-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown" data-bs-auto-close="outside" aria-expanded="false">
                                <i class="bi bi-filter"></i> Filtrer
                            </button>
                            <ul class="dropdown-menu dropdown-menu-end p-3" style="width: 300px;" onclick="event.stopPropagation()">
                                <h6>Statut</h6>
                                <div class="form-check">
                                    <input class="form-check-input filter-checkbox" type="checkbox" value="tbd" id="filterTbd" checked>
                                    <label class="form-check-label" for="filterTbd">À planifier</label>
                                </div>
                                <div class="form-check">
                                    <input class="form-check-input filter-checkbox" type="checkbox" value="in_progress" id="filterInProgress" checked>
                                    <label class="form-check-label" for="filterInProgress">En cours</label>
                                </div>
                                <div class="form-check">
                                    <input class="form-check-input filter-checkbox" type="checkbox" value="completed" id="filterCompleted">
                                    <label class="form-check-label" for="filterCompleted">Terminées</label>
                                </div>
                                
                                <div id="assignedToFilterContainer">
                                    <li><hr class="dropdown-divider"></li>
                                    <h6>Assigné à</h6>
                                    <select class="form-select" id="filterAssignedTo">
                                        <option value="">Toutes les ressources</option>
                                        <!-- Options des utilisateurs seront injectées ici -->
                                    </select>
                                </div>
                            </ul>

                            <button class="btn btn-outline-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown" data-bs-auto-close="outside" aria-expanded="false">
                                <i class="bi bi-view-list"></i> Colonnes
                            </button>
                            <ul class="dropdown-menu dropdown-menu-end p-2" id="columnVisibilityMenu">
                                <!-- Options des colonnes seront injectées ici -->
                            </ul>
                        </div>
                        <div class="btn-group ms-2">
                            <button class="btn btn-primary" 
                                   onclick="${this.userRole === 'pilot' || this.userRole === 'observer' ? 'showToast(\'Les pilotes ne sont pas autorisés à créer des actions\', \'error\')' : 'actionForm.show()'}" 
                                   id="newActionBtn" 
                                   ${this.userRole === 'pilot' || this.userRole === 'observer' ? 'disabled="disabled"' : ''}>
                                <i class="bi bi-plus-lg"></i> Nouvelle action
                            </button>
                            <button class="btn btn-outline-primary dropdown-toggle" 
                                    data-bs-toggle="dropdown">
                                <i class="bi bi-three-dots"></i>
                            </button>
                            <ul class="dropdown-menu dropdown-menu-end">
                                <li><button class="dropdown-item" onclick="actionsList.exportToCSV()">
                                    <i class="bi bi-file-excel"></i> Exporter vers CSV
                                </button></li>
                                <li><button class="dropdown-item" onclick="actionsList.printList()">
                                    <i class="bi bi-printer"></i> Imprimer la liste
                                </button></li>
                                <li><hr class="dropdown-divider"></li>
                                <li><button class="dropdown-item" onclick="actionsList.resetColumnWidths()">
                                    <i class="bi bi-arrow-counterclockwise"></i> Réinitialiser les largeurs
                                </button></li>
                                <li><button class="dropdown-item" onclick="actionsList.loadActions()">
                                    <i class="bi bi-arrow-clockwise"></i> Rafraîchir
                                </button></li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="table-responsive excel-container">
                <table class="table table-bordered table-hover excel-table">
                    <thead>
                        ${this.renderTableHeader()}
                    </thead>
                    <tbody>
                        ${this.renderTableRows()}
                    </tbody>
                </table>
            </div>
            
            <div id="selectionToolbar" class="selection-toolbar ${this.selectedRows.size > 0 ? 'active' : ''}">
                <span class="selection-count">${this.selectedRows.size} action(s) sélectionnée(s)</span>
                <div class="btn-group btn-group-sm">
                    <button class="btn btn-light" onclick="actionsList.bulkUpdate('check', 'OK')">
                        <i class="bi bi-check-circle"></i> Marquer vérifiée
                    </button>
                    <button class="btn btn-light" onclick="actionsList.bulkUpdate('statut_final', 'OK')">
                        <i class="bi bi-check-square"></i> Marquer terminée
                    </button>
                    <button class="btn btn-light" onclick="actionsList.clearSelection()">
                        <i class="bi bi-x-lg"></i> Annuler sélection
                    </button>
                </div>
                <div class="btn-group">                        
                    <button class="btn btn-sm btn-outline-danger delete-actions-btn" 
                            onclick="actionsList.deleteSelectedActions()"
                            ${this.userRole === 'observer' || this.userRole === 'pilot' ? 'disabled title="' + (this.userRole === 'observer' ? 'Les observateurs' : 'Les pilotes') + ' ne peuvent pas supprimer des actions"' : ''}>
                        <i class="bi bi-trash"></i> Supprimer (<span class="selected-count">${this.selectedRows.size}</span>)
                    </button>
                </div>
            </div>
        `;
        
        this.container.innerHTML = tableHTML;
        this.setupEventListeners();
        this.populateFilterMenus();
        this.applyColumnVisibility();
        this.enforceRoleRestrictions();

        // Add event listener for Enter key on search input
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault(); // Prevent form submission
                    this.search(searchInput.value);
                }
            });
        }
    }
    
    /**
     * Render all table rows
     * @returns {string} - Rows HTML
     */
    renderTableRows() {
        if (this.filteredActions.length === 0) {
            const columnCount = this.columns ? this.columns.length : 17;
            return `
                <tr>
                    <td colspan="${columnCount}" class="text-center py-5 text-muted excel-empty-state">
                        <i class="bi bi-inbox fs-1 d-block mb-2"></i>
                        <span>Aucune action trouvée</span>
                        ${this.searchTerm || Object.keys(this.filters).some(key => this.filters[key]) ? `
                            <br><button class="btn btn-link btn-sm" onclick="actionsList.resetFilters()">
                                Effacer les filtres
                            </button>
                        ` : ''}
                    </td>
                </tr>
            `;
        }
        
        let rowsHtml = '';
        
        // Si une action est en cours de déplacement, afficher les zones de dépôt
        if (this.actionToMove) {
            // Zone de dépôt au début
            rowsHtml += this.renderDropZone(0);
        }
        
        this.filteredActions.forEach((action, index) => {
            rowsHtml += this.renderTableRow(action, index);
            
            // Ajouter une zone de dépôt après chaque ligne si en mode déplacement
            if (this.actionToMove && this.actionToMove.id !== action.id) {
                rowsHtml += this.renderDropZone(index + 1);
            }
        });

        return rowsHtml;
    }
    
    /**
     * Render a single table row
     * @param {Object} action - Action data
     * @param {number} index - Row index
     * @returns {string} - Row HTML
     */
    renderTableRow(action, index) {
        const isMoving = this.actionToMove && this.actionToMove.id === action.id;
        
        // Helper map for priority text
        const priorityMap = {
            1: '1 - Haute',
            2: '2 - Moyenne',
            3: '3 - Basse',
            4: '4 - À planifier'
        };
        const priorityText = priorityMap[action.priority] || 'Non spécifié';

        // Determine status class
        let statusClass = '';
        if (action.final_status === 'OK') {
            statusClass = 'status-completed';
        } else if (action.priority === 4) {
            statusClass = 'status-tbd';
        } else {
            statusClass = 'status-in-progress';
        }

        const isPilotOrObserver = this.userRole === 'pilot' || this.userRole === 'observer';

        const renderCell = (key, content) => {
            if (this.columnVisibility[key] === false) {
                return `<td class="column-hidden"></td>`;
            }
            return content;
        };

        return `
            <tr data-action-id="${action.id}" 
                class="${this.selectedRows.has(action.id) ? 'selected-row' : ''} ${statusClass} ${isMoving ? 'is-moving' : ''}" 
                draggable="true" 
                ondragstart="actionsList.handleDragStart(event, ${action.id})" 
                ondragover="actionsList.handleDragOver(event)" 
                ondrop="actionsList.handleDrop(event, ${action.id})" 
                ondragend="actionsList.handleDragEnd(event)">
                
                ${renderCell('select', `
                <td class="excel-cell select-cell">
                    <div class="form-check">
                        <input class="form-check-input action-checkbox" type="checkbox" 
                               data-action-id="${action.id}" 
                               ${isPilotOrObserver ? 'disabled' : ''}
                               ${this.selectedRows.has(action.id) ? 'checked' : ''}>
                    </div>
                </td>`)}
                
                ${renderCell('number', `
                <td class="excel-cell ${!isPilotOrObserver ? 'editable-cell' : ''} fw-bold text-primary" 
                    data-field="number" data-action-id="${action.id}"
                    ${!isPilotOrObserver ? `ondblclick="actionsList.editCell(this)"` : ''}>
                    <div class="cell-content">${action.number || index + 1}</div>
                </td>`)}
                
                ${renderCell('quick_actions', `
                <td class="excel-cell text-center">
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-sm btn-outline-secondary action-move-btn" data-action-id="${action.id}" title="Déplacer" ${isPilotOrObserver ? 'disabled' : ''}><i class="bi bi-arrows-move"></i></button>
                        <button class="btn btn-sm btn-outline-primary action-edit-btn" data-action-id="${action.id}" title="Modifier" ${isPilotOrObserver ? 'disabled' : ''}><i class="bi bi-pencil"></i></button>
                        <button class="btn btn-sm btn-outline-danger action-delete-btn" data-action-id="${action.id}" title="Supprimer" ${isPilotOrObserver ? 'disabled' : ''}><i class="bi bi-trash"></i></button>
                    </div>
                </td>`)}
                
                ${renderCell('photos', `
                <td class="excel-cell text-center">
                    <button class="btn btn-outline-info btn-sm photo-btn" data-action-id="${action.id}" title="Gérer les photos">
                        <i class="bi bi-camera"></i>
                        ${action.photo_count > 0 ? `<span class="badge bg-info photo-count">${action.photo_count}</span>` : ''}
                    </button>
                </td>`)}
                
                ${renderCell('location', `
                <td class="excel-cell">
                    <select class="form-select form-select-sm lieu-select" onchange="actionsList.updateField(${action.id}, 'location_id', this.value)" ${isPilotOrObserver ? 'disabled' : ''}>
                        ${this.generateLocationOptionsHtml(action.location ? action.location.name : '')}
                    </select>
                    <span class="print-only">${action.location ? action.location.name : ''}</span>
                </td>`)}
                
                ${renderCell('title', `
                <td class="excel-cell ${!isPilotOrObserver ? 'editable-cell' : ''}" data-field="title" data-action-id="${action.id}" ${!isPilotOrObserver ? `ondblclick="actionsList.editCell(this)"` : ''}>
                    <div class="cell-content" title="${action.title || ''}">${truncateText(action.title || '', 30)}</div>
                </td>`)}
                
                ${renderCell('comments', `
                <td class="excel-cell editable-cell" data-field="comments" data-action-id="${action.id}" ondblclick="actionsList.editCell(this)">
                    <div class="cell-content" title="${action.comments || ''}">${truncateText(action.comments || '', 25)}</div>
                </td>`)}
                
                ${renderCell('assigned_user', `
                <td class="excel-cell">
                    <select class="form-select form-select-sm pilote-select" onchange="actionsList.updateField(${action.id}, 'assigned_to', this.value)" ${isPilotOrObserver ? 'disabled' : ''}>
                        ${this.generateAssignableUsersOptionsHtml(action.assigned_user)}
                    </select>
                    <span class="print-only">${action.assigned_user ? action.assigned_user.username : 'Non assigné'}</span>
                </td>`)}
                
                ${renderCell('resource_needs', `
                <td class="excel-cell editable-cell" data-field="resource_needs" data-action-id="${action.id}" ondblclick="actionsList.editCell(this)">
                    <div class="cell-content" title="${action.resource_needs || ''}">${truncateText(action.resource_needs || '', 20)}</div>
                </td>`)}
                
                ${renderCell('budget_initial', `
                <td class="excel-cell ${!isPilotOrObserver ? 'editable-cell' : ''}" data-field="budget_initial" data-action-id="${action.id}" ${!isPilotOrObserver ? `ondblclick="actionsList.editCell(this)"` : ''}>
                    <span class="currency-value">${formatCurrency(action.budget_initial)}</span>
                </td>`)}
                
                ${renderCell('actual_cost', `
                <td class="excel-cell ${!isPilotOrObserver ? 'editable-cell' : ''}" data-field="actual_cost" data-action-id="${action.id}" ${!isPilotOrObserver ? `ondblclick="actionsList.editCell(this)"` : ''}>
                    <span class="currency-value">${formatCurrency(action.actual_cost)}</span>
                </td>`)}
                
                ${renderCell('priority', `
                <td class="excel-cell text-center">
                    <select class="form-select form-select-sm priorite-select" onchange="actionsList.updateField(${action.id}, 'priority', this.value)" ${isPilotOrObserver ? 'disabled' : ''}>
                        <option value="1" ${action.priority == 1 ? 'selected' : ''}>1 - Haute</option>
                        <option value="2" ${action.priority == 2 ? 'selected' : ''}>2 - Moyenne</option>
                        <option value="3" ${action.priority == 3 ? 'selected' : ''}>3 - Basse</option>
			<option value="4" ${action.priority == 4 ? 'selected' : ''}>4 - À planifier</option>
                    </select>
                    <span class="print-only">${priorityText}</span>
                </td>`)}
                
                ${renderCell('estimated_duration', `
                <td class="excel-cell ${!isPilotOrObserver ? 'editable-cell' : ''} text-center" data-field="estimated_duration" data-action-id="${action.id}" ${!isPilotOrObserver ? `ondblclick="actionsList.editCell(this)"` : ''}>
                    <span class="time-value">${action.estimated_duration || ''}</span>
                </td>`)}
                
                ${renderCell('planned_date', `
                <td class="excel-cell text-center">
                    <input type="date" class="form-control form-control-sm date-input" value="${action.planned_date ? action.planned_date.split('T')[0] : ''}" onchange="actionsList.updateField(${action.id}, 'planned_date', this.value)" ${isPilotOrObserver ? 'disabled' : ''}>
                </td>`)}
                
                ${renderCell('check_status', `
                <td class="excel-cell text-center">
                    <select class="form-select form-select-sm check-select" onchange="actionsList.updateField(${action.id}, 'check_status', this.value)" ${isPilotOrObserver ? 'disabled' : ''}>
                        <option value="NON" ${action.check_status === 'NON' ? 'selected' : ''}>NON</option>
                        <option value="OK" ${action.check_status === 'OK' ? 'selected' : ''}>OK</option>
                    </select>
                    <span class="print-only">${action.check_status}</span>
                </td>`)}
                
                ${renderCell('predicted_end_date', `
                <td class="excel-cell text-center ${DateUtils.getDateStatusClass(action.predicted_end_date)}">
                    <span class="date-value">${DateUtils.formatDate(action.predicted_end_date)}</span>
                </td>`)}
                
                ${renderCell('final_status', `
                <td class="excel-cell text-center">
                    <select class="form-select form-select-sm statut-select" onchange="actionsList.updateField(${action.id}, 'final_status', this.value)" ${isPilotOrObserver ? 'disabled' : ''}>
                        <option value="NON" ${action.final_status === 'NON' ? 'selected' : ''}>NON</option>
                        <option value="OK" ${action.final_status === 'OK' ? 'selected' : ''}>OK</option>
                    </select>
                    <span class="print-only">${action.final_status}</span>
                </td>`)}
                
                ${renderCell('completion_date', `
                <td class="excel-cell text-center">
                    <input type="date" class="form-control form-control-sm date-input" value="${action.completion_date ? action.completion_date.split('T')[0] : ''}" onchange="actionsList.updateField(${action.id}, 'completion_date', this.value)" ${isPilotOrObserver ? 'disabled' : ''}>
                </td>`)}
            </tr>
        `;
    }

    /**
     * Crée le HTML pour une zone de dépôt.
     * @param {number} index - L'index où l'action serait insérée.
     * @returns {string} - Le HTML de la ligne de dépôt.
     */
    renderDropZone(index) {
        // La classe 'visible-drop-zone' est ajoutée pour activer les styles CSS
        return `
            <tr class="drop-zone-row visible-drop-zone" data-drop-index="${index}">
                <td colspan="${this.columns ? this.columns.length : 17}" class="drop-zone-cell">
                    <div class="drop-zone-content">
                        <button class="drop-zone-button btn btn-sm w-100" 
                                onclick="actionsList.moveActionTo(${index})"
                                title="Cliquez pour déposer l'action ici">
                            <i class="bi bi-arrow-down-circle"></i> Déposer ici
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }
    
    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Setup column width resizing
        const widthResizers = this.container.querySelectorAll('.column-resizer');
        widthResizers.forEach(resizer => {
            resizer.addEventListener('mousedown', (e) => {
                const field = e.target.dataset.field;
                this.startColumnResize(e, field);
            });
        });
        
        // Setup editable cells
        this.container.querySelectorAll('.editable-cell').forEach(cell => {
            cell.addEventListener('dblclick', () => this.editCell(cell));
        });
        
        // Gestionnaire pour la case à cocher "Sélectionner tout"
        const selectAllCheckbox = this.container.querySelector('#selectAllCheckbox');
        if (selectAllCheckbox) {
            if (this.userRole === 'pilot' || this.userRole === 'observer') {
                selectAllCheckbox.disabled = true;
                selectAllCheckbox.title = "Les pilotes ne sont pas autorisés à sélectionner des actions";
            }

            selectAllCheckbox.addEventListener('change', (e) => {
                this.toggleSelectAll(e.target.checked);
            });
        }
        
        // Gestionnaires pour les cases à cocher individuelles
        this.container.querySelectorAll('.action-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const actionId = parseInt(e.target.dataset.actionId);
                this.toggleRowSelection(actionId);
            });
        });
        this.container.querySelectorAll('.dropdown-menu').forEach(menu => {
            menu.addEventListener('click', (e) => e.stopPropagation());
        });
    
    }
    
    /**
     * Handle search
     * @param {string} query - Search query
     */
    search(query) {
        this.searchTerm = query;
        this.applyFiltersAndSort();
        this.render();
    }
    
    /**
     * Reset search
     */
    resetSearch() {
        this.searchTerm = '';
        document.getElementById('searchInput').value = '';
        this.applyFiltersAndSort();
        this.render();
    }
    
    /**
     * Reset all filters
     */
    resetFilters() {
        this.searchTerm = '';
        this.filters = {};
        this.applyFiltersAndSort();
        this.render();
    }
    
    /**
     * Sort by column
     * @param {string} key - Column key to sort by
     */
    sort(key) {
        if (this.sortConfig.key === key) {
            // Toggle direction
            this.sortConfig.direction = this.sortConfig.direction === 'asc' ? 'desc' : 'asc';
        } else {
            // New sort column
            this.sortConfig = { key, direction: 'asc' };
        }
        
        this.applyFiltersAndSort();
        this.render();
    }
    
    /**
     * Handle row click
     * @param {Event} event - Click event
     * @param {number} actionId - Action ID
     */
    handleRowClick(event) {
        // Don't do anything if clicking on a button, input, or select
        if (event.target.tagName === 'BUTTON' || 
            event.target.tagName === 'INPUT' || 
            event.target.tagName === 'SELECT' ||
            event.target.closest('button') ||
            event.target.closest('input') ||
            event.target.closest('select')) {
            return;
        }
        
        // Get action ID from row
        const actionId = parseInt(event.currentTarget.dataset.actionId);
        
        // Toggle selection if holding Ctrl key
        if (event.ctrlKey) {
            this.toggleRowSelection(actionId);
        } else if (event.shiftKey && this.lastSelectedRow) {
            // Select range if holding Shift key
            this.selectRowRange(this.lastSelectedRow, actionId);
        } else {
            // Just select this row
            this.clearSelection();
            this.toggleRowSelection(actionId, true);
        }
        
        this.updateSelectionToolbar();
    }
    
    /**
     * Clear all selections
     */
    clearSelection() {
        this.selectedRows.clear();
        document.querySelectorAll('.excel-row.selected').forEach(row => {
            row.classList.remove('selected');
            row.querySelector('.action-checkbox').checked = false;
        });
        this.updateSelectionToolbar();
    }
    
    /**
     * Update the selection toolbar visibility
     */
    updateSelectionToolbar() {
        const toolbar = document.getElementById('selectionToolbar');
        if (!toolbar) return;
        
        if (this.selectedRows.size > 0) {
            toolbar.classList.add('active');
            toolbar.querySelector('.selection-count').textContent = 
                `${this.selectedRows.size} action(s) sélectionnée(s)`;
            
            // Ajouter le bouton de suppression s'il n'existe pas déjà
            if (!toolbar.querySelector('.delete-actions-btn')) {
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'btn btn-danger btn-sm delete-actions-btn ms-2';
                deleteBtn.innerHTML = '<i class="bi bi-trash"></i> Supprimer';
                deleteBtn.onclick = () => this.deleteSelectedActions();
                
                const btnContainer = toolbar.querySelector('.toolbar-buttons');
                if (btnContainer) {
                    btnContainer.appendChild(deleteBtn);
                } else {
                    const newBtnContainer = document.createElement('div');
                    newBtnContainer.className = 'toolbar-buttons ms-auto';
                    newBtnContainer.appendChild(deleteBtn);
                    toolbar.appendChild(newBtnContainer);
                }
            }
        } else {
            toolbar.classList.remove('active');
            
            // Supprimer le bouton s'il existe
            const deleteBtn = toolbar.querySelector('.delete-actions-btn');
            if (deleteBtn) {
                deleteBtn.remove();
            }
        }
    }

    /**
     * Edit a single action
     * @param {number} actionId - ID of the action to edit
     */
    editAction(actionId) {
        // Si ActionForm existe, ouvrir le formulaire d'édition
        if (window.actionForm) {
            window.actionForm.show(actionId);
        } else {
            // Rediriger vers la page d'édition si le formulaire n'est pas disponible
            window.location.href = `action_edit.html?id=${actionId}`;
        }
    }

    /**
     * Delete a single action
     * @param {number} actionId - ID of the action to delete
     */
    async deleteAction(actionId) {
        // Vérifier si l'utilisateur a le rôle observateur ou pilote
        if (false) { // Observer a maintenant les mêmes restrictions que Pilote
            showToast('Les observateurs ne sont pas autorisés à supprimer des actions', 'warning');
            return;
        }
        
        if (this.userRole === 'pilot' || this.userRole === 'observer') {
            showToast('Les pilotes ne sont pas autorisés à supprimer des actions', 'warning');
            return;
        }
        
        if (!confirm(`Êtes-vous sûr de vouloir supprimer cette action ? Cette opération est irréversible.`)) {
            return;
        }
        
        try {
            await this.apiService.deleteAction(actionId);
            showToast('Action supprimée avec succès', 'success');
            
            // Supprimer l'action du tableau des sélections si elle y est
            if (this.selectedRows.has(actionId)) {
                this.selectedRows.delete(actionId);
                this.updateSelectionToolbar();
            }
            
            // Recharger les actions
            this.loadActions();
        } catch (error) {
            console.error('Erreur lors de la suppression de l\'action:', error);
            showToast('Erreur lors de la suppression de l\'action', 'error');
        }
    }

    /**
     * Delete selected actions
     */
    async deleteSelectedActions() {
        // Vérifier si l'utilisateur a le rôle observateur ou pilote
        if (false) { // Observer a maintenant les mêmes restrictions que Pilote
            showToast('Les observateurs ne sont pas autorisés à supprimer des actions', 'warning');
            return;
        }
        
        if (this.userRole === 'pilot' || this.userRole === 'observer') {
            showToast('Les pilotes ne sont pas autorisés à supprimer des actions', 'warning');
            return;
        }
        
        if (this.selectedRows.size === 0) {
            showToast('Aucune action sélectionnée', 'warning');
            return;
        }
        
        const count = this.selectedRows.size;
        if (!confirm(`Êtes-vous sûr de vouloir supprimer ${count} action(s) ? Cette opération est irréversible.`)) {
            return;
        }
        
        try {
            const promises = Array.from(this.selectedRows).map(actionId => 
                this.apiService.deleteAction(actionId)
            );
            
            await Promise.all(promises);
            showToast(`${count} action(s) supprimée(s) avec succès`, 'success');
            this.selectedRows.clear();
            this.updateSelectionToolbar();
            this.loadActions(); // Recharger la liste des actions
        } catch (error) {
            console.error('Error deleting actions:', error);
            showToast('Erreur lors de la suppression des actions', 'error');
        }
    }
    
    /**
     * Perform bulk update on selected rows
     * @param {string} field - Field to update
     * @param {any} value - New value
     */
    async bulkUpdate(field, value) {
        if (this.selectedRows.size === 0) {
            showToast('Aucune action sélectionnée', 'warning');
            return;
        }
        
        const count = this.selectedRows.size;
        if (!confirm(`Mettre à jour ${field} à "${value}" pour ${count} action(s) ?`)) {
            return;
        }
        
        try {
            const promises = Array.from(this.selectedRows).map(actionId => 
                this.updateField(actionId, field, value)
            );
            
            await Promise.all(promises);
            showToast(`${count} action(s) mise(s) à jour`, 'success');
            this.loadActions();
        } catch (error) {
            console.error('Bulk update error:', error);
            showToast('Erreur lors de la mise à jour en lot', 'error');
        }
    }
    
    /**
     * Update a field value
     * @param {number} actionId - Action ID
     * @param {string} field - Field name
     * @param {any} value - New value
     */
    async updateField(actionId, field, value) {
        try {
            console.log(`Updating field ${field} to ${value} for action ${actionId}`);
            // Envoyer la mise à jour au serveur
            await this.apiService.updateActionField(actionId, field, value);
            
            // Mettre à jour les données locales
            const action = this.actions.find(a => a.id === actionId);
            if (action) {
                action[field] = value;
                
                // Pour les dates planifiées, mettre immédiatement à jour l'apparence visuelle
                if (field === 'planned_date') {
                    console.log('Mise à jour immédiate du statut visuel après changement de date planifiée');
                    
                    // Trouver la ligne dans le DOM
                    const row = document.querySelector(`tr[data-action-id="${actionId}"]`);
                    if (row) {
                        // Mise à jour immédiate du statut visuel 
                        this.updateRowOverdueStatus(row, actionId);
                    }
                }
            }

            // Après une mise à jour de date ou de pilote, vérifier les exceptions.
            if (field === 'planned_date' || field === 'assigned_to') {
                const updatedAction = this.actions.find(a => a.id === actionId);
                if (updatedAction && updatedAction.planned_date && updatedAction.assigned_to) {
                    this.checkExceptionAndWarn(updatedAction.assigned_to, updatedAction.planned_date, actionId);
                }
            }
            
            // Cas spéciaux qui déclenchent d'autres mises à jour
            if (field === 'planned_date' || field === 'estimated_duration' || field === 'assigned_to') {
                console.log('Field change requires end date recalculation');
                
                // Solution directe : récupérer la date calculée du serveur
                try {
                    const response = await this.apiService.calculateEndDate(actionId);
                    console.log('Received calculated end date from server:', response);
                    
                    if (response && response.predicted_end_date) {
                        // Mettre à jour les données locales
                        if (action) {
                            action.predicted_end_date = response.predicted_end_date;
                        }
                        
                        // Mettre à jour l'affichage
                        this.updateEndDateDisplay(actionId, response.predicted_end_date);
                    }
                } catch (calcError) {
                    console.error('Error calculating end date:', calcError);
                }
            }
            
            return true;
        } catch (error) {
            console.error('Failed to update field:', error);
            showToast(`Erreur lors de la mise à jour de ${field}`, 'error');
            return false;
        }
    }
    
    /**
     * Met à jour l'affichage de la date de fin prévue pour une action
     * @param {number} actionId - ID de l'action
     * @param {string} endDate - Date de fin au format YYYY-MM-DD
     */
    updateEndDateDisplay(actionId, endDate) {
        console.log(`Updating display for action ${actionId} with end date ${endDate}`);
        
        // Trouver la ligne de l'action
        const row = document.querySelector(`tr[data-action-id="${actionId}"]`);
        if (!row) {
            console.error(`Row for action ${actionId} not found`);
            return;
        }
        
        // Méthode directe : mise à jour par position dans la ligne
        const dateCell = row.querySelector('td:nth-child(15)');
        if (dateCell) {
            const dateSpan = dateCell.querySelector('.date-value');
            if (dateSpan) {
                // Formater la date pour l'affichage
                const formattedDate = DateUtils.formatDate(endDate);
                dateSpan.textContent = formattedDate;
                
                // Mettre à jour la classe CSS pour le statut
                dateCell.className = `excel-cell text-center ${DateUtils.getDateStatusClass(endDate)}`;
                
                // Mettre à jour le statut "en retard" de la ligne
                const action = this.actions.find(a => a.id == actionId);
                if (action) {
                    // Mettre à jour la predicted_end_date dans l'objet action
                    action.predicted_end_date = endDate;
                    
                    // Mettre à jour la classe CSS de la ligne selon le statut "en retard"
                    this.updateRowOverdueStatus(row, actionId);
                }
                
                console.log(`UI updated with new end date: ${formattedDate}`);
            } else {
                console.error('Date value span not found in cell');
            }
        } else {
            console.error('Date cell not found in row');
        }
    }
    
    /**
     * Recalculate end date for an action
     * @param {number} actionId - Action ID
     */
    async recalculateEndDate(actionId) {
        try {
            console.log(`Recalculating end date for action ${actionId}`);
            
            // Obtenir les données nécessaires
            const action = this.actions.find(a => a.id === actionId);
            if (!action) {
                console.error(`Action ${actionId} not found`);
                return false;
            }
            
            // Utiliser CalendarManager pour calculer la date dynamiquement sans passer par l'API
            if (window.calendarManager) {
                // Récupérer les valeurs directement depuis le DOM pour garantir les données les plus récentes
                const row = document.querySelector(`.excel-row[data-action-id="${actionId}"]`);
                if (!row) {
                    console.error(`Row for action ${actionId} not found`);
                    return false;
                }
                
                // Récupérer la date planifiée et la durée depuis les contrôles du tableau
                const plannedDateInput = row.querySelector('input[type="date"][class*="date-input"]');
                const durationCell = row.querySelector('td[data-field="estimated_duration"]');
                const userSelect = row.querySelector('select[class*="pilote-select"]');
                
                if (!plannedDateInput || !durationCell) {
                    console.error('Required fields not found in the row');
                    return false;
                }
                
                const plannedDate = plannedDateInput.value;
                const duration = durationCell ? parseFloat(durationCell.querySelector('.time-value').textContent) : 0;
                const userId = userSelect ? userSelect.value : null;
                
                console.log(`Using values: date=${plannedDate}, duration=${duration}, userId=${userId}`);
                
                if (plannedDate && duration) {
                    // Calculer la date de fin
                    const endDate = window.calendarManager.calculateEndDate(plannedDate, duration, userId);
                    console.log(`Calculated end date: ${endDate}`);
                    
                    if (endDate) {
                        // Mettre à jour les données locales
                        action.predicted_end_date = endDate;
                        
                        // Trouver la cellule de date de fin prévue et la mettre à jour
                        const dateCell = row.querySelector('td:nth-child(15)');
                        if (dateCell) {
                            const dateSpan = dateCell.querySelector('.date-value');
                            if (dateSpan) {
                                dateSpan.textContent = DateUtils.formatDate(endDate);
                                dateCell.className = `excel-cell text-center ${DateUtils.getDateStatusClass(endDate)}`;
                                console.log(`UI updated with new end date: ${DateUtils.formatDate(endDate)}`);
                                
                                // Mettre à jour le statut "en retard" de la ligne complète
                                this.updateRowOverdueStatus(row, actionId);
                            }
                        }
                        
                        // Appeler l'API pour mettre à jour la date côté serveur
                        this.apiService.updateActionField(actionId, 'predicted_end_date', endDate)
                            .then(() => console.log('End date saved to server'))
                            .catch(err => console.error('Error saving end date to server:', err));
                            
                        return true;
                    }
                }
            } else {
                // Fallback à l'API si CalendarManager n'est pas disponible
                console.log('CalendarManager not available, using API fallback');
                const data = await this.apiService.calculateEndDate(actionId);
                
                if (data && data.predicted_end_date) {
                    action.predicted_end_date = data.predicted_end_date;
                    
                    // Trouver la cellule par sa position dans la rangée
                    const row = document.querySelector(`tr[data-action-id="${actionId}"]`);
                    if (row) {
                        const dateCell = row.querySelector('td:nth-child(15)');
                        if (dateCell) {
                            const dateSpan = dateCell.querySelector('.date-value');
                            if (dateSpan) {
                                dateSpan.textContent = DateUtils.formatDate(data.predicted_end_date);
                                dateCell.className = `excel-cell text-center ${DateUtils.getDateStatusClass(data.predicted_end_date)}`;
                                
                                // Mettre à jour le statut "en retard" de la ligne complète
                                this.updateRowOverdueStatus(row, actionId);
                            }
                        }
                    }
                }
            }
            
            return true;
        } catch (error) {
            console.error('Failed to get user data:', error);
        }
        // ...
    }
    
    /**
     * Applique les restrictions basées sur le rôle utilisateur
     * Cette fonction est appelée au chargement et après chaque rendu pour garantir
     * que les restrictions persistent après un rechargement de page (F5)
     */
    enforceRoleRestrictions() {
        // Cette fonction est maintenant beaucoup plus simple car la logique est dans renderTableRow
        const userRole = this.authManager.getUserRole();
        if (!userRole || (userRole !== 'pilot' && userRole !== 'observer')) return;

        // Désactiver uniquement les boutons globaux de la barre d'outils
            const newActionBtn = document.getElementById('newActionBtn');
            if (newActionBtn) {
                newActionBtn.disabled = true;
            newActionBtn.title = "Les pilotes et observateurs ne sont pas autorisés à créer des actions.";
        }
        
            const selectAllCheckbox = document.getElementById('selectAllCheckbox');
            if (selectAllCheckbox) {
                selectAllCheckbox.disabled = true;
            selectAllCheckbox.title = "La sélection n'est pas autorisée pour votre rôle.";
        }
    }

    /**
     * Start editing a cell
     * @param {HTMLElement} cell - Cell element
     */
    editCell(cell) {
        if (this.editingCell) {
            this.cancelCellEdit();
        }
        
        const field = cell.dataset.field;
        const actionId = Number(cell.dataset.actionId);
        const action = this.filteredActions.find(a => a.id === actionId);
        if (!action) return;
        
        // Restriction pour les pilotes : uniquement commentaires et besoin ressource modifiables
        if ((this.userRole === 'pilot' || this.userRole === 'observer') && field !== 'comments' && field !== 'resource_needs') {
            showToast('En tant que pilote, vous ne pouvez modifier que les commentaires et les besoins en ressources.', 'warning');
            return;
        }
        
        const currentValue = action[field] || '';
        
        // Créer un conteneur pour l'éditeur et les boutons
        const editorContainer = document.createElement('div');
        editorContainer.className = 'editor-container d-flex';
        
        // Create appropriate editor based on field type
        let editor;
        if (field === 'budget_initial' || field === 'actual_cost') {
            editor = document.createElement('input');
            editor.type = 'number';
            editor.step = '0.01';
            editor.value = currentValue;
        } else if (field === 'estimated_duration') {
            editor = document.createElement('input');
            editor.type = 'number';
            editor.step = '0.5';
            editor.value = currentValue;
        } else {
            editor = document.createElement('input');
            editor.type = 'text';
            editor.value = currentValue;
        }
        
        editor.className = 'form-control form-control-sm editor-input flex-grow-1';
        editorContainer.appendChild(editor);
        
        // Ajouter des boutons de sauvegarde et d'annulation
        const saveButton = document.createElement('button');
        saveButton.innerHTML = '✓';
        saveButton.className = 'btn btn-sm btn-success ms-1';
        saveButton.onclick = (e) => {
            e.stopPropagation();
            this.saveEditingCell();
        };
        editorContainer.appendChild(saveButton);
        
        const cancelButton = document.createElement('button');
        cancelButton.innerHTML = '✕';
        cancelButton.className = 'btn btn-sm btn-secondary ms-1';
        cancelButton.onclick = (e) => {
            e.stopPropagation();
            this.cancelEditing();
        };
        editorContainer.appendChild(cancelButton);
        
        // Save current content
        const originalContent = cell.innerHTML;
        cell.innerHTML = '';
        cell.appendChild(editorContainer);
        cell.classList.add('editing');
        
        editor.focus();
        editor.select();
        
        this.editingCell = {
            cell,
            field,
            actionId,
            originalContent,
            editor
        };
        
        // Handle save on enter/escape
        editor.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.saveEditingCell();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                this.cancelEditing();
            }
        });
        
        // Empêcher la fermeture sur blur
        editor.addEventListener('blur', (e) => {
            // Ne pas fermer automatiquement, l'utilisateur doit cliquer sur ✓ ou ✕
            e.preventDefault();
            e.stopPropagation();
        });
        
        // Empêcher la propagation des clics
        editorContainer.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }
    
    /**
     * Save the currently edited cell
     */
    async saveEditingCell() {
        if (!this.editingCell) return;
        
        const { cell, field, actionId, originalContent, editor } = this.editingCell;
        const newValue = editor.value;
        
        cell.classList.remove('editing');
        
        // Only update if value changed
        const action = this.actions.find(a => a.id === actionId);
        if (action && String(action[field]) !== String(newValue)) {
            try {
                await this.updateField(actionId, field, newValue);
                
                // Update cell content based on field type
                if (field === 'budget_initial' || field === 'cout_total') {
                    cell.innerHTML = `<span class="currency-value">${formatCurrency(newValue)}</span>`;
                } else if (field === 'temps_realisation') {
                    cell.innerHTML = `<span class="time-value">${newValue}</span>`;
                } else {
                    cell.innerHTML = `<div class="cell-content" title="${newValue}">${truncateText(newValue, 30)}</div>`;
                }
            } catch (error) {
                cell.innerHTML = originalContent;
            }
        } else {
            cell.innerHTML = originalContent;
        }
        
        this.editingCell = null;
    }
    
    /**
     * Cancel cell editing
     */
    cancelEditing() {
        if (!this.editingCell) return;
        
        const { cell, originalContent } = this.editingCell;
        cell.classList.remove('editing');
        cell.innerHTML = originalContent;
        this.editingCell = null;
    }
    
    /**
     * Show action photos
     * @param {number} actionId - Action ID
     * @param {Event} event - Click event
     */
    showPhotos(actionId) {
        // --- DEBUG ---
        console.log(`[ActionsList] Appel de showPhotos pour actionId: ${actionId}`);
        
        // If PhotoManager exists, call it
        if (window.photoManager) {
            window.photoManager.show(actionId);
        } else {
            showToast('Gestionnaire de photos non disponible', 'warning');
        }
    }
    
    /**
     * Export actions to CSV
     */
    exportToCSV() {
        if (this.filteredActions.length === 0) {
            showToast('Aucune action à exporter', 'warning');
            return;
        }
        
        // Prepare data for export, ensuring correct field names and nested objects are handled
        const data = this.filteredActions.map(action => ({
            'Numéro': action.number,
            'Lieu': action.location ? action.location.name : 'Non spécifié',
            'Action': action.title,
            'Commentaires': action.comments,
            'Pilote': action.assigned_user ? action.assigned_user.username : 'Non assigné',
            'Besoin Ressource': action.resource_needs,
            'Budget Initial': action.budget_initial,
            'Coût Total': action.actual_cost,
            'Priorité': action.priority,
            'Temps Réalisation': action.estimated_duration,
            'Date Planifiée': action.planned_date ? DateUtils.formatDate(action.planned_date) : 'Non spécifié',
            'Check': action.check_status,
            'Date Fin Prévue': action.predicted_end_date ? DateUtils.formatDate(action.predicted_end_date) : 'Non spécifié',
            'Statut Final': action.final_status,
            'Date Réalisation': action.completion_date ? DateUtils.formatDate(action.completion_date) : 'Non spécifié'
        }));
        
        // Export data
        exportToCSV(data, 'actions_gmao.csv');
        showToast(`${data.length} action(s) exportée(s) en CSV`, 'success');
    }
    
    /**
     * Print actions list
     */
    printList() {
        const printDate = new Date().toLocaleDateString('fr-FR', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
        document.body.setAttribute('data-print-date', `Imprimé le ${printDate}`);
        window.print();
    }
    
    /**
     * Resets column widths to their default values.
     */
    resetColumnWidths() {
        if (confirm("Voulez-vous réinitialiser les largeurs des colonnes à leur valeur par défaut ?")) {
            localStorage.removeItem('gmao_column_widths');
            this.columnWidths = this.getDefaultColumnWidths();
            this.render(); // Re-render to apply new widths
            showToast('Largeurs des colonnes réinitialisées.', 'success');
        }
    }
    
    /**
     * Handle keyboard navigation - Consolidated version
     * @param {Event} e - Keydown event
     */
    handleKeyDown(e) {
        // Only handle if we have an active cell/row
        if (this.editingCell) {
            // Editing - special keys are already handled by the editor
            return;
        }
        
        // For selected rows
        if (this.selectedRows.size > 0) {
            if (e.key === 'Delete') {
                // Handle delete - vérifier si l'utilisateur a les droits
                if (this.userRole === 'observer' || this.userRole === 'pilot') {
                    showToast(`Les ${this.userRole === 'observer' ? 'observateurs' : 'pilotes'} ne sont pas autorisés à supprimer des actions`, 'warning');
                    return;
                }
                
                if (confirm('Supprimer les actions sélectionnées ?')) {
                    this.deleteSelectedActions();
                }
            } else if (e.key === 'Escape') {
                // Clear selection
                this.clearSelection();
            }
        }
    }
    
    /**
     * Get Excel-style column letter (A, B, C, etc.)
     * @param {number} index - Column index
     * @returns {string} - Column letter
     */
    getExcelColumnLetter(index) {
        const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        if (index < 26) return letters[index];
        return letters[Math.floor(index / 26) - 1] + letters[index % 26];
    }
    
    /**
     * Échappe les caractères HTML pour éviter les injections XSS
     * @param {string} text - Le texte à échapper
     * @returns {string} - Le texte échappé
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Get CSS class based on priority
     * @param {string} priorite - Priority value
     * @returns {string} - CSS class
     */
    getPriorityRowClass(priorite) {
        switch (priorite) {
            case '1': return 'priority-high';   // 1 = Haute (rouge)
            case '2': return 'priority-medium'; // 2 = Moyenne (jaune)
            case '3': return 'priority-low';    // 3 = Basse (verte)
            case '4': return 'priority-tbd';    // 4 = À planifier (gris)
            default: return 'priority-tbd';     // Par défaut, utiliser priorité À planifier
        }
    }
    
    /**
     * Get CSS class based on date status
     * @param {string} date - Date string
     * @returns {string} - CSS class
     */
    getDateStatusClass(date) {
        // Utiliser la fonction utilitaire depuis l'objet global DateUtils
        return DateUtils.getDateStatusClass(date);
    }
    
    /**
     * Met à jour le statut visuel "en retard" d'une ligne d'action
     * @param {HTMLElement} row - La ligne HTML à mettre à jour
     * @param {number|string} actionId - L'ID de l'action
     */
    updateRowOverdueStatus(row, actionId) {
        // Récupérer l'action complète depuis les données chargées
        const action = this.actions.find(a => a.id == actionId);
        if (action && DateUtils.isActionOverdue(action)) {
            row.classList.add('overdue-action');
        } else {
            row.classList.remove('overdue-action');
        }
    }

    /**
     * Gère le début du glisser-déposer (méthode simple).
     */
    handleDragStart(event, actionId) {
        if (this.userRole === 'pilot' || this.userRole === 'observer') {
            event.preventDefault();
            return;
        }
        this.draggedActionId = actionId;
        event.currentTarget.classList.add('dragging');
        event.dataTransfer.setData('text/plain', actionId);
        event.dataTransfer.effectAllowed = 'move';
    }

    /**
     * Gère le survol pendant le glisser-déposer.
     */
    handleDragOver(event) {
        event.preventDefault();
    }

    /**
     * Gère la fin du glisser-déposer (nettoyage).
     */
    handleDragEnd(event) {
        event.currentTarget.classList.remove('dragging');
    }

    /**
     * Gère le dépôt d'un élément (logique de réorganisation).
     */
    handleDrop(event, targetActionId) {
        event.preventDefault();
        document.querySelector('.dragging')?.classList.remove('dragging');

        if (!this.draggedActionId || this.draggedActionId === targetActionId) {
            return;
        }

        const sourceIndex = this.filteredActions.findIndex(a => a.id == this.draggedActionId);
        const targetIndex = this.filteredActions.findIndex(a => a.id == targetActionId);

        if (sourceIndex === -1 || targetIndex === -1) return;

        // Construire la nouvelle liste d'IDs sans modifier les tableaux locaux
        const orderedIds = this.filteredActions.map(a => a.id);
        const [movedId] = orderedIds.splice(sourceIndex, 1);
        orderedIds.splice(targetIndex, 0, movedId);

        // Sauvegarder le nouvel ordre et laisser le backend renvoyer la vérité
        this.saveActionOrder(orderedIds);
    }

    /**
     * Met à jour les numéros des actions après réorganisation
     */
    updateActionNumbers() {
        // Mettre à jour les numéros séquentiels si c'est la méthode utilisée
        this.filteredActions.forEach((action, index) => {
            // Ne mettre à jour que si le numéro d'action est numérique et séquentiel
            if (!isNaN(parseInt(action.numero_actions)) &&
                (index === 0 || parseInt(action.numero_actions) === parseInt(this.filteredActions[index-1].numero_actions) + 1)) {
                action.numero_actions = index + 1;
            }
        });
    }

    /**
     * Enregistre le nouvel ordre des actions et rafraîchit les données depuis le serveur.
     */
    async saveActionOrder(orderedIds) {
        this.showLoading();
        try {
            // Envoyer le nouvel ordre et recevoir la liste complète et mise à jour
            const updatedActions = await this.apiService.reorderActions(orderedIds);
            
            // Remplacer les données locales par la nouvelle source de vérité
            this.actions = updatedActions;
            
            // Appliquer les filtres et le tri actuels sur les nouvelles données
            this.applyFiltersAndSort();
            
            // Redessiner l'interface avec les données fraîches
            this.render();

            showToast('Ordre des actions mis à jour', 'success');
        } catch (error) {
            console.error('Erreur lors de la mise à jour de l\'ordre des actions:', error);
            showToast('Erreur lors de la mise à jour de l\'ordre', 'error');
            // En cas d'erreur, recharger complètement pour être sûr de revenir à un état stable
            this.loadActions();
        } finally {
            this.hideLoading();
    }
}

    /**
     * Sélectionne une action pour la déplacer.
     * @param {number} actionId - L'ID de l'action à déplacer.
     */

    selectActionForMove(actionId) {
        // If an action is already selected, clear its visual state first
        if (this.actionToMove) {
            const previousSourceRow = document.querySelector(`tr[data-action-id="${this.actionToMove.id}"]`);
            if (previousSourceRow) {
                previousSourceRow.classList.remove('is-moving');
            }
        }

        // If the user clicked the same move button again, it's a toggle to cancel the move.
        if (this.actionToMove && this.actionToMove.id === actionId) {
            this.actionToMove = null; // Cancel the move
            const bubble = document.getElementById('transfer-bubble');
            if (bubble) {
                bubble.classList.remove('active');
            }
        } else {
            // Otherwise, select the new action to move
            this.actionToMove = this.filteredActions.find(a => a.id === actionId);
            
            if (this.actionToMove) {
                // And update its visuals
                const sourceRow = document.querySelector(`tr[data-action-id="${actionId}"]`);
                if (sourceRow) {
                    sourceRow.classList.add('is-moving');
                }
                this.showTransferBubble();
            }
        }
        
        // Finally, re-render the table just once with the final state.
        this.render();
    }

    /**
     * Affiche la bulle de transfert avec l'action sélectionnée.
     */
    showTransferBubble() {
        if (!this.actionToMove) return;

        let bubble = document.getElementById('transfer-bubble');
        if (!bubble) {
            bubble = document.createElement('div');
            bubble.id = 'transfer-bubble';
            bubble.className = 'transfer-bubble';
            document.body.appendChild(bubble);
        }

        // Utiliser title au lieu de action pour correspondre à la structure de données
        const actionTitle = this.actionToMove.title || this.actionToMove.action || 'Action sans titre';
        
        bubble.innerHTML = `
            <div class="d-flex align-items-center">
                <i class="bi bi-arrows-move me-2"></i>
                <span>Déplacer: <strong>${this.escapeHtml(actionTitle)}</strong></span>
                <button class="btn-close btn-sm ms-3" onclick="actionsList.cancelMove()" 
                        title="Annuler le déplacement"></button>
            </div>
        `;
        bubble.classList.add('active');
    }

    /**
     * Annule l'opération de déplacement.
     */
    cancelMove() {
        if (!this.actionToMove) return;

        // Retirer le style de la ligne source
        const sourceRow = document.querySelector(`tr[data-action-id="${this.actionToMove.id}"]`);
        if (sourceRow) {
            sourceRow.classList.remove('is-moving');
        }

        this.actionToMove = null;

        // Cacher la bulle
        const bubble = document.getElementById('transfer-bubble');
        if (bubble) {
            bubble.classList.remove('active');
        }
        
        this.render(); // Pour cacher les zones de dépôt
    }

    /**
     * Déplace l'action vers un nouvel index.
     * @param {number} targetIndex - L'index où déposer l'action.
     */
    async moveActionTo(targetIndex) {
        if (!this.actionToMove) {
            console.error('[ActionsList] Aucune action sélectionnée pour le déplacement');
            return;
        }

        const sourceIndex = this.filteredActions.findIndex(a => a.id === this.actionToMove.id);
        if (sourceIndex === -1) {
            console.error('[ActionsList] Action source non trouvée dans les actions filtrées');
            this.cancelMove();
            return;
        }

        // Vérifier que l'index cible est valide
        if (targetIndex < 0 || targetIndex > this.filteredActions.length) {
            console.error('[ActionsList] Index cible invalide:', targetIndex);
            this.cancelMove();
            return;
        }

        // Ne rien faire si on déplace au même endroit
        if (sourceIndex === targetIndex || sourceIndex === targetIndex - 1) {
            this.cancelMove();
            return;
        }
        
        try {
            // Afficher un indicateur de chargement pendant l'opération
            this.showLoading();
            
            // Construire la nouvelle liste d'IDs sans modifier les tableaux locaux
            const orderedIds = this.filteredActions.map(a => a.id);
            const [movedId] = orderedIds.splice(sourceIndex, 1);
            
            // Ajuster l'index cible si nécessaire (après suppression de l'élément source)
            const adjustedTargetIndex = targetIndex > sourceIndex ? targetIndex - 1 : targetIndex;
            orderedIds.splice(adjustedTargetIndex, 0, movedId);

            // Nettoyer l'état de déplacement avant la sauvegarde
            this.cancelMove();
            
            // Sauvegarder le nouvel ordre en passant la liste d'IDs
            await this.saveActionOrder(orderedIds);
            
        } catch (error) {
            console.error('[ActionsList] Erreur lors du déplacement:', error);
            showToast('Erreur lors du déplacement de l\'action', 'error');
            this.cancelMove();
            this.hideLoading();
        }
    }

/**
 * Applique toutes les restrictions nécessaires pour les pilotes
 * Cette méthode est appelée à chaque chargement de la page et après chaque rendu du tableau
 */
    applyPilotRestrictions() {
    if (this.userRole !== 'pilot') return;
    
    console.log('[ActionsList] Applying pilot restrictions...');
    
    // 1. Désactiver toutes les cases à cocher individuelles
    document.querySelectorAll('.action-checkbox').forEach(checkbox => {
        checkbox.disabled = true;
        checkbox.title = "Les pilotes ne sont pas autorisés à sélectionner des actions";
    });
    
    // 2. Désactiver la case à cocher "Sélectionner tout" dans l'en-tête
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    if (selectAllCheckbox) {
        selectAllCheckbox.disabled = true;
        selectAllCheckbox.title = "Les pilotes ne sont pas autorisés à sélectionner des actions";
    }
    
    // 3. Désactiver le bouton de création d'action
    const newActionBtn = document.getElementById('newActionBtn');
    if (newActionBtn) {
        newActionBtn.disabled = true;
        newActionBtn.title = "Les pilotes ne sont pas autorisés à créer des actions";
    }
    
    // 4. Désactiver les boutons d'édition sauf pour les champs autorisés
    document.querySelectorAll('.excel-cell').forEach(cell => {
        const field = cell.dataset.field;
        if (field && field !== 'commentaires' && field !== 'besoin_ressource') {
            cell.classList.add('disabled-for-pilot');
            cell.title = "Les pilotes peuvent uniquement modifier les commentaires et besoins en ressources";
        }
    });

    console.log('[ActionsList] Pilot restrictions applied successfully');
    }

    // --- New Filter and Visibility Functions ---

    loadColumnVisibility() {
        const saved = localStorage.getItem('gmao_column_visibility');
        if (saved) {
            return JSON.parse(saved);
        }

        const userRole = this.authManager.getUserRole();
        const defaults = {
            'select': true,
            'number': true,
            'quick_actions': true,
            'photos': true,
            'lieu': true,
            'action': true,
            'commentaires': true,
            'qui_pilote': true,
            'besoin_ressource': true,
            'budget_initial': true,
            'cout_total': true,
            'priorite': true,
            'temps_realisation': true,
            'date_planifiee': true,
            'check': true,
            'date_fin_prevue': true,
            'statut_final': true,
            'date_realisation': true
        };

        // Default hidden columns for pilots
        if (userRole === 'pilot') {
            return {
                'select': false,
                'number': true,
                'quick_actions': true,
                'photos': false,
                'lieu': true,
                'action': true,
                'commentaires': true,
                'qui_pilote': true,
                'besoin_ressource': true,
                'budget_initial': true,
                'cout_total': false,
                'priorite': true,
                'temps_realisation': true,
                'date_planifiee': true,
                'check': true,
                'date_fin_prevue': true,
                'statut_final': true,
                'date_realisation': true
            };
        }

        return defaults;
    }

    saveColumnVisibility() {
        localStorage.setItem('gmao_column_visibility', JSON.stringify(this.columnVisibility));
        this.applyColumnVisibility();
    }

    populateFilterMenus() {
        // Populate assigned to filter
        const select = document.getElementById('filterAssignedTo');
        const assignedToContainer = document.getElementById('assignedToFilterContainer');

        if (this.userRole === 'pilot') {
            // Hide the filter for pilots
            if (assignedToContainer) assignedToContainer.style.display = 'none';
        } else {
            // Populate for admins/managers
            if (select) {
                select.innerHTML = '<option value="">Toutes les ressources</option>'; // Reset
                this.assignableUsers.forEach(user => {
                    select.innerHTML += `<option value="${user.id}">${user.username}</option>`;
                });
                select.value = this.rowFilters.assigned_to;
            }
        }

        // Populate status filters and set checked state
        document.getElementById('filterTbd').checked = this.rowFilters.status.tbd;
        document.getElementById('filterInProgress').checked = this.rowFilters.status.in_progress;
        document.getElementById('filterCompleted').checked = this.rowFilters.status.completed;

        // Populate column visibility menu
        const menu = document.getElementById('columnVisibilityMenu');
        if (menu && this.columns) {
            menu.innerHTML = this.columns
                .filter(col => col.key !== 'action') // Action column is always visible
                .map(col => `
                    <li>
                        <a class="dropdown-item column-visibility-toggle" href="#" data-column="${col.key}">
                            <i class="bi ${this.columnVisibility[col.key] !== false ? 'bi-check-square' : 'bi-square'}"></i>
                            ${col.label}
                        </a>
                    </li>
                `).join('');
            
            // Re-attach event listeners for column visibility toggles
            menu.querySelectorAll('.column-visibility-toggle').forEach(toggle => {
                toggle.addEventListener('click', this.handleColumnVisibilityChange.bind(this));
            });
        }
    }

    applyColumnVisibility() {
        if (!this.columns) return;
        this.columns.forEach((col, index) => {
            const isVisible = this.columnVisibility[col.key] !== false;
            const th = document.querySelector(`th[data-field="${col.key}"]`);
            const tds = document.querySelectorAll(`tr td:nth-child(${index + 1})`);
            
            if (th) th.classList.toggle('column-hidden', !isVisible);
            tds.forEach(td => td.classList.toggle('column-hidden', !isVisible));
        });
    }

    handleStatusFilterChange(e) {
        const status = e.target.value;
        const isChecked = e.target.checked;
        this.rowFilters.status[status] = isChecked;
        this.saveRowFilters();
        this.applyFiltersAndSort();
        this.updateTableBody(); // Only re-render the table rows
    }

    handleAssignedToFilterChange(e) {
        this.rowFilters.assigned_to = e.target.value;
        this.saveRowFilters();
        this.loadActions(); // Reload data from the server with the new filter
    }

    handleColumnVisibilityChange(e) {
        e.preventDefault();
        e.stopPropagation();
        const columnKey = e.currentTarget.dataset.column;
        this.columnVisibility[columnKey] = this.columnVisibility[columnKey] === false; // Toggle
        this.saveColumnVisibility();
        this.applyColumnVisibility(); // Apply change immediately without full re-render
        
        // Update checkmark
        const icon = e.currentTarget.querySelector('i');
        icon.className = `bi ${this.columnVisibility[columnKey] ? 'bi-check-square' : 'bi-square'}`;
    }

    updateTableBody() {
        const tbody = this.container.querySelector('.excel-table tbody');
        if (tbody) {
            tbody.innerHTML = this.renderTableRows();
        }
    }

    loadRowFilters() {
        const saved = localStorage.getItem('gmao_row_filters');
        if (saved) {
            return JSON.parse(saved);
        }
        return {
            status: { tbd: true, in_progress: true, completed: false },
            assigned_to: ''
        };
    }

    saveRowFilters() {
        localStorage.setItem('gmao_row_filters', JSON.stringify(this.rowFilters));
    }

    /**
     * Vérifie si un pilote a une exception à une date donnée et affiche un avertissement.
     * @param {number} userId - L'ID de l'utilisateur.
     * @param {string} date - La date à vérifier (YYYY-MM-DD).
     * @param {number} actionId - L'ID de l'action pour surligner la cellule.
     */
    async checkExceptionAndWarn(userId, date, actionId) {
        try {
            const exception = await this.apiService.checkUserException(userId, date);
            if (exception) {
                const user = this.assignableUsers.find(u => u.id === userId);
                const userName = user ? user.username : 'Ce pilote';
                const exceptionTypeInfo = {
                    "holiday": "un jour férié",
                    "vacation": "en congés",
                    "sick": "en arrêt maladie",
                    "training": "en formation",
                    "other": "indisponible (autre)"
                };
                const reason = exceptionTypeInfo[exception.exception_type] || "indisponible";

                const message = `Attention : ${userName} est ${reason} le ${DateUtils.formatDate(date)}.`;
                showToast(message, 'warning', 7000);

                // Surligner la cellule de date
                const row = document.querySelector(`tr[data-action-id="${actionId}"]`);
                if (row) {
                    const dateCell = row.querySelector('input.date-input[onchange*="planned_date"]');
                    if (dateCell) {
                        dateCell.classList.add('date-exception-warning');
                        setTimeout(() => {
                            dateCell.classList.remove('date-exception-warning');
                        }, 7000);
                    }
                }
            }
        } catch (error) {
            console.error("Erreur lors de la vérification de l'exception :", error);
        }
    }

    /**
     * Gets the value from an action object for sorting purposes.
     * @param {object} action - The action object.
     * @param {string} key - The sort key.
     * @returns {string|number|null} The value to sort by.
     */
    getSortValue(action, key) {
        if (!action) return null;
        switch (key) {
            case 'location':
                return action.location ? action.location.name : null;
            case 'assigned_user':
                return action.assigned_user ? action.assigned_user.username : null;
            // All other keys should now match the action properties directly
            default:
                return action[key];
        }
    }
    
    /**
     * Crée une nouvelle action avec des données pré-remplies depuis le planning
     * @param {Object} planningData - Données du planning pour pré-remplir le formulaire
     */
    createActionFromPlanning(planningData) {
        console.log('[ActionsList] Création d\'action depuis le planning:', planningData);
        
        // Vérifier les permissions
        const user = this.authManager.getUser();
        if (!user || user.role === 'pilot' || user.role === 'observer') {
            showToast('Vous n\'êtes pas autorisé à créer des actions', 'error');
            return;
        }
        
        // Ouvrir le formulaire de création (actionId = null)
        if (window.actionForm) {
            window.actionForm.show(null);
            
            // Attendre que le formulaire soit ouvert puis pré-remplir les champs
            setTimeout(() => {
                this.prefillFormFromPlanning(planningData);
            }, 500);
        } else {
            console.error('[ActionsList] ActionForm non disponible');
            showToast('Erreur: formulaire d\'action non disponible', 'error');
        }
    }
    
    /**
     * Pré-remplit le formulaire d'action avec les données du planning
     * @param {Object} planningData - Données du planning
     */
    prefillFormFromPlanning(planningData) {
        console.log('[ActionsList] Pré-remplissage du formulaire:', planningData);
        
        try {
            // 1. Utilisateur assigné
            if (planningData.assigned_to) {
                const assignedUserField = document.getElementById('assigned_user');
                if (assignedUserField) {
                    assignedUserField.value = planningData.assigned_to;
                    // Déclencher l'événement change pour mettre à jour l'interface
                    assignedUserField.dispatchEvent(new Event('change'));
                }
            }
            
            // 2. Date planifiée
            if (planningData.planned_date) {
                const plannedDateField = document.getElementById('planned_date');
                if (plannedDateField) {
                    plannedDateField.value = planningData.planned_date;
                    plannedDateField.dispatchEvent(new Event('change'));
                }
            }
            
            // 3. Durée estimée
            if (planningData.estimated_duration) {
                const durationField = document.getElementById('estimated_duration');
                if (durationField) {
                    durationField.value = planningData.estimated_duration;
                    durationField.dispatchEvent(new Event('input'));
                }
            }
            
            // 4. Priorité
            if (planningData.priority) {
                const priorityField = document.getElementById('priority');
                if (priorityField) {
                    priorityField.value = planningData.priority;
                    priorityField.dispatchEvent(new Event('change'));
                }
            }
            
            // 5. Commentaire contextuel dans le champ description ou commentaires
            if (planningData.context_comment) {
                // Essayer d'abord le champ commentaires
                let commentField = document.getElementById('comments');
                if (!commentField) {
                    // Sinon essayer description
                    commentField = document.getElementById('description');
                }
                if (commentField) {
                    commentField.value = planningData.context_comment;
                    commentField.dispatchEvent(new Event('input'));
                }
            }
            
            // 6. Toast de confirmation
            showToast(`Action pré-remplie avec les données du planning pour le ${planningData.planned_date}`, 'success');
            
        } catch (error) {
            console.error('[ActionsList] Erreur lors du pré-remplissage:', error);
            showToast('Données du planning appliquées (certains champs peuvent nécessiter une vérification)', 'warning');
        }
    }
}

// Initialize the ActionsList when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('actionsListContainer');
    if (container) {
        window.actionsList = new ActionsList(container);
        window.actionsList.init();
    }
});
