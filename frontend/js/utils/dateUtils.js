/**
 * Utilitaires de gestion des dates pour l'application GMAO
 */

/**
 * Formate une date au format français (JJ/MM/AAAA)
 * @param {string} dateStr - Date sous format string ISO
 * @returns {string} - Date formatée
 */
function formatDate(dateStr) {
    if (!dateStr) return 'Non spécifié';
    
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return 'Date invalide';
    
    return date.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

/**
 * Normalise une date en supprimant les informations d'heure
 * @param {Date|string} date - Date à normaliser
 * @returns {Date} - Date normalisée à 00:00:00
 */
function normalizeDate(date) {
    if (!date) return null;
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    dateObj.setHours(0, 0, 0, 0);
    return dateObj;
}

/**
 * Détermine si une action est en retard selon les critères métier
 * @param {Object} action - L'action à évaluer
 * @returns {boolean} - True si l'action est en retard, false sinon
 */
function isActionOverdue(action) {
    // Créer une date sans l'heure pour aujourd'hui (juste le jour)
    const today = normalizeDate(new Date());
    
    // Obtenir toutes les dates pertinentes (sans les heures)
    const predictedEndDate = normalizeDate(action.predicted_end_date);
    const completionDate = normalizeDate(action.completion_date);
    
    // Vérifier si l'action est terminée
    const isCompleted = action.final_status === 'OK';
    
    // Cas 1: Action en cours et en retard
    // - Date de fin prévue strictement antérieure à aujourd'hui (hier ou avant)
    // - Action non terminée
    const isPastPredictedEndDate = predictedEndDate && predictedEndDate < today;
    const isCurrentlyOverdue = action.predicted_end_date && isPastPredictedEndDate && !isCompleted;
    
    // Cas 2: Action terminée en retard
    // - Action est terminée
    // - Date de complétion strictement postérieure à la date de fin prévue
    const isCompletedLate = isCompleted && completionDate && predictedEndDate && completionDate > predictedEndDate;
    
    // Une action est considérée en retard dans l'un ou l'autre cas
    return isCurrentlyOverdue || isCompletedLate;
}

/**
 * Détermine la classe CSS à appliquer selon le statut de la date
 * @param {string} date - Date à évaluer
 * @returns {string} - Classe CSS correspondante
 */
function getDateStatusClass(date) {
    if (!date) return '';
    
    // Normaliser les dates
    const today = normalizeDate(new Date());
    const targetDate = normalizeDate(date);
    
    // Calculer la différence en jours
    const diffDays = Math.ceil((targetDate - today) / (1000 * 60 * 60 * 24));
    
    // Si la date est strictement antérieure à aujourd'hui
    if (diffDays < 0) return 'date-overdue';
    
    // Si la date est dans les 7 prochains jours (incluant aujourd'hui)
    if (diffDays <= 7) return 'date-warning';
    
    // Sinon, date normale (plus de 7 jours dans le futur)
    return 'date-normal';
}

// Rendre les fonctions disponibles globalement
window.DateUtils = {
    formatDate,
    normalizeDate,
    isActionOverdue,
    getDateStatusClass
};
