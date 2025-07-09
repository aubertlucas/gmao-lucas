document.addEventListener('DOMContentLoaded', () => {
    const authManager = new AuthManager();
    const apiService = new ApiService();

    // Elements
    const userSelector = document.getElementById('userSelector');
    const actionsTableBody = document.getElementById('diagnosticActionsTable');
    const statsContainer = document.getElementById('statsContainer');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const currentUserSpan = document.getElementById('currentUser');
    const navConfig = document.getElementById('nav-config');
    const refreshAllBtn = document.getElementById('refreshAllBtn');

    let currentActions = []; // Pour stocker les actions actuellement affichées

    // Check authentication and role
    if (!authManager.isAuthenticated()) {
        window.location.href = 'index.html';
        return;
    }

    const currentUser = authManager.getUser();
    if (currentUser) {
        currentUserSpan.textContent = currentUser.username;
        // Only show config link to admins and managers
        if (currentUser.role !== 'admin' && currentUser.role !== 'manager') {
            navConfig.style.display = 'none';
            // Redirect if not authorized
            window.location.href = 'actions.html';
            return;
        }
    }

    const showLoading = () => loadingOverlay.style.display = 'flex';
    const hideLoading = () => loadingOverlay.style.display = 'none';

    /**
     * Fetches assignable users and populates the selector.
     */
    async function populateUserSelector() {
        try {
            const users = await apiService.getAssignableUsers();
            userSelector.innerHTML = '<option value="">-- Sélectionnez un utilisateur --</option>';
            users.forEach(user => {
                const option = document.createElement('option');
                option.value = user.id;
                option.textContent = user.username;
                userSelector.appendChild(option);
            });
        } catch (error) {
            console.error("Erreur lors du chargement des utilisateurs:", error);
            showToast("Erreur lors du chargement des utilisateurs", 'error');
        }
    }

    /**
     * Fetches and displays actions for the selected user.
     * @param {number} userId The ID of the user.
     */
    async function loadUserActions(userId) {
        if (!userId) {
            actionsTableBody.innerHTML = '';
            statsContainer.innerHTML = '';
            currentActions = [];
            refreshAllBtn.style.display = 'none'; // Cacher le bouton
            return;
        }

        showLoading();
        try {
            // Fetch all actions for the user (using a large limit)
            const actions = await apiService.getActions({ assigned_to: userId, limit: 10000 });
            currentActions = actions; // Mettre à jour la liste globale
            renderActions(actions);
            calculateAndRenderStats(actions);
            refreshAllBtn.style.display = actions.length > 0 ? 'block' : 'none'; // Afficher le bouton
        } catch (error) {
            console.error(`Erreur lors du chargement des actions pour l'utilisateur ${userId}:`, error);
            showToast("Erreur de chargement des actions", 'error');
            actionsTableBody.innerHTML = '<tr><td colspan="8" class="text-center text-danger">Erreur de chargement des actions.</td></tr>';
        } finally {
            hideLoading();
        }
    }

    /**
     * Renders the actions in the table.
     * @param {Array} actions The list of actions to render.
     */
    function renderActions(actions) {
        actionsTableBody.innerHTML = '';
        if (actions.length === 0) {
            actionsTableBody.innerHTML = '<tr><td colspan="8" class="text-center">Aucune action trouvée pour cet utilisateur.</td></tr>';
            return;
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0); // Normalize to midnight for accurate date comparison

        actions.forEach(action => {
            const row = document.createElement('tr');

            const predictedEndDate = action.predicted_end_date ? new Date(action.predicted_end_date) : null;
            const isCompleted = action.final_status === 'OK';
            
            let isOverdue = false;
            let overdueStatusText = '';
            let rowClass = '';

            if (isCompleted) {
                // Action terminée: vérifier si elle a été terminée en retard
                isOverdue = action.was_overdue_on_completion;
                overdueStatusText = isOverdue ? 'Terminée en retard' : 'Terminée à temps';
                rowClass = 'status-completed';
            } else {
                // Action en cours: vérifier si la date de fin prévue est dépassée
                if (predictedEndDate && predictedEndDate < today) {
                    isOverdue = true;
                }
                overdueStatusText = isOverdue ? 'En retard' : 'À temps';
                rowClass = isOverdue ? 'status-overdue' : 'status-on-time';
            }
            
            row.className = rowClass;

            row.innerHTML = `
                <td>${action.number}</td>
                <td>${action.title || ''}</td>
                <td>${DateUtils.formatDate(action.planned_date)}</td>
                <td>${DateUtils.formatDate(action.predicted_end_date)}</td>
                <td>${DateUtils.formatDate(action.completion_date)}</td>
                <td><span class="badge bg-${isCompleted ? 'success' : 'secondary'}">${action.final_status}</span></td>
                <td><span class="badge bg-${isOverdue ? 'danger' : 'success'}">${overdueStatusText}</span></td>
                <td>
                    <button class="btn btn-sm btn-outline-primary refresh-btn" data-action-id="${action.id}" title="Rafraîchir le statut">
                        <i class="bi bi-arrow-clockwise"></i>
                    </button>
                </td>
            `;
            actionsTableBody.appendChild(row);
        });
    }

    /**
     * "Refreshes" a single action by triggering an update on the backend.
     * @param {string|number} actionId The ID of the action to refresh.
     * @param {HTMLElement} button The button that was clicked.
     */
    async function handleRefreshAction(actionId, button) {
        button.disabled = true;
        button.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>';

        try {
            // Find the action in the local list to get a field to "update"
            const actionToRefresh = currentActions.find(a => a.id == actionId);
            if (!actionToRefresh) {
                throw new Error("Action non trouvée localement.");
            }

            // Trigger a PATCH request. We can just "update" the title with its current value.
            // This is enough to trigger our backend logic.
            const updatedAction = await apiService.updateActionField(actionId, 'title', actionToRefresh.title);

            // The 'updatedAction' contains the corrected data.
            // First, update the local data source
            const index = currentActions.findIndex(a => a.id == actionId);
            if (index !== -1) {
                currentActions[index] = updatedAction;
            }

            // Re-render the whole table to reflect the change and recalculate stats
            renderActions(currentActions);
            calculateAndRenderStats(currentActions);

            showToast(`Action #${actionId} rafraîchie avec succès.`, 'success');

        } catch (error) {
            console.error(`Erreur lors du rafraîchissement de l'action ${actionId}:`, error);
            showToast("Erreur lors du rafraîchissement de l'action.", 'error');
            // Re-enable the button even on error
            button.disabled = false;
            button.innerHTML = '<i class="bi bi-arrow-clockwise"></i>';
        }
    }

    /**
     * Refreshes all actions for the current user sequentially.
     */
    async function handleRefreshAllActions() {
        if (currentActions.length === 0) {
            showToast("Aucune action à rafraîchir.", "info");
            return;
        }

        if (!confirm(`Vous êtes sur le point de rafraîchir ${currentActions.length} actions. Cette opération peut prendre du temps. Continuer ?`)) {
            return;
        }

        const totalActions = currentActions.length;
        let processedCount = 0;

        // Désactiver le bouton et afficher une progression
        refreshAllBtn.disabled = true;

        for (const action of currentActions) {
            try {
                // On ne met à jour que les actions terminées, les autres n'ont pas de statut à corriger
                if (action.final_status === 'OK') {
                    await apiService.updateActionField(action.id, 'title', action.title);
                }
                processedCount++;
                // Mettre à jour le texte du bouton pour montrer la progression
                refreshAllBtn.innerHTML = `<span class="spinner-border spinner-border-sm"></span> ${processedCount}/${totalActions}...`;
            } catch (error) {
                console.error(`Erreur lors du rafraîchissement de l'action ${action.id}:`, error);
                // On continue même en cas d'erreur sur une action
            }
        }

        // Une fois terminé, recharger toutes les données pour afficher le résultat final
        showToast("Toutes les actions ont été traitées. Rechargement des données...", "success");
        await loadUserActions(userSelector.value);

        // Réactiver le bouton
        refreshAllBtn.disabled = false;
        refreshAllBtn.innerHTML = '<i class="bi bi-arrow-clockwise"></i> Rafraîchir toutes les actions';
    }

    /**
     * Calculates and displays statistics about the user's actions.
     * @param {Array} actions The list of actions.
     */
    function calculateAndRenderStats(actions) {
        if (actions.length === 0) {
            statsContainer.innerHTML = '';
            return;
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let completed = 0;
        let completedOnTime = 0;
        let completedOverdue = 0;
        let inProgress = 0;
        let inProgressOnTime = 0;
        let inProgressOverdue = 0;

        actions.forEach(action => {
            const predictedEndDate = action.predicted_end_date ? new Date(action.predicted_end_date) : null;
            if (action.final_status === 'OK') {
                completed++;
                if (action.was_overdue_on_completion) {
                    completedOverdue++;
                } else {
                    completedOnTime++;
                }
            } else {
                inProgress++;
                if (predictedEndDate && predictedEndDate < today) {
                    inProgressOverdue++;
                } else {
                    inProgressOnTime++;
                }
            }
        });

        const total = actions.length;
        const performanceOnTime = completedOnTime + inProgressOnTime;
        const performancePercentage = total > 0 ? Math.round((performanceOnTime / total) * 100) : 0;
        
        statsContainer.innerHTML = `
            <div class="d-flex justify-content-around align-items-center h-100">
                <div><strong>Total Actions:</strong> <span class="badge bg-primary fs-6">${total}</span></div>
                <div><strong>En Retard (en cours):</strong> <span class="badge bg-danger fs-6">${inProgressOverdue}</span></div>
                <div><strong>Terminées (en retard):</strong> <span class="badge bg-warning text-dark fs-6">${completedOverdue}</span></div>
                 <div><strong>Performance (à temps):</strong> <span class="badge bg-success fs-6">${performancePercentage}%</span></div>
            </div>
        `;
    }

    // Event Listeners
    userSelector.addEventListener('change', (e) => {
        loadUserActions(e.target.value);
    });

    actionsTableBody.addEventListener('click', async (e) => {
        const refreshButton = e.target.closest('.refresh-btn');
        if (refreshButton) {
            const actionId = refreshButton.dataset.actionId;
            await handleRefreshAction(actionId, refreshButton);
        }
    });

    refreshAllBtn.addEventListener('click', handleRefreshAllActions);

    // Initial load
    populateUserSelector();
}); 
