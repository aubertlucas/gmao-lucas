/**
 * Utilitaires pour la gestion de la tolérance des retards côté frontend
 * Permet à un utilisateur de voir toutes les statistiques avec sa vision tolérante
 */

class ToleranceUtils {
    static LOCAL_STORAGE_KEY = 'gmao_delay_tolerance_enabled';
    static userWorkingHoursCache = null;
    
    /**
     * Vérifie si la tolérance est activée pour l'utilisateur actuel
     */
    static isToleranceEnabled() {
        return localStorage.getItem(this.LOCAL_STORAGE_KEY) === 'true';
    }
    
    /**
     * Active ou désactive la tolérance pour l'utilisateur actuel
     */
    static setToleranceEnabled(enabled) {
        localStorage.setItem(this.LOCAL_STORAGE_KEY, enabled.toString());
    }
    
    /**
     * Vide le cache des heures de travail
     */
    static clearCache() {
        console.log('[TOLERANCE] Vidage du cache des heures de travail');
        this.userWorkingHoursCache = null;
    }
    
    /**
     * Récupère les heures de travail pour tous les utilisateurs
     */
    static async fetchAllUserWorkingHours(api) {
        if (this.userWorkingHoursCache) {
            console.log('[TOLERANCE] Utilisation du cache des heures de travail');
            return this.userWorkingHoursCache;
        }
        
        try {
            console.log('[TOLERANCE] Récupération des heures de travail depuis l\'API...');
            const response = await api.request('/admin/all-users-working-hours');
            console.log('[TOLERANCE] Réponse API heures de travail:', response);
            
            this.userWorkingHoursCache = response.users_working_hours;
            console.log('[TOLERANCE] Cache mis à jour:', this.userWorkingHoursCache);
            
            return this.userWorkingHoursCache;
        } catch (error) {
            console.error('[TOLERANCE] Erreur lors de la récupération des heures de travail:', error);
            
            // Fallback : valeurs par défaut pour tous les utilisateurs connus
            console.warn('[TOLERANCE] Utilisation de valeurs par défaut (8h/jour)');
            return {};
        }
    }
    
    /**
     * Calcule si une action est en retard avec tolérance
     */
    static isOverdueWithTolerance(completionDate, plannedEndDate, toleranceHours) {
        if (!completionDate || !plannedEndDate || !toleranceHours) {
            return false;
        }
        
        // Convertir en dates si nécessaire
        let completion, planned;
        
        if (typeof completionDate === 'string') {
            completion = new Date(completionDate);
        } else {
            completion = new Date(completionDate);
        }
        
        if (typeof plannedEndDate === 'string') {
            planned = new Date(plannedEndDate);
        } else {
            planned = new Date(plannedEndDate);
        }
        
        // Normaliser les heures pour la comparaison (début de journée vs fin de journée)
        completion.setHours(23, 59, 59, 999); // Fin de la journée de complétion
        planned.setHours(23, 59, 59, 999);    // Fin de la journée prévue
        
        // Si terminé à temps ou en avance, pas de retard
        if (completion <= planned) {
            return false;
        }
        
        // Calculer le délai en heures (plus précis que les jours arrondis)
        const delayMs = completion.getTime() - planned.getTime();
        const delayHours = delayMs / (1000 * 60 * 60);
        
        // Debug pour comprendre le calcul
        console.log(`[TOLERANCE] Action - Retard: ${delayHours.toFixed(1)}h, Tolérance: ${toleranceHours}h -> ${delayHours > toleranceHours ? 'EN RETARD' : 'ACCEPTABLE'}`);
        
        // Retard seulement si dépassement de la tolérance EN HEURES
        return delayHours > toleranceHours;
    }
    
