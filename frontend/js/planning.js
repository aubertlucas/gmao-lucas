// Planning Management System
class PlanningManager {
    constructor() {
        this.apiService = new ApiService();
        this.currentWeekStart = null;
        this.currentUserId = null;
        this.currentWeekDate = new Date();
        this.planningData = null;
        this.users = [];
        this.tooltip = null;
        this.modals = {};
        this.selectedAction = null;
        
        // Actions pour ActionPicker
        this.allActions = [];
        
        this.init();
    }

    init() {
        this.createTooltip();
        this.setupEventListeners();
        this.setupModals();
        this.loadUsers();
        this.setCurrentWeek();
    }

    createTooltip() {
        this.tooltip = document.createElement('div');
        this.tooltip.className = 'planning-tooltip';
        document.body.appendChild(this.tooltip);
    }

    setupModals() {
        this.modals.dayDetail = new bootstrap.Modal(document.getElementById('dayDetailModal'));
        this.modals.actionDetail = new bootstrap.Modal(document.getElementById('actionDetailModal'));
    }

    setupEventListeners() {
        // Navigation
        document.getElementById('prevWeek').addEventListener('click', () => this.navigateWeek(-1));
        document.getElementById('nextWeek').addEventListener('click', () => this.navigateWeek(1));
        document.getElementById('todayBtn').addEventListener('click', () => this.goToToday());
        document.getElementById('weekPicker').addEventListener('change', (e) => this.goToDate(e.target.value));
        
        // User selection
        document.getElementById('userSelect').addEventListener('change', (e) => this.selectUser(e.target.value));
        
        // Modal buttons
        document.getElementById('addActionBtn').addEventListener('click', () => this.addAction());
        document.getElementById('planActionBtn').addEventListener('click', () => this.showActionPicker());
        document.getElementById('editActionBtn').addEventListener('click', () => this.editAction());
        
        // Mouse events for tooltips
        document.addEventListener('mousemove', (e) => this.updateTooltipPosition(e));
        document.addEventListener('mouseout', (e) => this.hideTooltip(e));
    }

    async loadUsers() {
        try {
            showLoading(true);
            const apiService = new ApiService();
            const users = await apiService.getUsers();
            
            if (users && users.length > 0) {
                this.users = users;
                this.populateUserSelect();
            } else {
                throw new Error('Aucun utilisateur trouvé');
            }
        } catch (error) {
            console.error('Erreur:', error);
            showAlert('Erreur lors du chargement des utilisateurs', 'danger');
        } finally {
            showLoading(false);
        }
    }

    populateUserSelect() {
        const select = document.getElementById('userSelect');
        select.innerHTML = '<option value="">Sélectionner un pilote...</option>';
        
        // Afficher tous les utilisateurs dans la liste
        this.users.forEach(user => {
            const option = document.createElement('option');
            option.value = user.id;
            option.textContent = `${user.username} (${user.role})`;
            select.appendChild(option);
        });
        
        // Sélectionner automatiquement le premier utilisateur avec le rôle "pilot"
        const firstPilot = this.users.find(user => user.role.toLowerCase() === 'pilot');
        if (firstPilot) {
            select.value = firstPilot.id;
            this.selectUser(firstPilot.id);
        }
    }

    setCurrentWeek() {
        const today = new Date();
        this.currentWeekDate = new Date(today);
        this.updateWeekDisplay();
        this.updateWeekPicker();
    }

    updateWeekDisplay() {
        const monday = this.getMonday(this.currentWeekDate);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        
        const weekNumber = this.getWeekNumber(monday);
        
        document.getElementById('weekDisplay').textContent = 
            `Semaine du ${this.formatDate(monday)} au ${this.formatDate(sunday)}`;
        document.getElementById('weekNumber').textContent = 
            `Semaine N°${weekNumber} - ${monday.getFullYear()}`;
    }

    updateWeekPicker() {
        const monday = this.getMonday(this.currentWeekDate);
        document.getElementById('weekPicker').value = this.formatDateISO(monday);
    }

    navigateWeek(direction) {
        this.currentWeekDate.setDate(this.currentWeekDate.getDate() + (direction * 7));
        this.updateWeekDisplay();
        this.updateWeekPicker();
        if (this.currentUserId) {
            this.loadPlanning();
        }
    }

    goToToday() {
        this.setCurrentWeek();
        if (this.currentUserId) {
            this.loadPlanning();
        }
    }

    goToDate(dateStr) {
        if (dateStr) {
            this.currentWeekDate = new Date(dateStr);
            this.updateWeekDisplay();
            if (this.currentUserId) {
                this.loadPlanning();
            }
        }
    }

    selectUser(userId) {
        if (userId) {
            this.currentUserId = parseInt(userId);
            this.loadPlanning();
        } else {
            this.currentUserId = null;
            this.showNoDataState();
        }
    }

    async loadPlanning() {
        if (!this.currentUserId) return;
        
        try {
            showLoading(true);
            const monday = this.getMonday(this.currentWeekDate);
            const dateStr = this.formatDateISO(monday);
            
            const apiService = new ApiService();
            const data = await apiService.request(`/api/planning/user/${this.currentUserId}/week/${dateStr}`);
            
            if (data) {
                this.planningData = data;
                this.renderPlanning();
            } else {
                throw new Error('Aucune donnée de planning trouvée');
            }
        } catch (error) {
            console.error('Erreur:', error);
            showAlert('Erreur lors du chargement du planning', 'danger');
        } finally {
            showLoading(false);
        }
    }

    renderPlanning() {
        if (!this.planningData) return;
        
        this.hideStates();
        document.getElementById('planningContent').style.display = 'block';
        
        this.renderWeekSummary();
        this.renderPlanningGrid();
    }
    
    renderWeekSummary() {
        const summary = this.planningData.week_summary;
        
        document.getElementById('totalHours').textContent = `${summary.total_planned_hours}h`;
        document.getElementById('availableHours').textContent = `${summary.total_effective_hours}h`;
        document.getElementById('absenceHours').textContent = `${summary.total_absence_hours}h`;
        document.getElementById('totalActions').textContent = summary.total_actions;
        document.getElementById('overloadedDays').textContent = summary.overloaded_days;
        
        const workloadPercent = summary.total_effective_hours > 0 
            ? Math.round((summary.total_planned_hours / summary.total_effective_hours) * 100)
            : 0;
        document.getElementById('workloadPercent').textContent = `${workloadPercent}%`;
    }