    /**
     * Recalcule toutes les statistiques avec ou sans tolérance
     */
    static async recalculateAllStats(actions, api) {
        console.log('[TOLERANCE] Actions récupérées pour le recalcul:', actions.length, 'actions');
        
        // Vider le cache pour forcer le rechargement des données à jour
        this.clearCache();
        
        const toleranceEnabled = this.isToleranceEnabled();
        
        if (!toleranceEnabled) {
            return this.calculateNormalStats(actions);
        }
        
        // Récupérer les heures de travail de tous les utilisateurs
        const userWorkingHours = await this.fetchAllUserWorkingHours(api);
        
        return this.calculateStatsWithTolerance(actions, userWorkingHours);
    }
    
    /**
     * Calcule les statistiques normales (sans tolérance)
     */
    static calculateNormalStats(actions) {
        let completed_on_time = 0;
        let completed_overdue = 0;
        let in_progress_on_time = 0;
        let in_progress_overdue = 0;
        let overdue_actions = 0;
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        for (const action of actions) {
            if (action.priority === 4) continue; // Skip "À planifier"
            
            const plannedEnd = new Date(action.predicted_end_date || action.planned_date);
            plannedEnd.setHours(23, 59, 59, 999);
            
            if (action.final_status === "OK") {
                // Action terminée
                if (action.was_overdue_on_completion) {
                    completed_overdue++;
                } else {
                    completed_on_time++;
                }
            } else {
                // Action en cours
                if (today > plannedEnd) {
                    in_progress_overdue++;
                    overdue_actions++;
                } else {
                    in_progress_on_time++;
                }
            }
        }
        
        return {
            completed_on_time,
            completed_overdue,
            in_progress_on_time,
            in_progress_overdue,
            overdue_actions,
            total_tracked: completed_on_time + completed_overdue + in_progress_on_time + in_progress_overdue,
            tolerance_applied: false
        };
    }
    