    renderPlanningGrid() {
        const grid = document.getElementById('planningGrid');
        grid.innerHTML = '';
        
        // Filtrer uniquement les jours travaillés (pas les week-ends ni jours fermés)
        const workingDays = this.planningData.days.filter(day => {
            const status = this.getDayStatus(day);
            // Exclure les jours fermés (week-ends, jours fériés, congés, etc.)
            return day.is_working_day && status.text !== 'Fermé';
        });
        
        workingDays.forEach((day, index) => {
            const dayElement = this.createDayElement(day);
            dayElement.classList.add('fade-in');
            dayElement.style.animationDelay = `${index * 0.1}s`;
            grid.appendChild(dayElement);
        });
    }

    createDayElement(day) {
        const dayDiv = document.createElement('div');
        dayDiv.className = `planning-day ${day.is_working_day ? '' : 'non-working'}`;
        dayDiv.dataset.date = day.date;
        
        // Header
        const header = document.createElement('div');
        header.className = 'planning-day-header';
        
        const nameDiv = document.createElement('div');
        nameDiv.innerHTML = `
            <div class="planning-day-name">${day.day_name}</div>
            <div class="planning-day-date">${this.formatDate(new Date(day.date))}</div>
        `;
        
        const infoDiv = document.createElement('div');
        infoDiv.className = 'planning-day-info';
        
        // Status badge
        const status = this.getDayStatus(day);
        const statusBadge = document.createElement('span');
        statusBadge.className = `day-status ${status.class}`;
        statusBadge.textContent = status.text;
        
        // Action count
        if (day.actions_count > 0) {
            const actionBadge = document.createElement('span');
            actionBadge.className = 'action-count';
            actionBadge.textContent = `${day.actions_count} action${day.actions_count > 1 ? 's' : ''}`;
            infoDiv.appendChild(actionBadge);
        }
        
        // Exception indicator
        if (day.exception) {
            const excIndicator = document.createElement('span');
            excIndicator.className = `exception-indicator ${day.exception.type}`;
            excIndicator.innerHTML = `<i class="bi bi-info-circle"></i> ${this.getExceptionText(day.exception)}`;
            infoDiv.appendChild(excIndicator);
        }
        
        infoDiv.appendChild(statusBadge);
        
        header.appendChild(nameDiv);
        header.appendChild(infoDiv);
        
        // Body with workload bar
        const body = document.createElement('div');
        body.className = 'planning-day-body';
        
        const workloadBar = this.createWorkloadBar(day);
        body.appendChild(workloadBar);
        
        // Hours info
        const hoursInfo = document.createElement('div');
        hoursInfo.className = 'workload-hours';
        hoursInfo.textContent = `${day.planned_hours}h planifiées / ${day.effective_hours}h disponibles`;
        body.appendChild(hoursInfo);
        
        dayDiv.appendChild(header);
        dayDiv.appendChild(body);
        
        // Event listeners
        this.setupDayEventListeners(dayDiv, day);
        
        return dayDiv;
    }

    createWorkloadBar(day) {
        const bar = document.createElement('div');
        bar.className = 'workload-bar';
        bar.dataset.day = JSON.stringify(day);
        
        const progress = document.createElement('div');
        progress.className = 'workload-progress';
        
        if (!day.is_working_day) {
            // Vraiment un jour non travaillé (week-end, férié)
            const segment = document.createElement('div');
            segment.className = 'workload-segment workload-free';
            segment.style.height = '100%';
            segment.textContent = 'Non travaillé';
            progress.appendChild(segment);
        } else {
            // Calculate segments for vertical orientation - one segment per action
            const totalHeight = 100;
            // S'assurer que baseHours inclut les heures d'absence si nécessaire
            const baseHours = Math.max(day.available_hours, day.planned_hours, day.absence_hours || 0);
            let usedHeight = 0;
            
            // Create individual segments for each action (trier par statut pour affichage cohérent)
            if (day.actions && day.actions.length > 0) {
                // Trier les actions : completed d'abord (vert), puis in_progress/pending (orange)
                const sortedActions = [...day.actions].sort((a, b) => {
                    const statusOrder = { 'completed': 0, 'in_progress': 1, 'pending': 2 };
                    return statusOrder[a.status] - statusOrder[b.status];
                });
                
                sortedActions.forEach((action, index) => {
                    const actionHours = action.distributed_hours || action.estimated_duration || 0;
                    const actionHeight = (actionHours / baseHours) * totalHeight;
                    
                    if (actionHeight > 0) {
                        const segment = this.createActionSegment(action, actionHeight, index);
                        progress.appendChild(segment);
                        usedHeight += actionHeight;
                        
                        // Debug: vérifier les couleurs
                        console.log(`🎨 Action ${action.id}: ${action.status} (${actionHours}h)`);
                    }
                });
            }
            
            // Add absence segment if present
            if (day.absence_hours > 0) {
                const absenceHeight = (day.absence_hours / baseHours) * totalHeight;
                const segment = this.createWorkloadSegment('absence', absenceHeight, 'Absence');
                progress.appendChild(segment);
                usedHeight += absenceHeight;
                
                // Debug pour les jours d'absence
                console.log(`🔴 Absence ${day.day_name}:`, {
                    absence_hours: day.absence_hours,
                    baseHours: baseHours,
                    absenceHeight: absenceHeight.toFixed(1) + '%',
                    planned_hours: day.planned_hours
                });
            }
            
            // Add free time segment (seulement si pas 100% absence)
            const freeHeight = Math.max(0, totalHeight - usedHeight);
            if (freeHeight > 2 && day.absence_hours < day.available_hours) { // Only show if significant and not full absence
                const segment = this.createWorkloadSegment('free', freeHeight, 'Libre');
                progress.appendChild(segment);
            }
            
            // Overload indicator
            if (day.is_overloaded) {
                const overloadHeight = ((day.planned_hours - day.effective_hours) / baseHours) * totalHeight;
                const segment = this.createWorkloadSegment('overload', overloadHeight, `+${(day.planned_hours - day.effective_hours).toFixed(1)}h`);
                progress.appendChild(segment);
            }
        }
        
        // Add label
        const label = document.createElement('div');
        label.className = 'workload-label';
        label.textContent = `${day.planned_hours}h / ${day.effective_hours}h`;
        bar.appendChild(progress);
        bar.appendChild(label);
        
        // Debug log pour le développement (désactivé)
        // if (day.planned_hours > 0) {
        //     console.log(`${day.day_name}: ${day.planned_hours}h planifiées (${day.actions_count} actions)`);
        // }
        
        return bar;
    }

    createWorkloadSegment(type, height, text) {
        const segment = document.createElement('div');
        segment.className = `workload-segment workload-${type}`;
        segment.style.height = `${Math.max(height, 1)}%`; // Minimum 1% height for vertical
        if (height > 8) { // Only show text if segment is tall enough
            segment.textContent = text;
        }
        return segment;
    }

    createActionSegment(action, height, index) {
        const segment = document.createElement('div');
        
        // Normaliser le statut et ajouter fallback
        let normalizedStatus = action.status || 'pending';
        const validStatuses = ['completed', 'in_progress', 'pending'];
        if (!validStatuses.includes(normalizedStatus)) {
            console.warn(`⚠️ Statut d'action non reconnu: "${action.status}" pour action ${action.id}. Fallback vers 'pending'.`);
            normalizedStatus = 'pending';
        }
        
        segment.className = `workload-segment workload-action workload-${normalizedStatus}`;
        segment.style.height = `${Math.max(height, 1)}%`;
        segment.dataset.actionId = action.id;
        segment.dataset.actionIndex = index;
        
        // Ajouter un indicateur si l'action est une continuation
        if (action.is_continuation) {
            segment.classList.add('action-continuation');
        }

        // Forcer les couleurs via style inline pour éviter les problèmes CSS
        const colorMap = {
            'completed': {
                background: 'linear-gradient(to top, #059669, #10b981, #34d399)',
                boxShadow: 'inset 0 2px 4px rgba(5, 150, 105, 0.3)'
            },
            'in_progress': {
                background: 'linear-gradient(to top, #d97706, #f59e0b, #fbbf24)',
                boxShadow: 'inset 0 2px 4px rgba(217, 119, 6, 0.3)'
            }, 
            'pending': {
                background: 'linear-gradient(to top, #d97706, #f59e0b, #fbbf24)',
                boxShadow: 'inset 0 2px 4px rgba(217, 119, 6, 0.3)'
            }
        };
        
        if (colorMap[normalizedStatus]) {
            segment.style.background = colorMap[normalizedStatus].background;
            segment.style.boxShadow = colorMap[normalizedStatus].boxShadow;
        }
        
        // Add action separator border (except for first action)
        if (index > 0) {
            segment.style.borderTop = '2px solid rgba(255, 255, 255, 0.9)';
            segment.style.boxShadow = 'inset 0 2px 0 rgba(255, 255, 255, 0.2)';
        }
        
        // Add text only if segment is tall enough (no numbers, just hours)
        const actionHours = action.distributed_hours || action.estimated_duration || 0;
        if (height > 15) {
            segment.innerHTML = `
                <div class="action-segment-content">
                    <span class="action-hours">${actionHours}h</span>
                </div>
            `;
        }
        
        // Add tooltip with action details
        segment.title = `Action #${action.id}: ${action.title || 'Action'} (${actionHours}h)`;
        
        // Add click event to show action details
        segment.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showActionDetail(action);
        });
        
        return segment;
    }

    setupDayEventListeners(dayElement, day) {
        const workloadBar = dayElement.querySelector('.workload-bar');
        
        // Hover events for tooltip
        workloadBar.addEventListener('mouseenter', (e) => this.showTooltip(e, day));
        workloadBar.addEventListener('mouseleave', () => this.hideTooltip());
        
        // Click events for day detail modal
        workloadBar.addEventListener('click', () => this.showDayDetail(day));
    }

    showTooltip(event, day) {
        if (day.actions.length === 0 && day.absence_hours === 0) return;
        
        let content = `
            <div class="tooltip-title">${day.day_name} ${this.formatDate(new Date(day.date))}</div>
            <div><strong>${day.planned_hours}h planifiées / ${day.effective_hours}h disponibles</strong></div>
        `;
        
        if (day.absence_hours > 0) {
            content += `<div style="color: #fbbf24;">🚫 ${day.absence_hours}h d'absence</div>`;
        }
        
        if (day.actions.length > 0) {
            content += '<div style="margin-top: 8px;"><strong>Actions:</strong></div>';
            day.actions.forEach(action => {
                const statusIcon = {
                    'completed': '✅',
                    'in_progress': '🟡',
                    'pending': '⏳'
                }[action.status] || '⏳';
                
                // Afficher heures distribuées si différente de la durée totale
                let hoursDisplay = `${action.distributed_hours || action.estimated_duration}h`;
                if (action.is_distributed && action.distributed_hours !== action.estimated_duration) {
                    hoursDisplay += ` / ${action.estimated_duration}h total`;
                }
                
                content += `
                    <div class="tooltip-action">
                        <span>${statusIcon} #${action.number} - ${action.title}</span>
                        <span>${hoursDisplay}</span>
                    </div>
                `;
            });
        }
        
        if (day.is_overloaded) {
            content += `<div style="color: #ef4444; margin-top: 8px;">⚠️ Surchargé de ${(day.planned_hours - day.effective_hours).toFixed(1)}h</div>`;
        }
        
        content += '<div class="tooltip-footer">📅 Cliquez pour plus de détails</div>';
        
        this.tooltip.innerHTML = content;
        this.tooltip.classList.add('show');
        this.updateTooltipPosition(event);
    }

    hideTooltip() {
        this.tooltip.classList.remove('show');
    }

    updateTooltipPosition(event) {
        if (!this.tooltip.classList.contains('show')) return;
        
        const rect = this.tooltip.getBoundingClientRect();
        const x = event.clientX + 10;
        const y = event.clientY - rect.height - 10;
        
        // Prevent tooltip from going off-screen
        const maxX = window.innerWidth - rect.width - 20;
        const maxY = window.innerHeight - rect.height - 20;
        
        this.tooltip.style.left = `${Math.min(x, maxX)}px`;
        this.tooltip.style.top = `${Math.max(y, 10)}px`;
    }

    showDayDetail(day) {
        // Stocker le jour courant pour pouvoir l'utiliser dans addAction
        this.currentDay = day;
        
        document.getElementById('modalDayTitle').textContent = 
            `${day.day_name} ${this.formatDate(new Date(day.date))} - ${this.planningData.username}`;
        
        let content = `
            <div class="row mb-3">
                <div class="col-md-6">
                    <h6><i class="bi bi-clock me-2"></i>Horaires</h6>
                    <p class="mb-0">Disponibles: ${day.available_hours}h</p>
                    <p class="mb-0">Effectives: ${day.effective_hours}h</p>
                    ${day.absence_hours > 0 ? `<p class="text-warning mb-0">Absence: ${day.absence_hours}h</p>` : ''}
                </div>
                <div class="col-md-6">
                    <h6><i class="bi bi-bar-chart me-2"></i>Charge de travail</h6>
                    <p class="mb-0">Planifiées: ${day.planned_hours}h</p>
                    <p class="mb-0 ${day.is_overloaded ? 'text-danger' : 'text-success'}">
                        ${day.is_overloaded ? '⚠️ Surchargé' : '✅ Équilibré'}
                    </p>
                </div>
            </div>
        `;
        
        if (day.exception) {
            content += `
                <div class="alert alert-warning">
                    <h6><i class="bi bi-info-circle me-2"></i>Exception</h6>
                    <p class="mb-0">${this.getExceptionText(day.exception)}</p>
                    ${day.exception.description ? `<p class="mb-0"><em>${day.exception.description}</em></p>` : ''}
                </div>
            `;
        }
        
        if (day.actions.length > 0) {
            content += '<h6><i class="bi bi-list-task me-2"></i>Actions planifiées</h6>';
            day.actions.forEach(action => {
                content += this.createActionCard(action);
            });
        } else {
            content += '<div class="text-center text-muted py-3">Aucune action planifiée</div>';
        }
        
        document.getElementById('dayDetailContent').innerHTML = content;
        
        // Setup action click handlers
        day.actions.forEach(action => {
            const card = document.querySelector(`[data-action-id="${action.id}"]`);
            if (card) {
                card.addEventListener('click', () => this.showActionDetail(action));
            }
        });
        
        this.modals.dayDetail.show();
    }

    createActionCard(action) {
        const statusInfo = {
            'completed': { icon: 'check-circle-fill', class: 'success', text: 'Terminée' },
            'in_progress': { icon: 'clock-fill', class: 'warning', text: 'En cours' },
            'pending': { icon: 'circle', class: 'secondary', text: 'En attente' }
        }[action.status] || { icon: 'circle', class: 'secondary', text: 'En attente' };
        
        const priorityInfo = {
            1: { class: 'priority-1', text: 'Haute' },
            2: { class: 'priority-2', text: 'Moyenne' },
            3: { class: 'priority-3', text: 'Basse' }
        }[action.priority] || { class: 'priority-3', text: 'Basse' };
        
        // Affichage des heures (distribuées vs totales)
        let hoursDisplay = `${action.distributed_hours || action.estimated_duration}h`;
        if (action.is_distributed && action.distributed_hours !== action.estimated_duration) {
            hoursDisplay += ` <small class="text-muted">(${action.estimated_duration}h total)</small>`;
        }
        
        return `
            <div class="action-card" data-action-id="${action.id}" style="cursor: pointer;">
                <div class="action-header">
                    <h6 class="action-title">${action.title}</h6>
                    <span class="action-number">#${action.number}</span>
                </div>
                <div class="action-details">
                    <div class="action-detail">
                        <i class="bi bi-${statusInfo.icon} text-${statusInfo.class}"></i>
                        ${statusInfo.text}
                    </div>
                    <div class="action-detail">
                        <i class="bi bi-clock"></i>
                        ${hoursDisplay}
                    </div>
                    ${action.location ? `
                        <div class="action-detail">
                            <i class="bi bi-geo-alt"></i>
                            ${action.location}
                        </div>
                    ` : ''}
                    <span class="priority-badge ${priorityInfo.class}">
                        ${priorityInfo.text}
                    </span>
                    ${action.is_distributed ? `
                        <div class="action-detail">
                            <i class="bi bi-calendar-range text-info"></i>
                            <small>Action répartie</small>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    showActionDetail(action) {
        // Close day modal first
        this.modals.dayDetail.hide();
        
        // Set current action for edit button
        this.currentAction = action;
        
        document.getElementById('actionModalTitle').textContent = `Action #${action.number}`;
        
        const statusInfo = {
            'completed': { icon: 'check-circle-fill', class: 'success', text: 'Terminée' },
            'in_progress': { icon: 'clock-fill', class: 'warning', text: 'En cours' },
            'pending': { icon: 'circle', class: 'secondary', text: 'En attente' }
        }[action.status] || { icon: 'circle', class: 'secondary', text: 'En attente' };
        
        const priorityInfo = {
            1: { class: 'text-danger', text: 'Haute' },
            2: { class: 'text-warning', text: 'Moyenne' },
            3: { class: 'text-info', text: 'Basse' }
        }[action.priority] || { class: 'text-info', text: 'Basse' };
        
        const content = `
            <div class="row">
                <div class="col-12">
                    <h5>${action.title}</h5>
                    <hr>
                </div>
            </div>
            <div class="row mb-3">
                <div class="col-md-6">
                    <strong>Statut:</strong><br>
                    <i class="bi bi-${statusInfo.icon} text-${statusInfo.class} me-1"></i>
                    ${statusInfo.text}
                </div>
                <div class="col-md-6">
                    <strong>Priorité:</strong><br>
                    <span class="${priorityInfo.class}">${priorityInfo.text}</span>
                </div>
            </div>
            <div class="row mb-3">
                <div class="col-md-6">
                    <strong>Durée estimée:</strong><br>
                    ${action.estimated_duration}h
                </div>
                ${action.location ? `
                    <div class="col-md-6">
                        <strong>Lieu:</strong><br>
                        ${action.location ? 
                            (typeof action.location === 'object' ? action.location.name : action.location) 
                            : 'Aucun lieu spécifié'}
                    </div>
                ` : ''}
            </div>
            <div class="row mb-3">
                <div class="col-12">
                    <strong>Date planifiée:</strong><br>
                    ${this.formatDate(new Date(action.planned_date))}
                </div>
            </div>
            ${action.completion_date ? `
                <div class="row mb-3">
                    <div class="col-12">
                        <strong>Date de fin:</strong><br>
                        ${this.formatDate(new Date(action.completion_date))}
                    </div>
                </div>
            ` : ''}
            ${action.comments ? `
                <div class="row mb-3">
                    <div class="col-12">
                        <strong>Commentaires:</strong><br>
                        <div class="text-muted">${action.comments}</div>
                    </div>
                </div>
            ` : ''}
        `;
        
        document.getElementById('actionDetailContent').innerHTML = content;
        
        // Setup edit button to redirect to actions page
        const editBtn = document.getElementById('editActionBtn');
        editBtn.onclick = () => this.goToActionEdit(action);
        
        this.modals.actionDetail.show();
    }
    
    /**
     * Redirige vers la page d'édition de l'action
     */
    goToActionEdit(action) {
        // Fermer la modal
        this.modals.actionDetail.hide();
        
        // Construire l'URL vers la page actions avec l'ID de l'action
        const actionsUrl = `actions.html?action_id=${action.id}`;
        
        // Rediriger vers la page
        window.location.href = actionsUrl;
    }

    // Utility methods
    getDayStatus(day) {
        if (!day.is_working_day) return { class: 'off', text: 'Fermé' };
        if (day.absence_hours > 0 && day.planned_hours === 0) return { class: 'absence', text: 'Absence' };
        if (day.planned_hours === 0) return { class: 'free', text: 'Libre' };
        if (day.is_overloaded) return { class: 'overloaded', text: 'Surchargé' };
        if (day.workload_percentage > 80) return { class: 'busy', text: 'Chargé' };
        return { class: 'normal', text: 'Normal' };
    }

    getExceptionText(exception) {
        const types = {
            'holiday': 'Jour férié',
            'vacation': 'Congé',
            'sick': 'Maladie',
            'training': 'Formation',
            'other': 'Autre'
        };
        return types[exception.type] || exception.type;
    }

    getMonday(date) {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
        return new Date(d.setDate(diff));
    }

    getWeekNumber(date) {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    }

    formatDate(date) {
        return date.toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    }

    formatDateISO(date) {
        return date.toISOString().split('T')[0];
    }

    hideStates() {
        document.getElementById('loadingState').style.display = 'none';
        document.getElementById('planningContent').style.display = 'none';
        document.getElementById('noDataState').style.display = 'none';
    }

    showNoDataState() {
        this.hideStates();
        document.getElementById('noDataState').style.display = 'block';
    }

    addAction() {
        // Vérifier qu'on a les données nécessaires
        if (!this.currentDay || !this.currentUserId) {
            showAlert('Erreur: impossible de créer une action sans sélectionner un jour et un utilisateur', 'error');
            return;
        }
        
        // Vérifier les permissions
        const authManager = new AuthManager();
        const user = authManager.getUser();
        if (!user || user.role === 'pilot' || user.role === 'observer') {
            showAlert('Vous n\'êtes pas autorisé à créer des actions', 'error');
            return;
        }
        
        // Fermer la modal de détail du jour
        this.modals.dayDetail.hide();
        
        // Créer une instance de ActionForm si elle n'existe pas
        if (!window.actionForm) {
            window.actionForm = new ActionForm();
        }
        
        // Ouvrir le formulaire pour une nouvelle action (null = nouvelle action)
        window.actionForm.show(null);
        
        // Attendre que le formulaire soit complètement ouvert puis pré-remplir les champs
        // Utiliser un délai plus long et vérifier que la modal existe
        setTimeout(() => {
            const modal = document.querySelector('#actionModal');
            if (modal && modal.classList.contains('show')) {
                console.log('[PLANNING] Modal détectée, attente du chargement des utilisateurs...');
                this.waitForUsersAndPrefill();
            } else {
                console.log('[PLANNING] Modal pas encore prête, nouvelle tentative...');
                // Deuxième tentative après 500ms supplémentaires
                setTimeout(() => {
                    this.waitForUsersAndPrefill();
                }, 500);
            }
        }, 1000); // Augmenté à 1 seconde
    }
    
    /**
     * Attend que les utilisateurs soient chargés puis pré-remplit le formulaire
     */
    async waitForUsersAndPrefill() {
        let attempts = 0;
        const maxAttempts = 10;
        
        const checkAndFill = () => {
            const assignedUserField = document.getElementById('actionAssignedTo');
            
            // Vérifier si les utilisateurs sont chargés (il y a plus d'une option et pas de "Chargement")
            if (assignedUserField && assignedUserField.options.length > 1) {
                const firstOptionText = assignedUserField.options[0].text;
                if (!firstOptionText.includes('Chargement')) {
                    console.log('[PLANNING] Utilisateurs chargés, pré-remplissage...');
                    this.prefillActionForm();
                    return;
                }
            }
            
            attempts++;
            if (attempts < maxAttempts) {
                console.log(`[PLANNING] Tentative ${attempts}/${maxAttempts}, attente du chargement des utilisateurs...`);
                setTimeout(checkAndFill, 300); // Vérifier toutes les 300ms
            } else {
                console.warn('[PLANNING] Timeout : pré-remplissage sans attendre les utilisateurs');
                this.prefillActionForm();
            }
        };
        
        checkAndFill();
    }
    
    /**
     * Pré-remplit le formulaire d'action avec les données du jour sélectionné
     */
    prefillActionForm() {
        if (!this.currentDay) return;
        
        console.log('[PLANNING] Pré-remplissage du formulaire avec:', this.currentDay);
        
        try {
            // 1. Utilisateur assigné (utiliser le bon ID)
            const assignedUserField = document.getElementById('actionAssignedTo');
            if (assignedUserField) {
                assignedUserField.value = this.currentUserId;
                assignedUserField.dispatchEvent(new Event('change'));
                console.log('[PLANNING] Utilisateur assigné:', this.currentUserId);
            } else {
                console.warn('[PLANNING] Champ actionAssignedTo non trouvé');
            }
            
            // 2. Date planifiée (utiliser le bon ID)
            const plannedDateField = document.getElementById('actionPlannedDate');
            if (plannedDateField) {
                plannedDateField.value = this.currentDay.date;
                // Déclencher les événements pour mettre à jour la date de fin
                plannedDateField.dispatchEvent(new Event('change'));
                plannedDateField.dispatchEvent(new Event('input'));
                console.log('[PLANNING] Date planifiée:', this.currentDay.date);
            } else {
                console.warn('[PLANNING] Champ actionPlannedDate non trouvé');
            }
            
            // 3. Ne pas pré-remplir la durée - laissée vide pour que l'utilisateur décide
            // (La durée dépend de la nature spécifique de l'action à créer)
            
            // 4. Ne pas pré-remplir la priorité - laissée au choix de l'utilisateur
            // (La priorité dépend de l'urgence spécifique de l'action)
            
            // 5. Ne pas pré-remplir les commentaires - laissés vides pour l'utilisateur
            // (Les commentaires doivent être spécifiques à l'action créée)
            
            // 6. Toast de confirmation
            showAlert(`Formulaire ouvert pour ${this.currentDay.day_name} ${this.formatDate(new Date(this.currentDay.date))}`, 'success');
            
        } catch (error) {
            console.error('[PLANNING] Erreur lors du pré-remplissage:', error);
            showAlert('Formulaire ouvert (certains champs peuvent nécessiter une vérification)', 'warning');
        }
    }

    editAction() {
        if (this.currentAction) {
            window.location.href = `actions.html?edit=${this.currentAction.id}`;
        }
    }
    
    /**
     * Affiche le picker d'actions à planifier
     */
    async showActionPicker() {
        if (!this.currentDay || !this.currentUserId) {
            showAlert('Erreur: impossible d\'ouvrir le picker sans sélectionner un jour et un utilisateur', 'error');
            return;
        }
        
        // Vérifier les permissions
        const authManager = new AuthManager();
        const user = authManager.getUser();
        if (!user || user.role === 'pilot' || user.role === 'observer') {
            showAlert('Vous n\'êtes pas autorisé à planifier des actions', 'error');
            return;
        }
        
        // Fermer la modal de détail du jour
        this.modals.dayDetail.hide();
        
        // Mettre à jour le texte du jour cible
        const targetDayText = document.getElementById('targetDayText');
        if (targetDayText) {
            targetDayText.textContent = `${this.currentDay.day_name} ${this.formatDate(new Date(this.currentDay.date))}`;
        }
        
        // Ouvrir la modal picker
        const pickerModal = new bootstrap.Modal(document.getElementById('actionPickerModal'));
        pickerModal.show();
        
        // Charger les actions à planifier
        await this.loadActionsToSchedule();
    }
    
    /**
     * Charge les actions à planifier (priorité 4)
     */
    async loadActionsToSchedule() {
        const loadingDiv = document.getElementById('actionPickerLoading');
        const emptyDiv = document.getElementById('actionPickerEmpty');
        const gridDiv = document.getElementById('actionPickerGrid');
        const countBadge = document.getElementById('actionCount');
        
        // Afficher le loading
        loadingDiv.style.display = 'block';
        emptyDiv.style.display = 'none';
        gridDiv.style.display = 'none';
        
        try {
            // Récupérer TOUTES les actions avec priorité 4 (À planifier)
            const response = await this.apiService.getActions({
                priority: 4,
                status: 'pending'
                // Pas de limite - on récupère tout
            });
            
            this.allActions = response.items || response || [];
            
            // Masquer le loading
            loadingDiv.style.display = 'none';
            
            if (this.allActions.length === 0) {
                // Aucune action à planifier
                emptyDiv.style.display = 'block';
                countBadge.textContent = '0 actions';
            } else {
                // Afficher toutes les actions directement
                this.renderActionCards(this.allActions);
                
                gridDiv.style.display = 'block';
                countBadge.textContent = `${this.allActions.length} action${this.allActions.length > 1 ? 's' : ''}`;
            }
            
        } catch (error) {
            console.error('[PLANNING] Erreur lors du chargement des actions à planifier:', error);
            loadingDiv.style.display = 'none';
            emptyDiv.style.display = 'block';
            emptyDiv.innerHTML = `
                <i class="bi bi-exclamation-triangle display-1 text-danger"></i>
                <h5 class="mt-3 text-danger">Erreur de chargement</h5>
                <p class="text-muted">Impossible de charger les actions à planifier.</p>
            `;
            showAlert('Erreur lors du chargement des actions à planifier', 'error');
        }
    }
    

    
    /**
     * Génère les cards d'actions dans la grille
     */
    renderActionCards(actions) {
        const gridDiv = document.getElementById('actionPickerGrid');
        
        // Afficher le grid et nettoyer le contenu
        gridDiv.style.display = 'block';
        gridDiv.innerHTML = '';
        
        // Masquer les états de chargement/vide
        const loadingDiv = document.getElementById('actionPickerLoading');
        const emptyDiv = document.getElementById('actionPickerEmpty');
        if (loadingDiv) loadingDiv.style.display = 'none';
        if (emptyDiv) emptyDiv.style.display = 'none';
        
        // Génération du HTML des cartes
        let htmlContent = '';
        actions.forEach((action, index) => {
            htmlContent += this.createActionCardHTML(action, index);
        });
        
        gridDiv.innerHTML = htmlContent;
        
        // Attacher les event listeners après insertion
        actions.forEach((action) => {
            const card = gridDiv.querySelector(`[data-action-id="${action.id}"]`);
            if (card) {
                card.addEventListener('click', () => this.showActionPickerDetail(action));
            }
        });
    }
    
    /**
     * Crée une card d'action pour le picker avec layout en colonnes
     */
    createActionCardHTML(action, index) {
        // Titre (limité à 2 lignes)
        const title = action.title || 'Action sans titre';
        
        // Lieu - gérer le cas où c'est un objet ou une string
        let location = 'Aucun lieu';
        if (action.location) {
            if (typeof action.location === 'object' && action.location.name) {
                location = action.location.name;
            } else if (typeof action.location === 'string') {
                location = action.location;
            }
        }
        
        return `
            <div class="action-picker-card position-relative" data-action-id="${action.id}" style="animation-delay: ${index * 0.05}s;">
                <div class="action-picker-number">#${action.number}</div>
                <div class="action-picker-title">${title}</div>
                <div class="action-picker-location">
                    <i class="bi bi-geo-alt"></i>
                    ${location}
                </div>
            </div>
        `;
    }


    
    /**
     * Affiche le détail d'une action du picker
     */
    showActionPickerDetail(action) {
        this.selectedAction = action;
        
        // Mettre à jour le titre
        const titleElement = document.getElementById('pickerActionTitle');
        if (titleElement) {
            titleElement.textContent = `Action #${action.number}`;
        }
        
        // Générer le contenu détaillé
        const contentDiv = document.getElementById('pickerActionContent');
        if (contentDiv) {
            contentDiv.innerHTML = this.generateActionDetailHtml(action);
        }
        
        // Ouvrir la modal de détail
        const detailModal = new bootstrap.Modal(document.getElementById('actionDetailPickerModal'));
        detailModal.show();
        
        // Attacher les event listeners pour tous les boutons
        this.setupDetailModalListeners();
        
        // Charger le compteur de photos
        this.loadPhotoCount(action.id);
    }
    
    /**
     * Configure les event listeners pour le modal de détail
     */
    setupDetailModalListeners() {
        // Bouton de planification
        const planBtn = document.getElementById('planThisActionBtn');
        if (planBtn) {
            planBtn.replaceWith(planBtn.cloneNode(true));
            const newPlanBtn = document.getElementById('planThisActionBtn');
            newPlanBtn.addEventListener('click', () => this.planSelectedAction());
        }
        
        // Bouton photos
        const viewPhotosBtn = document.getElementById('viewPhotosBtn');
        if (viewPhotosBtn) {
            viewPhotosBtn.replaceWith(viewPhotosBtn.cloneNode(true));
            const newViewPhotosBtn = document.getElementById('viewPhotosBtn');
            newViewPhotosBtn.addEventListener('click', () => {
                if (this.selectedAction && window.photoManager) {
                    window.photoManager.show(this.selectedAction.id);
                }
            });
        }
        
        // Bouton sauvegarder
        const saveBtn = document.getElementById('saveChangesBtn');
        if (saveBtn) {
            saveBtn.replaceWith(saveBtn.cloneNode(true));
            const newSaveBtn = document.getElementById('saveChangesBtn');
            newSaveBtn.addEventListener('click', () => this.saveActionChanges());
        }
        
        // Input durée - détection des changements
        const durationInput = document.getElementById('durationInput');
        if (durationInput) {
            durationInput.addEventListener('input', () => this.onDurationChange());
        }
    }
    
    /**
     * Gère les changements de durée
     */
    onDurationChange() {
        const saveBtn = document.getElementById('saveChangesBtn');
        if (saveBtn) {
            saveBtn.style.display = 'block';
        }
    }
    
    /**
     * Sauvegarde les modifications de l'action
     */
    async saveActionChanges() {
        if (!this.selectedAction) return;
        
        const durationInput = document.getElementById('durationInput');
        const newDuration = parseFloat(durationInput.value);
        
        if (!newDuration || newDuration < 0.5) {
            showAlert('Veuillez saisir une durée valide (minimum 0,5h)', 'warning');
            return;
        }
        
        try {
            const updateData = {
                estimated_duration: newDuration
            };
            
            const response = await this.apiService.request(`/actions/${this.selectedAction.id}`, {
                method: 'PUT',
                body: JSON.stringify(updateData)
            });
            
            if (response) {
                // Mettre à jour l'action locale
                this.selectedAction.estimated_duration = newDuration;
                
                // Masquer le bouton sauvegarder
                const saveBtn = document.getElementById('saveChangesBtn');
                if (saveBtn) {
                    saveBtn.style.display = 'none';
                }
                
                showAlert('Durée mise à jour avec succès', 'success');
            }
            
        } catch (error) {
            console.error('[PLANNING] Erreur lors de la sauvegarde:', error);
            showAlert('Erreur lors de la sauvegarde', 'error');
        }
    }
    
    /**
     * Charge le nombre de photos pour une action
     */
    async loadPhotoCount(actionId) {
        try {
            const response = await this.apiService.request(`/actions/${actionId}/photos`);
            const photoCount = response ? response.length : 0;
            
            const photoCountElement = document.getElementById('photoCount');
            if (photoCountElement) {
                if (photoCount === 0) {
                    photoCountElement.textContent = 'Aucune photo';
                    photoCountElement.className = 'text-muted';
                } else {
                    photoCountElement.textContent = `${photoCount} photo${photoCount > 1 ? 's' : ''}`;
                    photoCountElement.className = 'text-info';
                }
            }
        } catch (error) {
            console.error('[PLANNING] Erreur lors du chargement du compteur de photos:', error);
            const photoCountElement = document.getElementById('photoCount');
            if (photoCountElement) {
                photoCountElement.textContent = 'Erreur de chargement';
                photoCountElement.className = 'text-warning';
            }
        }
    }
    
    /**
     * Génère le HTML de détail d'une action
     */
    generateActionDetailHtml(action) {
        const priorityInfo = {
            1: { class: 'text-danger', text: 'Haute' },
            2: { class: 'text-warning', text: 'Moyenne' },
            3: { class: 'text-info', text: 'Basse' },
            4: { class: 'text-secondary', text: 'À planifier' }
        }[action.priority] || { class: 'text-secondary', text: 'À planifier' };
        
        return `
            <div class="row">
                <div class="col-12">
                    <h5>${action.title}</h5>
                    <hr>
                </div>
            </div>
            <div class="row mb-3">
                <div class="col-md-6">
                    <strong>Priorité:</strong><br>
                    <select id="prioritySelect" class="form-select form-select-sm">
                        <option value="1" ${action.priority === 1 ? 'selected' : ''}>Haute</option>
                        <option value="2" ${action.priority === 2 || action.priority === 4 ? 'selected' : ''}>Moyenne</option>
                        <option value="3" ${action.priority === 3 ? 'selected' : ''}>Basse</option>
                    </select>
                </div>
                <div class="col-md-6">
                    <strong>Durée estimée:</strong><br>
                    <div class="d-flex align-items-center gap-2">
                        <input type="number" 
                               id="durationInput" 
                               class="form-control form-control-sm" 
                               value="${action.estimated_duration || ''}" 
                               placeholder="Heures" 
                               step="0.5" 
                               min="0.5" 
                               max="24"
                               style="width: 80px;">
                        <span class="text-muted">heures</span>
                    </div>
                </div>
            </div>
            <div class="row mb-3">
                <div class="col-md-6">
                    <strong>Lieu:</strong><br>
                    ${action.location ? 
                        (typeof action.location === 'object' ? action.location.name : action.location) 
                        : 'Aucun lieu spécifié'}
                </div>
                <div class="col-md-6">
                    <strong>Assigné à:</strong><br>
                    ${action.assigned_user ? action.assigned_user.username : 'Non assigné'}
                </div>
            </div>
            ${action.comments ? `
                <div class="row mb-3">
                    <div class="col-12">
                        <strong>Commentaires:</strong><br>
                        <div class="p-2 bg-light rounded">${action.comments}</div>
                    </div>
                </div>
            ` : ''}
            ${action.resource_needs ? `
                <div class="row mb-3">
                    <div class="col-12">
                        <strong>Besoins ressources:</strong><br>
                        <div class="p-2 bg-light rounded">${action.resource_needs}</div>
                    </div>
                </div>
            ` : ''}
            <div class="row mb-3">
                <div class="col-12">
                    <strong>Photos:</strong><br>
                    <div id="photosPreview" class="mt-2">
                        <div class="d-flex align-items-center gap-2">
                            <button type="button" class="btn btn-outline-secondary btn-sm" onclick="window.photoManager?.show(${action.id})">
                                <i class="bi bi-camera-fill me-1"></i>Voir/Gérer les photos
                            </button>
                            <small class="text-muted" id="photoCount">Chargement...</small>
                        </div>
                    </div>
                </div>
            </div>
            <div class="alert alert-info">
                <i class="bi bi-info-circle me-2"></i>
                Cette action sera planifiée pour <strong>${this.currentDay.day_name} ${this.formatDate(new Date(this.currentDay.date))}</strong> 
                et assignée à <strong>${this.getCurrentUserName()}</strong>.
            </div>
        `;
    }
    
    /**
     * Planifie l'action sélectionnée pour le jour courant
     */
    async planSelectedAction() {
        if (!this.selectedAction || !this.currentDay || !this.currentUserId) {
            showAlert('Erreur: données manquantes pour la planification', 'danger');
            return;
        }

        // --- CORRECTION: Récupérer toutes les nouvelles valeurs ---
        const durationInput = document.getElementById('durationInput');
        const prioritySelect = document.getElementById('prioritySelect');
        
        const newDuration = parseFloat(durationInput.value);

        // Validation
        if (!newDuration || newDuration < 0.5) {
            showAlert('Veuillez saisir une durée valide (minimum 0,5h)', 'warning');
            return;
        }
        
        try {
            // Mettre à jour l'action avec toutes les nouvelles données
            const updateData = {
                planned_date: this.currentDay.date,
                assigned_to: this.currentUserId,
                estimated_duration: newDuration,
                priority: parseInt(prioritySelect.value, 10),
                check_status: 'OK' // Mettre à jour le statut Check
            };
            
            console.log("Données envoyées à l'API:", updateData);

            const response = await this.apiService.request(`/actions/${this.selectedAction.id}`, {
                method: 'PUT',
                body: JSON.stringify(updateData)
            });
            
            if (response) {
                // Fermer les modals
                const detailModal = bootstrap.Modal.getInstance(document.getElementById('actionDetailPickerModal'));
                const pickerModal = bootstrap.Modal.getInstance(document.getElementById('actionPickerModal'));
                
                if (detailModal) detailModal.hide();
                if (pickerModal) pickerModal.hide();
                
                // Recharger le planning
                await this.loadPlanning();
                
                showAlert(`Action #${this.selectedAction.number} planifiée avec succès pour ${this.currentDay.day_name}`, 'success');
                
                // Nettoyer les variables
                this.selectedAction = null;
            }
            
        } catch (error) {
            console.error('[PLANNING] Erreur lors de la planification:', error);
            showAlert('Erreur lors de la planification de l\'action', 'error');
        }
    }
    
    /**
     * Retourne le nom de l'utilisateur actuellement sélectionné
     */
    getCurrentUserName() {
        // Trouver l'utilisateur dans la liste des users par son ID
        const user = this.users.find(u => u.id == this.currentUserId);
        return user ? user.username : 'Utilisateur inconnu';
    }
}

// Utility functions
function showLoading(show) {
    const loadingElement = document.getElementById('loadingState');
    if (show) {
        loadingElement.style.display = 'block';
        document.getElementById('planningContent').style.display = 'none';
        document.getElementById('noDataState').style.display = 'none';
    } else {
        loadingElement.style.display = 'none';
    }
}

function showAlert(message, type = 'info') {
    // Create alert element (you can integrate with your existing alert system)
    const alert = document.createElement('div');
    alert.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
    alert.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
    alert.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    document.body.appendChild(alert);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (alert.parentNode) {
            alert.remove();
        }
    }, 5000);
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Verify authentication
    if (!getToken()) {
        window.location.href = 'index.html';
        return;
    }
    
    // Set current user info
    const user = getCurrentUser();
    if (user) {
        document.getElementById('currentUsername').textContent = user.username;
    }
    
    // Initialize planning manager
    window.planningManager = new PlanningManager();
    
    // Initialize ActionForm for creating actions from planning
    window.actionForm = new ActionForm();
}); 