    /**
     * Calcule les statistiques avec tolérance pour TOUS les utilisateurs
     */
    static calculateStatsWithTolerance(actions, userWorkingHours) {
        let completed_on_time = 0;
        let completed_overdue = 0;
        let in_progress_on_time = 0;
        let in_progress_overdue = 0;
        let overdue_actions = 0;
        
        console.log('[TOLERANCE] Calcul avec tolérance - Actions:', actions.length);
        console.log('[TOLERANCE] Heures de travail disponibles:', Object.keys(userWorkingHours).length, 'utilisateurs');
        
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        
        for (const action of actions) {
            if (action.priority === 4) continue; // Skip "À planifier"
            
            console.log(`[DEBUG-TOLERANCE] Analyse de l'action ID: ${action.id}`, { details: action });

            // Récupérer la tolérance pour cet utilisateur
            const userHours = userWorkingHours[action.assigned_to];
            let toleranceHours = userHours ? userHours.working_hours_per_day : 8.0;
            
            // CORRECTION : La tolérance = 1 journée complète (24h)
            if (toleranceHours > 0) {
                toleranceHours = 24.0; // 1 jour complet de tolérance
            }
            
            // Vérification importante : s'assurer qu'on a bien une tolérance
            if (!toleranceHours || toleranceHours <= 0) {
                console.warn(`[TOLERANCE] Action ${action.id} - User ${action.assigned_to} - Pas de tolérance définie, utilisation par défaut (24h)`);
                toleranceHours = 24.0;
            }
            
            console.log(`[TOLERANCE] Action ${action.id} - User ${action.assigned_to} - Tolérance: ${toleranceHours}h (1 jour complet) - UserData:`, userHours);
            
            if (action.final_status === "OK" && action.completion_date) {
                // Action terminée - comparer completion_date vs planned_end_date
                const plannedEnd = new Date(action.predicted_end_date || action.planned_date);
                plannedEnd.setHours(23, 59, 59, 999);
                
                const completionEnd = new Date(action.completion_date);
                completionEnd.setHours(23, 59, 59, 999);
                
                // Vérification des dates
                if (isNaN(plannedEnd.getTime()) || isNaN(completionEnd.getTime())) {
                    console.error(`[TOLERANCE] Action ${action.id} - Dates invalides:`, {
                        planned: action.predicted_end_date || action.planned_date,
                        completion: action.completion_date
                    });
                    completed_on_time++; // Par défaut, considérer comme à temps
                    continue;
                }
                
                // Calculer le retard en heures
                const delayMs = completionEnd.getTime() - plannedEnd.getTime();
                const delayHours = delayMs / (1000 * 60 * 60);
                
                // Si pas de retard, c'est à temps
                if (delayHours <= 0) {
                    console.log(`[TOLERANCE] Action terminée ${action.id}: terminée à temps (${delayHours.toFixed(1)}h d'avance)`);
                    completed_on_time++;
                    continue;
                }
                
                // Appliquer la tolérance EN HEURES (pas en jours arrondis)
                const isOverdueWithTolerance = delayHours > toleranceHours;
                
                console.log(`[TOLERANCE] Action terminée ${action.id}: retard ${delayHours.toFixed(1)}h vs tolérance ${toleranceHours}h -> ${isOverdueWithTolerance ? 'RETARD' : 'OK'}`);
                console.log(`[DEBUG-TOLERANCE] DÉCISION pour action terminée ${action.id}: Est en retard = ${isOverdueWithTolerance}`);
                
                if (isOverdueWithTolerance) {
                    completed_overdue++;
                    console.log(`[DEBUG-TOLERANCE] Action terminée EN RETARD:`, {
                        action_id: action.id,
                        description: action.description,
                        planned_date: action.planned_date,
                        predicted_end_date: action.predicted_end_date,
                        completion_date: action.completion_date,
                        delay_hours: delayHours,
                        tolerance_hours: toleranceHours,
                        action_details: action
                    });
                } else {
                    completed_on_time++;
                }
            } else {
                // Action en cours - comparer today vs planned_end_date
                const plannedEnd = new Date(action.predicted_end_date || action.planned_date);
                plannedEnd.setHours(23, 59, 59, 999);
                
                // Vérification des dates
                if (isNaN(plannedEnd.getTime())) {
                    console.error(`[TOLERANCE] Action ${action.id} - Date prévue invalide:`, action.predicted_end_date || action.planned_date);
                    in_progress_on_time++; // Par défaut, considérer comme à temps
                    continue;
                }
                
                // Calculer le retard en heures
                const delayMs = today.getTime() - plannedEnd.getTime();
                const delayHours = delayMs / (1000 * 60 * 60);
                
                // Si pas de retard, c'est à temps
                if (delayHours <= 0) {
                    console.log(`[TOLERANCE] Action en cours ${action.id}: pas encore en retard (${Math.abs(delayHours).toFixed(1)}h restantes)`);
                    in_progress_on_time++;
                    continue;
                }
                
                // Appliquer la tolérance EN HEURES (pas en jours arrondis)
                const isOverdueWithTolerance = delayHours > toleranceHours;
                
                console.log(`[TOLERANCE] Action en cours ${action.id}: retard ${delayHours.toFixed(1)}h vs tolérance ${toleranceHours}h -> ${isOverdueWithTolerance ? 'RETARD' : 'OK'}`);
                console.log(`[DEBUG-TOLERANCE] DÉCISION pour action en cours ${action.id}: Est en retard = ${isOverdueWithTolerance}`);

                if (isOverdueWithTolerance) {
                    in_progress_overdue++;
                    overdue_actions++;
                    console.log(`[DEBUG-TOLERANCE] Action en cours EN RETARD:`, {
                        action_id: action.id,
                        description: action.description,
                        planned_date: action.planned_date,
                        predicted_end_date: action.predicted_end_date,
                        delay_hours: delayHours,
                        tolerance_hours: toleranceHours,
                        action_details: action
                    });
                } else {
                    in_progress_on_time++;
                }
            }
        }
        
        console.log('[TOLERANCE] Résultats:', {
            completed_on_time,
            completed_overdue,
            in_progress_on_time,
            in_progress_overdue,
            overdue_actions
        });
        
        // Calculer le pourcentage de performance avec la tolérance
        const totalTracked = completed_on_time + completed_overdue + in_progress_on_time + in_progress_overdue;
        const totalOnTime = completed_on_time + in_progress_on_time;
        const performance_percentage = totalTracked > 0 ? Math.round((totalOnTime / totalTracked) * 100) : 0;
        
        console.log('[TOLERANCE] Performance recalculée:', {
            totalOnTime,
            totalTracked,
            performance_percentage: performance_percentage + '%'
        });
        
        return {
            completed_on_time,
            completed_overdue,
            in_progress_on_time,
            in_progress_overdue,
            overdue_actions,
            total_tracked: totalTracked,
            performance_percentage,
            tolerance_applied: true
        };
    }
    
    /**
     * Ajoute un indicateur visuel si la tolérance est activée
     */
    static addToleranceIndicator(element) {
        const toleranceEnabled = this.isToleranceEnabled();
        
        if (toleranceEnabled) {
            // Supprimer l'ancien indicateur s'il existe
            const existingIndicator = element.querySelector('.tolerance-indicator');
            if (existingIndicator) {
                existingIndicator.remove();
            }
            
            const indicator = document.createElement('span');
            indicator.className = 'badge bg-info ms-2 tolerance-indicator';
            indicator.innerHTML = '<i class="bi bi-clock-history"></i> Avec tolérance';
            indicator.title = 'Ces statistiques incluent votre tolérance personnelle des retards';
            element.appendChild(indicator);
        }
    }
    
    /**
     * Modifie visuellement une action selon la tolérance
     */
    static async applyToleranceToAction(actionElement, action, api) {
        const toleranceEnabled = this.isToleranceEnabled();
        
        if (!toleranceEnabled) return;
        
        const userWorkingHours = await this.fetchAllUserWorkingHours(api);
        const userHours = userWorkingHours[action.assigned_to];
        let toleranceHours = userHours ? userHours.working_hours_per_day : 8.0;
        
        // CORRECTION : La tolérance = 1 journée complète (24h)
        if (toleranceHours > 0) {
            toleranceHours = 24.0; // 1 jour complet de tolérance
        }
        
        // Calculer si l'action serait en retard avec tolérance
        let isOverdueWithTolerance = false;
        
        if (action.final_status === "OK" && action.completion_date) {
            isOverdueWithTolerance = this.isOverdueWithTolerance(
                action.completion_date,
                action.predicted_end_date || action.planned_date,
                toleranceHours
            );
        } else {
            const today = new Date();
            isOverdueWithTolerance = this.isOverdueWithTolerance(
                today,
                action.predicted_end_date || action.planned_date,
                toleranceHours
            );
        }
        
        // Modifier l'affichage si la tolérance change le statut
        const wasOverdue = action.was_overdue_on_completion || 
                          (action.final_status !== "OK" && new Date() > new Date(action.predicted_end_date || action.planned_date));
        
        if (wasOverdue && !isOverdueWithTolerance) {
            // L'action était en retard mais devient à temps avec tolérance
            actionElement.classList.remove('table-danger');
            actionElement.classList.add('table-success');
            
            // Ajouter un badge de tolérance
            const toleranceBadge = document.createElement('span');
            toleranceBadge.className = 'badge bg-success ms-1';
            toleranceBadge.innerHTML = '<i class="bi bi-clock-history"></i>';
            toleranceBadge.title = 'À temps avec tolérance';
            
            const statusCell = actionElement.querySelector('.status-cell');
            if (statusCell) {
                statusCell.appendChild(toleranceBadge);
            }
        }
    }
}

// Rendre disponible globalement
window.ToleranceUtils = ToleranceUtils; 
