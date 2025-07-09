/**
 * Dashboard.js - Gestion du tableau de bord dynamique avec GridStack pour le GMAO
 */

// --- SECURITY GUARD ---
// Rediriger les utilisateurs non autorisés avant même d'initialiser le reste du script
document.addEventListener('DOMContentLoaded', () => {
    const authManager = new AuthManager();
    if (!authManager.isAuthenticated()) {
        window.location.href = 'index.html';
        return;
    }

    const user = authManager.getUser();
    const userRole = user ? user.role : 'observer';

    if (userRole !== 'admin' && userRole !== 'manager') {
        window.location.href = 'actions.html';
    }
});

/**
 * Affiche une notification toast
 * @param {string} message - Message à afficher
 * @param {string} type - Type de notification (success, error, warning, info)
 */
function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toastContainer');
    
    // Créer le toast
    const toast = document.createElement('div');
    toast.className = `toast align-items-center text-white bg-${type === 'error' ? 'danger' : type} border-0 fade show`;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'assertive');
    toast.setAttribute('aria-atomic', 'true');
    
    // Contenu du toast
    toast.innerHTML = `
        <div class="d-flex">
            <div class="toast-body">
                ${message}
            </div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
    `;
    
    // Ajouter le toast au conteneur
    toastContainer.appendChild(toast);
    
    // Initialiser le toast
    const bsToast = new bootstrap.Toast(toast, { delay: 3000 });
    bsToast.show();
    
    // Supprimer le toast après qu'il ait été masqué
    toast.addEventListener('hidden.bs.toast', () => {
        toast.remove();
    });
}

// Les fonctions formatDate et isActionOverdue sont maintenant importées depuis dateUtils.js

/**
 * Classe principale du tableau de bord
 */
class Dashboard {
    constructor() {
        this.authManager = new AuthManager();
        this.apiService = new ApiService();
        this.charts = {};
        this.stats = {};
        this.recentActions = [];
        this.criticalActions = [];
        this.assignableUsers = []; // Ajout pour le filtre
        this.selectedPilotId = null; // Ajout pour le filtre
        
        // Définition des widgets disponibles
        this.widgets = [
            { id: 'statsTotal', title: 'Actions Totales', icon: 'bi-list-check', template: 'statsTotalTemplate', w: 3, h: 2 },
            { id: 'statsCompleted', title: 'Actions Terminées', icon: 'bi-check-circle', template: 'statsCompletedTemplate', w: 3, h: 2 },
            { id: 'statsInProgress', title: 'Actions En Cours', icon: 'bi-hourglass-split', template: 'statsInProgressTemplate', w: 3, h: 2 },
            { id: 'statsOverdue', title: 'Actions En Retard', icon: 'bi-exclamation-triangle', template: 'statsOverdueTemplate', w: 3, h: 2 },
            { id: 'performanceChart', title: 'Performance Globale', icon: 'bi-speedometer2', template: 'performanceChartTemplate', w: 4, h: 7 },
            { id: 'priorityChart', title: 'Répartition par Priorité', icon: 'bi-pie-chart', template: 'priorityChartTemplate', w: 4, h: 6 },
            { id: 'locationChart', title: 'Répartition par Lieu', icon: 'bi-geo-alt', template: 'locationChartTemplate', w: 4, h: 6 },
            { id: 'costChart', title: 'Coût Prévu / Coût Total', icon: 'bi-cash-coin', template: 'costChartTemplate', w: 4, h: 6 },
            { id: 'overdueChart', title: 'Actions en retard / totales', icon: 'bi-pie-chart-fill', template: 'overdueChartTemplate', w: 4, h: 6 },
            { id: 'statusChart', title: 'Répartition par Statut', icon: 'bi-bar-chart', template: 'statusDistributionTemplate', w: 4, h: 6 },
            { id: 'recentActions', title: 'Actions Récentes', icon: 'bi-clock-history', template: 'recentActionsTemplate', w: 6, h: 8 },
            { id: 'criticalActions', title: 'Actions Critiques', icon: 'bi-exclamation-octagon', template: 'criticalActionsTemplate', w: 6, h: 8 }
        ];
        
        // Stockage des widgets masqués
        this.hiddenWidgets = [];
        
        // GridStack instance
        this.grid = null;
        
        this.initEventListeners();
    }
    
    /**
     * Applique la disposition par défaut des widgets depuis DEFAULT_WIDGET_LAYOUT
     * Cette méthode est appelée lors de l'initialisation et lors d'un reset de disposition
     */
    applyDefaultLayout() {
        console.log('[Dashboard] Application de la disposition par défaut');
        
        // Vérifier si la configuration par défaut est disponible
        if (typeof DEFAULT_WIDGET_LAYOUT === 'undefined' || !Array.isArray(DEFAULT_WIDGET_LAYOUT)) {
            console.error('[Dashboard] Configuration de disposition par défaut non disponible');
            return;
        }
        
        try {
            // Appliquer la configuration aux widgets existants
            DEFAULT_WIDGET_LAYOUT.forEach(config => {
                const element = document.getElementById(config.id);
                if (element) {
                    // Définir les attributs GridStack
                    element.setAttribute('gs-x', config.x);
                    element.setAttribute('gs-y', config.y);
                    element.setAttribute('gs-w', config.w);
                    element.setAttribute('gs-h', config.h);
                    console.log(`[Dashboard] Configuration appliquée: ${config.id} -> x:${config.x}, y:${config.y}, w:${config.w}, h:${config.h}`);
                } else {
                    console.warn(`[Dashboard] Widget non trouvé: ${config.id}`);
                }
            });
            
            // Si GridStack est initialisé, forcer le rafraîchissement
            if (this.grid) {
                this.grid.batchUpdate();
                this.grid.compact();
                this.grid.commit();
            }
            
            // Sauvegarder cette disposition comme la disposition utilisateur par défaut
            localStorage.setItem('dashboardLayout', JSON.stringify(DEFAULT_WIDGET_LAYOUT));
            
            showToast('Disposition par défaut appliquée', 'success');
        } catch (error) {
            console.error('[Dashboard] Erreur lors de l\'application de la disposition par défaut:', error);
            showToast('Erreur lors de l\'application de la disposition', 'error');
        }
    }
    
    /**
     * Force l'utilisation de la disposition par défaut, réinitialise complètement la mise en page
     */
    forceDefaultLayout() {
        // Supprimer la disposition sauvegardée
        localStorage.removeItem('dashboardLayout');
        
        // Appliquer la disposition par défaut
        this.applyDefaultLayout();
        
        // Recharger la page pour s'assurer que tout est correctement appliqué
        setTimeout(() => {
            window.location.reload();
        }, 1000);
    }

    initEventListeners() {
        // Bouton de rafraîchissement
        document.getElementById('refreshButton').addEventListener('click', () => {
            this.loadDashboardData();
        });
        
        // Bouton de reset cache
        document.getElementById('resetCacheButton').addEventListener('click', () => {
            this.resetCache();
        });
        
        // Bouton de configuration par défaut
        document.getElementById('loadDefaultButton').addEventListener('click', () => {
            this.forceDefaultLayout();
        });
        
        // Gestionnaire pour afficher/masquer le panneau des widgets masqués
        document.getElementById('showHiddenWidgetsBtn').addEventListener('click', () => {
            document.getElementById('hiddenWidgetsPanel').classList.add('show');
        });
        
        // Fermer le panneau des widgets masqués
        document.getElementById('closeHiddenWidgetsBtn').addEventListener('click', () => {
            document.getElementById('hiddenWidgetsPanel').classList.remove('show');
        });
        
        // Délégation d'événements pour les boutons de contrôle des widgets
        document.addEventListener('click', (e) => {
            const controlBtn = e.target.closest('.widget-control-btn');
            if (controlBtn) {
                const action = controlBtn.dataset.action;
                const gridItem = controlBtn.closest('.grid-stack-item');
                
                if (action === 'remove' && gridItem) {
                    const widgetId = gridItem.getAttribute('gs-id');
                    this.hideWidget(widgetId);
                }
            }
            
            // Gérer les clics sur les icônes de widgets cachés
            const widgetIcon = e.target.closest('.widget-icon');
            if (widgetIcon) {
                const widgetId = widgetIcon.dataset.id;
                this.showWidget(widgetId);
            }
        });
    }
    
    /**
     * Initialise le filtre par pilote
     */
    async initPilotFilter() {
        try {
            this.assignableUsers = await this.apiService.getAssignableUsers();

            const refreshButton = document.getElementById('refreshButton');
            if (!refreshButton) return;

            // Insérer le conteneur du filtre avant le groupe de boutons de rafraîchissement
            const buttonGroup = refreshButton.closest('.btn-group');
            const toolbar = buttonGroup ? buttonGroup.parentElement : null;

            if (toolbar) {
                const filterContainer = document.createElement('div');
                filterContainer.className = 'd-flex align-items-center me-3';
                filterContainer.id = 'pilotFilterContainer';

                const filterLabel = document.createElement('label');
                filterLabel.htmlFor = 'pilotFilterSelect';
                filterLabel.className = 'form-label me-2 mb-0 fw-bold';
                filterLabel.textContent = 'Performance de:';
                
                const pilotFilterSelect = document.createElement('select');
                pilotFilterSelect.id = 'pilotFilterSelect';
                pilotFilterSelect.className = 'form-select form-select-sm';
                pilotFilterSelect.style.width = '200px';

                // Option "Toutes les ressources"
                let optionsHtml = '<option value="">Toutes les ressources</option>';
                
                // Options pour chaque pilote
                this.assignableUsers.forEach(user => {
                    if (user.is_active) {
                        optionsHtml += `<option value="${user.id}">${user.username}</option>`;
                    }
                });
                pilotFilterSelect.innerHTML = optionsHtml;

                // Ajout du listener
                pilotFilterSelect.addEventListener('change', (e) => {
                    this.selectedPilotId = e.target.value || null;
                    this.loadDashboardData();
                });

                filterContainer.appendChild(filterLabel);
                filterContainer.appendChild(pilotFilterSelect);

                // Insérer le filtre au début de la barre d'outils, à côté du titre
                const h2 = toolbar.querySelector('h2');
                if (h2) {
                    h2.insertAdjacentElement('afterend', filterContainer);
                } else {
                    toolbar.insertBefore(filterContainer, toolbar.firstChild);
                }
            }
        } catch (error) {
            console.error("Erreur lors de l'initialisation du filtre pilote:", error);
            showToast("Erreur lors du chargement du filtre pilote", "error");
        }
    }
    
    async init() {
        try {
            console.log('[Debug] Début de l\'initialisation du dashboard');
            
            if (!this.authManager.isAuthenticated()) {
                console.log('[Debug] Utilisateur non authentifié, redirection');
                window.location.href = 'index.html';
                return;
            }
            
            console.log('[Debug] Utilisateur authentifié');
            
            // Afficher l'utilisateur actuel
            const user = this.authManager.getUser();
            if (user) {
                document.getElementById('currentUser').textContent = user.username;
                console.log('[Debug] Utilisateur affiché:', user.username);
            }
            
            // Mettre à jour l'indicateur de cache
            this.updateCacheStatus('Chargement...');
            
            this.showLoading();
            console.log('[Debug] Loading affiché');
            
            // Initialiser GridStack
            console.log('[Debug] Initialisation de GridStack...');
            this.initGrid();
            console.log('[Debug] GridStack initialisé');

            // Initialiser le filtre pilote
            await this.initPilotFilter();
            
            // Appliquer la disposition par défaut des widgets
            console.log('[Debug] Application de la disposition par défaut...');
            this.applyDefaultLayout();
            console.log('[Debug] Disposition par défaut appliquée');
            
            // Charger la configuration sauvegardée ou utiliser la configuration par défaut
            console.log('[Debug] Chargement de la configuration...');
            this.loadGridConfig();
            console.log('[Debug] Configuration chargée');
            
            // Charger les données du dashboard
            console.log('[Debug] Chargement des données...');
            await this.loadDashboardData();
            console.log('[Debug] Données chargées');
            
            // Mettre à jour l'indicateur de cache final
            this.updateCacheStatus('✓ Chargé');
            
            this.hideLoading();
            console.log('[Debug] Initialisation terminée avec succès');
        } catch (error) {
            console.error('[Debug] Erreur d\'initialisation:', error);
            this.updateCacheStatus('❌ Erreur');
            showToast('Erreur lors du chargement du tableau de bord: ' + error.message, 'error');
            this.hideLoading();
        }
    }
    
    /**
     * Initialise la grille GridStack
     */
    initGrid() {
        // Options de la grille
        const options = {
            column: 12, // Nombre de colonnes
            margin: 10, // Marge entre les widgets
            cellHeight: 60, // Hauteur des cellules
            disableOneColumnMode: false, // Désactiver le mode une colonne sur mobile
            float: false, // Les widgets ne flottent pas
            resizable: { 
                handles: 'all',
                autoHide: true
            }, // Redimensionnement de tous les côtés
            removable: false, // Les widgets ne peuvent pas être supprimés (nous gérons cela nous-mêmes)
            animate: true, // Animations activées
        };
        
        // Initialiser la grille
        this.grid = GridStack.init(options, '.grid-stack');
        
        // Événement de changement pour sauvegarder la configuration
        this.grid.on('change', () => {
            this.saveGridConfig();
        });
        
        // Événement de début de redimensionnement
        this.grid.on('resizestart', (event, element) => {
            // Désactiver temporairement les animations des graphiques pour de meilleures performances
            const widgetId = element.getAttribute('gs-id');
            const chart = this.charts[widgetId];
            if (chart && chart.options) {
                chart.options.animation = false;
            }
        });
        
        // Événement pendant le redimensionnement
        this.grid.on('resize', (event, element) => {
            // Redimensionnement en temps réel pendant le glissement avec débounce
            clearTimeout(element._resizeTimeout);
            element._resizeTimeout = setTimeout(() => {
                this.resizeWidgetContent(element);
            }, 100); // Débounce de 100ms
        });
        
        // Événement de fin de redimensionnement
        this.grid.on('resizestop', (event, element) => {
            // Réactiver les animations et faire un redimensionnement final
            const widgetId = element.getAttribute('gs-id');
            const chart = this.charts[widgetId];
            if (chart && chart.options) {
                chart.options.animation = { duration: 1000 };
            }
            
            // Redimensionnement final avec un délai pour stabilisation
            setTimeout(() => {
            this.resizeWidgetContent(element);
            }, 100);
        });
        
        // Événement de changement de fenêtre pour redimensionner tous les widgets
        window.addEventListener('resize', () => {
            // Débounce pour éviter trop d'appels
            clearTimeout(this.resizeTimeout);
            this.resizeTimeout = setTimeout(() => {
                this.resizeAllWidgets();
            }, 250);
        });
        
        // Raccourcis clavier
        window.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && e.key === 'R') {
                e.preventDefault();
                console.log('[Shortcut] Raccourci de reset cache détecté');
                this.resetCache();
            } else if (e.ctrlKey && e.key === 'd') {
                e.preventDefault();
                console.log('[Shortcut] Raccourci de debug détecté');
                this.debugDashboard();
            }
        });
    }
    
    /**
     * Vérifie la version du cache et force une mise à jour si nécessaire
     */
    checkCacheVersion() {
        const currentVersion = '2025-06-03-performance-widget';
        const savedVersion = localStorage.getItem('dashboardVersion');
        
        console.log('[Cache] Version actuelle:', currentVersion, 'Version sauvée:', savedVersion);
        
        // TEMPORAIREMENT : ne pas nettoyer automatiquement pour diagnostiquer
        // if (savedVersion !== currentVersion) {
        //     console.log('[Cache] Nouvelle version détectée, nettoyage du cache...');
        //     localStorage.removeItem('dashboardConfig');
        //     localStorage.removeItem('dashboardVersion');
        //     localStorage.setItem('dashboardVersion', currentVersion);
        //     console.log('[Cache] Cache nettoyé, nouvelle version sauvegardée');
        // }
        
        // Pour l'instant, juste sauvegarder la version sans nettoyer
        localStorage.setItem('dashboardVersion', currentVersion);
    }
    
    /**
     * Debug complet de l'état du dashboard
     */
    debugDashboard() {
        console.group('🔍 DEBUG DASHBOARD COMPLET');
        
        console.log('=== ÉTAT DES DÉPENDANCES ===');
        console.log('- Chart.js:', typeof Chart !== 'undefined' ? '✓' : '❌');
        console.log('- GridStack:', typeof GridStack !== 'undefined' ? '✓' : '❌');
        console.log('- authManager:', typeof authManager !== 'undefined' ? '✓' : '❌');
        console.log('- ApiService:', typeof ApiService !== 'undefined' ? '✓' : '❌');
        console.log('- DateUtils:', typeof DateUtils !== 'undefined' ? '✓' : '❌');
        
        console.log('=== ÉTAT DE L\'INSTANCE ===');
        console.log('- this.grid:', this.grid ? '✓' : '❌');
        console.log('- this.stats:', this.stats ? Object.keys(this.stats).length + ' propriétés' : '❌');
        console.log('- this.widgets:', this.widgets ? this.widgets.length + ' widgets définis' : '❌');
        console.log('- this.charts:', this.charts ? Object.keys(this.charts).length + ' graphiques' : '❌');
        
        console.log('=== ÉTAT DU DOM ===');
        const gridContainer = document.querySelector('.grid-stack');
        console.log('- .grid-stack container:', gridContainer ? '✓' : '❌');
        console.log('- .grid-stack-item enfants:', gridContainer ? gridContainer.children.length : 0);
        
        console.log('=== WIDGETS DÉFINIS ===');
        if (this.widgets) {
            this.widgets.forEach(widget => {
                const template = document.getElementById(widget.template);
                console.log(`- ${widget.id} (${widget.template}):`, template ? '✓' : '❌ Template manquant');
            });
        }
        
        console.log('=== LOCALSTORAGE ===');
        console.log('- dashboardConfig:', localStorage.getItem('dashboardConfig') ? 'Présent' : 'Absent');
        console.log('- dashboardVersion:', localStorage.getItem('dashboardVersion') || 'Absent');
        
        console.groupEnd();
        
        // Afficher aussi dans l'interface
        const debugInfo = `
État des dépendances:
- Chart.js: ${typeof Chart !== 'undefined' ? '✓' : '❌'}
- GridStack: ${typeof GridStack !== 'undefined' ? '✓' : '❌'}
- authManager: ${typeof authManager !== 'undefined' ? '✓' : '❌'}

État de l'instance:
- Grid: ${this.grid ? '✓' : '❌'}
- Stats: ${this.stats ? Object.keys(this.stats).length + ' propriétés' : '❌'}
- Widgets: ${this.widgets ? this.widgets.length + ' définis' : '❌'}

DOM:
- Container grid: ${document.querySelector('.grid-stack') ? '✓' : '❌'}
- Widgets affichés: ${document.querySelector('.grid-stack') ? document.querySelector('.grid-stack').children.length : 0}
        `;
        
        alert('Debug Dashboard:\n' + debugInfo);
    }

    /**
     * Force le chargement de la configuration par défaut
     */
    forceDefaultLayout() {
        console.log('[Debug] Force chargement de la configuration par défaut');
        
        if (confirm('Voulez-vous restaurer la configuration par défaut du dashboard ?')) {
            // Nettoyer la configuration actuelle
            localStorage.removeItem('dashboardConfig');
            
            // Supprimer tous les widgets existants
            if (this.grid) {
                this.grid.removeAll();
            }
            
            // Charger la configuration par défaut
            this.loadDefaultLayout();
            
            // Forcer la mise à jour
            if (this.stats && Object.keys(this.stats).length > 0) {
                this.updateStats();
                this.initCharts();
            }
            
            showToast('Configuration par défaut restaurée', 'success');
        }
    }

    /**
     * Met à jour l'indicateur de statut du cache
     */
    updateCacheStatus(status) {
        const cacheStatusElement = document.getElementById('cacheStatus');
        if (cacheStatusElement) {
            cacheStatusElement.textContent = `Cache: ${status}`;
            
            // Changer la couleur selon le statut
            if (status.includes('✓')) {
                cacheStatusElement.className = 'text-success';
            } else if (status.includes('❌')) {
                cacheStatusElement.className = 'text-danger';
            } else if (status.includes('⚠️')) {
                cacheStatusElement.className = 'text-warning';
            } else {
                cacheStatusElement.className = 'text-muted';
            }
        }
    }

    /**
     * Reset complet du cache et rechargement de la page
     */
    async resetCache() {
        console.log('[Cache] Demande de réinitialisation complète du cache...');
        
        if (!confirm('Êtes-vous sûr de vouloir réinitialiser complètement le cache et l\'application ? Cela va déconnecter et recharger la page.')) {
            return;
        }
    
        this.updateCacheStatus('🔄 Réinitialisation...');
        showToast('Réinitialisation du cache en cours...', 'info');
    
        try {
            // Étape 1: Tenter de désenregistrer tous les service workers
            if ('serviceWorker' in navigator) {
                const registrations = await navigator.serviceWorker.getRegistrations();
                if (registrations && registrations.length) {
                    console.log(`[Cache] Désenregistrement de ${registrations.length} service worker(s)...`);
                    await Promise.all(registrations.map(reg => reg.unregister()));
                    console.log('[Cache] Service workers désenregistrés.');
                } else {
                    console.log('[Cache] Aucun service worker à désenregistrer.');
                }
            }
    
            // Étape 2: Nettoyer tous les caches de l'application
            if (window.caches) {
                const cacheNames = await window.caches.keys();
                if (cacheNames && cacheNames.length) {
                    console.log(`[Cache] Nettoyage de ${cacheNames.length} cache(s)...`);
                    await Promise.all(cacheNames.map(name => window.caches.delete(name)));
                    console.log('[Cache] Caches nettoyés.');
                } else {
                    console.log('[Cache] Aucun cache à nettoyer.');
                }
            }
            
            // Étape 3: Nettoyer le localStorage pour un reset complet
            console.log('[Cache] Nettoyage du localStorage...');
            localStorage.clear();
    
            // Étape 4: Recharger la page en forçant le rechargement depuis le réseau
            console.log('[Cache] Rechargement de la page...');
            showToast('Cache réinitialisé ! Rechargement de l\'application...', 'success');
    
            setTimeout(() => {
                window.location.reload(true);
            }, 1500);
    
        } catch (error) {
            console.error('[Cache] Erreur lors de la réinitialisation:', error);
            showToast('Erreur lors de la réinitialisation du cache.', 'error');
            this.updateCacheStatus('❌ Erreur');
        }
    }
    
    /**
     * Charge la configuration sauvegardée ou utilise la configuration par défaut
     */
    loadGridConfig() {
        try {
            // Tenter de récupérer la configuration sauvegardée
            const savedConfig = localStorage.getItem('dashboardConfig');
            
            if (savedConfig) {
                // Restaurer la configuration sauvegardée
                const config = JSON.parse(savedConfig);
                
                // TEMPORAIREMENT : ne pas vérifier le widget performanceChart pour diagnostiquer
                // const hasPerformanceWidget = config.widgets && 
                //     config.widgets.some(w => w.id === 'performanceChart');
                // 
                // if (!hasPerformanceWidget) {
                //     console.log('[Config] Widget Performance manquant, chargement de la config par défaut');
                //     this.loadDefaultLayout();
                //     return;
                // }
                
                // Restaurer les widgets visibles
                this.addWidgetsFromConfig(config.widgets);
                
                // Restaurer les widgets masqués
                this.hiddenWidgets = config.hiddenWidgets || [];
                this.renderHiddenWidgets();
            } else {
                // Utiliser la configuration par défaut
                this.loadDefaultLayout();
            }
        } catch (error) {
            console.error('Error loading grid configuration:', error);
            // En cas d'erreur, charger la configuration par défaut
            this.loadDefaultLayout();
        }
    }
    
    /**
     * Charge la disposition par défaut des widgets
     */
    loadDefaultLayout() {
        console.log('[Debug] Chargement de la disposition par défaut');
        
        // Configuration par défaut des widgets - avec performanceChart comme KPI principal unique
        const defaultLayout = [
            { id: 'statsTotal', x: 0, y: 0, w: 3, h: 2 },
            { id: 'statsCompleted', x: 3, y: 0, w: 3, h: 2 },
            { id: 'statsInProgress', x: 6, y: 0, w: 3, h: 2 },
            { id: 'statsOverdue', x: 9, y: 0, w: 3, h: 2 },
            { id: 'performanceChart', x: 0, y: 2, w: 4, h: 7 },
            { id: 'priorityChart', x: 4, y: 2, w: 4, h: 6 },
            { id: 'locationChart', x: 8, y: 2, w: 4, h: 6 },
            { id: 'costChart', x: 4, y: 8, w: 4, h: 6 },
            { id: 'recentActions', x: 0, y: 9, w: 6, h: 8 },
            { id: 'criticalActions', x: 6, y: 14, w: 6, h: 8 }
        ];
        
        console.log('[Debug] Widgets à créer:', defaultLayout.map(w => w.id));
        
        // Ajouter les widgets selon la disposition par défaut
        try {
        this.addWidgetsFromConfig(defaultLayout);
            console.log('[Debug] Widgets ajoutés avec succès');
        } catch (error) {
            console.error('[Debug] Erreur lors de l\'ajout des widgets:', error);
        }
        
        // Pas de widgets masqués au départ
        this.hiddenWidgets = [];
        this.renderHiddenWidgets();
        
        console.log('[Debug] Disposition par défaut chargée');
    }
    
    /**
     * Ajoute des widgets à la grille selon une configuration donnée
     * @param {Array} widgetsConfig - Configuration des widgets à ajouter
     */
    addWidgetsFromConfig(widgetsConfig) {
        console.log('[Debug] addWidgetsFromConfig appelé avec:', widgetsConfig?.length, 'widgets');
        
        if (!widgetsConfig || !widgetsConfig.length) {
            console.log('[Debug] Pas de configuration de widgets fournie');
            return;
        }
        
        if (!this.grid) {
            console.error('[Debug] Grid non initialisé !');
            return;
        }
        
        // Supprimer tous les widgets existants
        console.log('[Debug] Suppression des widgets existants');
        this.grid.removeAll();
        
        // Ajouter chaque widget selon la configuration
        console.log('[Debug] Ajout des widgets...');
        widgetsConfig.forEach((widgetConfig, index) => {
            console.log(`[Debug] Ajout widget ${index + 1}/${widgetsConfig.length}: ${widgetConfig.id}`);
            const widget = this.widgets.find(w => w.id === widgetConfig.id);
            if (widget) {
                try {
                this.addWidget(widget, widgetConfig);
                    console.log(`[Debug] Widget ${widgetConfig.id} ajouté avec succès`);
                } catch (error) {
                    console.error(`[Debug] Erreur lors de l'ajout du widget ${widgetConfig.id}:`, error);
                }
            } else {
                console.warn(`[Debug] Widget ${widgetConfig.id} non trouvé dans this.widgets`);
            }
        });
        
        console.log('[Debug] Fin de addWidgetsFromConfig');
    }
    
    /**
     * Ajoute un widget à la grille
     * @param {Object} widget - Widget à ajouter
     * @param {Object} position - Position et dimensions du widget
     */
    addWidget(widget, position = {}) {
        console.log(`[Dashboard] Ajout du widget: ${widget.id} (template: ${widget.template})`);
        
        // Obtenir le contenu du template
        const template = document.getElementById(widget.template);
        if (!template) {
            console.error(`[Dashboard] Template non trouvé: ${widget.template} pour le widget ${widget.id}`);
            return;
        }
        
        console.log(`[Dashboard] Template trouvé pour ${widget.id}`);
        
        // Créer le contenu du widget
        const content = template.innerHTML;
        
        // Créer l'objet de configuration pour le widget
        const widgetConfig = {
            id: widget.id,
            x: position.x !== undefined ? position.x : undefined,
            y: position.y !== undefined ? position.y : undefined,
            w: position.w !== undefined ? position.w : widget.w,
            h: position.h !== undefined ? position.h : widget.h,
            content: content
        };
        
        // Ajouter le widget à la grille
        this.grid.addWidget(widgetConfig);
        console.log(`[Dashboard] Widget ${widget.id} ajouté à la grille`);
    }
    
    /**
     * Sauvegarde la configuration actuelle de la grille
     */
    saveGridConfig() {
        // Récupérer la configuration actuelle des widgets
        const gridItems = this.grid.getGridItems();
        const widgets = gridItems.map(item => {
            const node = item.gridstackNode;
            return {
                id: node.id,
                x: node.x,
                y: node.y,
                w: node.w,
                h: node.h
            };
        });
        
        // Créer l'objet de configuration complète
        const config = {
            widgets: widgets,
            hiddenWidgets: this.hiddenWidgets
        };
        
        // Sauvegarder dans le localStorage
        localStorage.setItem('dashboardConfig', JSON.stringify(config));
    }
    
    /**
     * Cache un widget et l'ajoute à la liste des widgets masqués
     * @param {string} widgetId - ID du widget à masquer
     */
    hideWidget(widgetId) {
        // Vérifier si le widget existe
        const gridItem = this.grid.el.querySelector(`.grid-stack-item[gs-id="${widgetId}"]`);
        if (!gridItem) return;
        
        // Enregistrer la position et les dimensions du widget avant de le supprimer
        const node = gridItem.gridstackNode;
        const widgetConfig = {
            id: widgetId,
            x: node.x,
            y: node.y,
            w: node.w,
            h: node.h
        };
        
        // Ajouter à la liste des widgets masqués
        this.hiddenWidgets.push(widgetConfig);
        
        // Supprimer le widget de la grille
        this.grid.removeWidget(gridItem);
        
        // Mettre à jour l'affichage des widgets masqués
        this.renderHiddenWidgets();
        
        // Sauvegarder la configuration
        this.saveGridConfig();
        
        // Afficher notification
        showToast(`Widget ${this.getWidgetTitle(widgetId)} masqué`, 'info');
    }
    
    /**
     * Affiche un widget précédemment masqué
     * @param {string} widgetId - ID du widget à afficher
     */
    showWidget(widgetId) {
        // Trouver le widget masqué
        const hiddenWidgetIndex = this.hiddenWidgets.findIndex(w => w.id === widgetId);
        if (hiddenWidgetIndex === -1) return;
        
        // Récupérer la configuration du widget masqué
        const widgetConfig = this.hiddenWidgets[hiddenWidgetIndex];
        
        // Trouver la définition du widget
        const widget = this.widgets.find(w => w.id === widgetId);
        if (!widget) return;
        
        // Supprimer de la liste des widgets masqués
        this.hiddenWidgets.splice(hiddenWidgetIndex, 1);
        
        // Ajouter le widget à la grille
        this.addWidget(widget, widgetConfig);
        
        // Mettre à jour l'affichage des widgets masqués
        this.renderHiddenWidgets();
        
        // Mettre à jour le widget si nécessaire
        if (this.stats && Object.keys(this.stats).length > 0) {
            this.updateStats();
            this.initCharts();
        }
        
        // Sauvegarder la configuration
        this.saveGridConfig();
        
        // Masquer le panneau si tous les widgets sont affichés
        if (this.hiddenWidgets.length === 0) {
            document.getElementById('hiddenWidgetsPanel').classList.remove('show');
        }
        
        // Afficher notification
        showToast(`Widget ${this.getWidgetTitle(widgetId)} affiché`, 'success');
    }
    
    /**
     * Affiche les widgets masqués dans le panneau
     */
    renderHiddenWidgets() {
        const hiddenWidgetsList = document.getElementById('hiddenWidgetsList');
        hiddenWidgetsList.innerHTML = '';
        
        if (this.hiddenWidgets.length === 0) {
            hiddenWidgetsList.innerHTML = '<p class="text-muted mb-0">Aucun widget masqué</p>';
            return;
        }
        
        this.hiddenWidgets.forEach(hiddenWidget => {
            const widget = this.widgets.find(w => w.id === hiddenWidget.id);
            if (!widget) return;
            
            const widgetIcon = document.createElement('div');
            widgetIcon.className = 'widget-icon';
            widgetIcon.dataset.id = widget.id;
            widgetIcon.innerHTML = `
                <i class="bi ${widget.icon}"></i>
                <span>${widget.title}</span>
            `;
            
            hiddenWidgetsList.appendChild(widgetIcon);
        });
    }
    
    /**
     * Obtient le titre d'un widget à partir de son ID
     * @param {string} widgetId - ID du widget
     * @returns {string} - Titre du widget
     */
    getWidgetTitle(widgetId) {
        const widget = this.widgets.find(w => w.id === widgetId);
        return widget ? widget.title : widgetId;
    }
    
    async loadDashboardData() {
        try {
            this.showLoading();
            
            // Récupérer les statistiques du tableau de bord
            const dashboardStats = await this.apiService.getDashboardStats(this.selectedPilotId);
            this.stats = dashboardStats;
            
            // --- DEBUG: Affiche les stats reçues ---
            console.log('[DEBUG] Stats reçues du backend:', this.stats);
            
            // Récupérer les actions récentes et critiques
            const criticalActions = await this.apiService.getDashboardAlerts();
            this.criticalActions = criticalActions;
            
            // Mettre à jour les éléments du tableau de bord
            this.updateStats();
            this.initCharts();
            this.renderActionLists();
            
            // Redimensionner tous les widgets après l'initialisation
            this.resizeAllWidgets();
            
            // Forcer un redimensionnement après un délai pour s'assurer que tout est stable
            setTimeout(() => {
                this.resizeAllWidgets();
            }, 500);
            
            this.hideLoading();
            
            // Notification de succès
            showToast('Tableau de bord mis à jour', 'success');
        } catch (error) {
            console.error('Error loading dashboard data:', error);
            showToast('Erreur lors du chargement des données', 'error');
            this.hideLoading();
        }
    }
    
    async updateStats() {
        // Mettre à jour les statistiques seulement si les éléments existent dans le DOM
        const updateElement = (id, value, defaultValue = 0) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = value !== undefined ? value : defaultValue;
            }
        };
        
        // Mise à jour des chiffres clés
        updateElement('totalActions', this.stats.total_actions);
        updateElement('completedActions', this.stats.completed_actions);
        updateElement('inProgressActions', this.stats.in_progress_actions);
        // Utiliser directement la valeur du backend pour les actions en retard
        updateElement('overdueActions', this.stats.overdue_actions);

        // Mettre à jour les métriques de performance affichées sous le graphique
        const onTimeCount = (this.stats.completed_on_time || 0) + (this.stats.in_progress_on_time || 0);
        const lateCount = (this.stats.completed_overdue || 0) + (this.stats.in_progress_overdue || 0);
        
        updateElement('onTimeCount', onTimeCount);
        updateElement('lateCount', lateCount);
    }
    
    initCharts() {
        console.log('[Dashboard] Début d\'initialisation des graphiques');
        console.log('[Dashboard] Données stats disponibles:', this.stats);
        
        // Vérifier si Chart.js est disponible
        if (typeof Chart === 'undefined') {
            console.error('[Dashboard] Chart.js n\'est pas chargé !');
            showToast('Erreur: Chart.js non disponible', 'error');
            return;
        }
        
        // Nettoyer les graphiques existants
        Object.values(this.charts).forEach(chart => {
            if (chart && typeof chart.destroy === 'function') {
                chart.destroy();
            }
        });
        
        // Réinitialiser la collection de graphiques
        this.charts = {};
        
            // Vérifier la version du cache et forcer une mise à jour si nécessaire
            this.checkCacheVersion();
        
        // Configuration globale pour Chart.js avec responsive design amélioré
        Chart.defaults.responsive = true;
        Chart.defaults.maintainAspectRatio = false;
        Chart.defaults.plugins.legend.display = true;
        Chart.defaults.plugins.legend.position = 'bottom';
        Chart.defaults.plugins.tooltip.enabled = true;
        Chart.defaults.plugins.tooltip.mode = 'nearest';
        Chart.defaults.plugins.tooltip.intersect = false;
        Chart.defaults.animation.duration = 1000;
        Chart.defaults.interaction.mode = 'nearest';
        Chart.defaults.interaction.intersect = false;
        
        // Fonction utilitaire pour initialiser un graphique avec gestion du redimensionnement
        const initializeChart = (chartId, initFunction) => {
            console.log(`[Dashboard] Tentative d'initialisation du graphique: ${chartId}`);
            const canvas = document.getElementById(chartId);
            if (canvas) {
                console.log(`[Dashboard] Canvas trouvé pour ${chartId}`);
                try {
                    // Nettoyer le canvas
                    const ctx = canvas.getContext('2d');
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    
                    // Initialiser le graphique
                    const chart = initFunction(canvas);
                    if (chart) {
                        console.log(`[Dashboard] Graphique ${chartId} créé avec succès`);
                        this.charts[chartId] = chart;
                        
                        // Ajouter un observer pour le redimensionnement automatique
                        this.setupChartResizeObserver(canvas, chart);
                    } else {
                        console.warn(`[Dashboard] Échec de création du graphique ${chartId} - fonction a retourné null`);
                    }
                } catch (error) {
                    console.error(`[Dashboard] Erreur lors de l'initialisation du graphique ${chartId}:`, error);
                    showToast(`Erreur graphique ${chartId}: ${error.message}`, 'error');
                }
            } else {
                console.warn(`[Dashboard] Canvas non trouvé pour le graphique: ${chartId}`);
            }
        };
        
        // Graphique en secteurs pour la répartition par priorité
        initializeChart('priorityChart', (canvas) => {
            console.log('[Dashboard] Initialisation priorityChart');
            
            // Utiliser les données de actions_by_priority pour une meilleure robustesse
            const priorityMap = this.stats.actions_by_priority || {};
            const data = {
                high: priorityMap['1'] || 0,
                medium: priorityMap['2'] || 0,
                low: (priorityMap['3'] || 0) + (priorityMap['0'] || 0), // Traiter les anciennes valeurs (0) comme basse priorité
                tbd: priorityMap['4'] || 0,
            };
            
            // Si pas d'actions, laisser toutes les valeurs à zéro
            
            console.log('[Dashboard] Données priorité (depuis actions_by_priority):', data);
            
            return new Chart(canvas, {
                type: 'doughnut',
                data: {
                    labels: ['Haute priorité', 'Priorité moyenne', 'Priorité basse', 'À planifier'],
                    datasets: [{
                        data: [data.high || 0, data.medium || 0, data.low || 0, data.tbd || 0],
                        backgroundColor: [
                            'rgba(220, 53, 69, 0.8)',  // Rouge pour haute
                            'rgba(255, 193, 7, 0.8)',  // Jaune pour moyenne
                            'rgba(25, 135, 84, 0.8)',   // Vert pour basse
                            'rgba(108, 117, 125, 0.8)' // Gris pour "À planifier"
                        ],
                        borderColor: [
                            'rgba(220, 53, 69, 1)',
                            'rgba(255, 193, 7, 1)',
                            'rgba(25, 135, 84, 1)',
                            'rgba(108, 117, 125, 1)'
                        ],
                        borderWidth: 2,
                        hoverOffset: 10
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                padding: 20,
                                usePointStyle: true,
                                font: {
                                    size: 11
                                }
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                    const percentage = total > 0 ? ((context.parsed / total) * 100).toFixed(1) : 0;
                                    return `${context.label}: ${context.parsed} (${percentage}%)`;
                                }
                            }
                        }
                    },
                    animation: {
                        animateRotate: true,
                        duration: 1500
                    }
                }
            });
        });
        
        // Graphique en barres pour la répartition par lieu
        initializeChart('locationChart', (canvas) => {
            console.log('[Dashboard] Initialisation locationChart');
            
            // Utiliser les données disponibles ou des valeurs par défaut
            let locationData = this.stats.location_distribution || this.stats.location_data || {};
            
            // Si pas de données et qu'il n'y a pas d'actions, ne pas afficher de placeholders
            if (Object.keys(locationData).length === 0) {
                if (this.stats.total_actions > 0) {
                    // S'il y a des actions mais pas de données de localisation, créer des exemples
                    locationData = {
                        'Bureau': Math.ceil(this.stats.total_actions / 2),
                        'Atelier': Math.floor(this.stats.total_actions / 2)
                    };
                } else {
                    // S'il n'y a pas d'actions, utiliser un tableau vide (aucun lieu à afficher)
                    locationData = {};
                }
            }
            
            const locations = Object.keys(locationData);
            const counts = Object.values(locationData);
            
            console.log('[Dashboard] Données lieux:', { locations, counts });
            
            return new Chart(canvas, {
                type: 'bar',
                data: {
                    labels: locations,
                    datasets: [{
                        label: 'Actions par lieu',
                        data: counts,
                        backgroundColor: 'rgba(54, 162, 235, 0.8)',
                        borderColor: 'rgba(54, 162, 235, 1)',
                        borderWidth: 2,
                        borderRadius: 8,
                        borderSkipped: false,
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: false
                        },
                        tooltip: {
                            mode: 'index',
                            intersect: false,
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                stepSize: 1,
                                font: {
                                    size: 10
                                }
                            },
                            grid: {
                                color: 'rgba(0, 0, 0, 0.1)'
                            }
                        },
                        x: {
                            ticks: {
                                maxRotation: 45,
                                minRotation: 0,
                                font: {
                                    size: 10
                                }
                            },
                            grid: {
                                display: false
                            }
                        }
                    },
                    animation: {
                        delay: (context) => context.dataIndex * 100,
                        duration: 1000
                    }
                }
            });
        });
        
        // Graphique en barres horizontales pour coût prévu vs coût total
        initializeChart('costChart', (canvas) => {
            console.log('[Dashboard] Initialisation costChart');
            
            // N'utiliser de valeurs par défaut que s'il y a des actions
            let budgetTotal = this.stats.budget_total || this.stats.total_budget_initial;
            let actualCostTotal = this.stats.actual_cost_total || this.stats.total_actual_cost;
            
            // Si pas de données réelles et qu'il y a des actions, utiliser des placeholders
            if ((budgetTotal === undefined || actualCostTotal === undefined) && this.stats.total_actions > 0) {
                budgetTotal = budgetTotal || 1000;
                actualCostTotal = actualCostTotal || 800;
            } else if (this.stats.total_actions === 0) {
                // S'il n'y a pas d'actions, mettre les deux valeurs à zéro
                budgetTotal = 0;
                actualCostTotal = 0;
            }
            
            console.log('[Dashboard] Données coûts:', { budgetTotal, actualCostTotal });
            
            return new Chart(canvas, {
                type: 'bar',
                data: {
                    labels: ['Coût Prévu', 'Coût Réel'],
                    datasets: [{
                        label: 'Montant (€)',
                        data: [budgetTotal, actualCostTotal],
                        backgroundColor: [
                            'rgba(75, 192, 192, 0.8)',
                            actualCostTotal > budgetTotal ? 'rgba(255, 99, 132, 0.8)' : 'rgba(54, 162, 235, 0.8)'
                        ],
                        borderColor: [
                            'rgba(75, 192, 192, 1)',
                            actualCostTotal > budgetTotal ? 'rgba(255, 99, 132, 1)' : 'rgba(54, 162, 235, 1)'
                        ],
                        borderWidth: 2,
                        borderRadius: 8
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: false
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    return `${context.label}: ${context.parsed.y.toLocaleString('fr-FR')} €`;
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                callback: function(value) {
                                    return value.toLocaleString('fr-FR') + ' €';
                                },
                                font: {
                                    size: 10
                                }
                            },
                            grid: {
                                color: 'rgba(0, 0, 0, 0.1)'
                            }
                        },
                        x: {
                            ticks: {
                                font: {
                                    size: 11
                                }
                            },
                            grid: {
                                display: false
                            }
                        }
                    },
                    animation: {
                        delay: (context) => context.dataIndex * 200,
                        duration: 1200
                    }
                }
            });
        });
        

        
        // Le graphique de tendances des actions a été supprimé
        
        // Graphique de répartition par statut (barres horizontales colorées)
        initializeChart('statusChart', (canvas) => {
            console.log('[Dashboard] Initialisation statusChart');
            
            const statuses = ['En attente', 'En cours', 'Terminé', 'Annulé'];
            const statusData = [
                this.stats.pending_actions || 0,
                this.stats.in_progress_actions || 0,
                this.stats.completed_actions || 0,
                this.stats.cancelled_actions || 0
            ];
            
            console.log('[Dashboard] Données statuts:', statusData);
            
            return new Chart(canvas, {
                type: 'bar',
                data: {
                    labels: statuses,
                    datasets: [{
                        label: 'Nombre d\'actions',
                        data: statusData,
                        backgroundColor: [
                            'rgba(255, 193, 7, 0.8)',   // Jaune pour en attente
                            'rgba(54, 162, 235, 0.8)',  // Bleu pour en cours
                            'rgba(25, 135, 84, 0.8)',   // Vert pour terminé
                            'rgba(108, 117, 125, 0.8)'  // Gris pour annulé
                        ],
                        borderColor: [
                            'rgba(255, 193, 7, 1)',
                            'rgba(54, 162, 235, 1)',
                            'rgba(25, 135, 84, 1)',
                            'rgba(108, 117, 125, 1)'
                        ],
                        borderWidth: 2,
                        borderRadius: 8,
                        borderSkipped: false,
                    }]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: false
                        },
                        tooltip: {
                            backgroundColor: 'rgba(0, 0, 0, 0.8)',
                            titleColor: 'white',
                            bodyColor: 'white',
                            callbacks: {
                                label: function(context) {
                                    const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                    const percentage = total > 0 ? ((context.parsed.x / total) * 100).toFixed(1) : 0;
                                    return `${context.parsed.x} actions (${percentage}%)`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            beginAtZero: true,
                            grid: {
                                color: 'rgba(0, 0, 0, 0.05)'
                            },
                            ticks: {
                                stepSize: 1,
                                font: {
                                    size: 10
                                }
                            }
                        },
                        y: {
                            grid: {
                                display: false
                            },
                            ticks: {
                                font: {
                                    size: 10
                                }
                            }
                        }
                    },
                    animation: {
                        delay: (context) => context.dataIndex * 200,
                        duration: 1500,
                        easing: 'easeOutBounce'
                    }
                }
            });
        });

        // Graphique de performance globale (KPI principal)
        initializeChart('performanceChart', (canvas) => {
            console.log('[Dashboard] Initialisation performanceChart');
            
            // Utiliser directement les données du backend
            const onTime = (this.stats.completed_on_time || 0) + (this.stats.in_progress_on_time || 0);
            const late = (this.stats.completed_overdue || 0) + (this.stats.in_progress_overdue || 0);
            const performancePercentage = this.stats.performance_percentage || 0;
            
            // Rendre les détails disponibles pour l'infobulle
            const completedOnTime = this.stats.completed_on_time || 0;
            const completedOverdue = this.stats.completed_overdue || 0;
            const inProgressOnTime = this.stats.in_progress_on_time || 0;
            const inProgressOverdue = this.stats.in_progress_overdue || 0;
            
            console.log('[Dashboard] Données performance depuis this.stats:', { onTime, late, performancePercentage });
            
            return new Chart(canvas, {
        type: 'doughnut',
        data: {
                    labels: ['À temps', 'En retard'],
            datasets: [{
                        data: [onTime, late],
                        backgroundColor: [
                            '#198754',   // Vert Bootstrap pour à temps
                            '#dc3545'    // Rouge Bootstrap pour en retard
                        ],
                        borderColor: '#ffffff',
                        borderWidth: 4,
                        hoverOffset: 15,
                        cutout: '65%' // Pour le style doughnut avec plus d'espace au centre
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                                padding: 20,
                                usePointStyle: true,
                        font: {
                                    size: 12,
                                    weight: 'bold'
                                },
                                color: '#333'
                    }
                },
                tooltip: {
                            backgroundColor: 'rgba(0, 0, 0, 0.9)',
                            titleColor: 'white',
                            bodyColor: 'white',
                            borderColor: 'rgba(255, 255, 255, 0.3)',
                            borderWidth: 1,
                    callbacks: {
                        label: function(context) {
                                    const total = onTime + late;
                                    if (total === 0) return `${context.label}: 0 actions (0%)`;
                                    
                                    const percentage = ((context.parsed / total) * 100).toFixed(1);
                                    return `${context.label}: ${context.parsed} actions (${percentage}%)`;
                                },
                                afterLabel: function(context) {
                                    if (context.label === 'À temps') {
                                        return [
                                            ``,
                                            `Détail:`,
                                            `• Terminées à temps: ${completedOnTime}`,
                                            `• En cours à temps: ${inProgressOnTime}`,
                                            ``,
                                            `Taux de réussite global: ${performancePercentage}%`
                                        ];
                                    } else {
                                        return [
                                            ``,
                                            `Détail:`,
                                            `• Terminées en retard: ${completedOverdue}`,
                                            `• En cours en retard: ${inProgressOverdue}`,
                                            ``,
                                            `Taux de retard: ${100 - performancePercentage}%`
                                        ];
                                    }
                                }
                            }
                        }
                    },
                    animation: {
                        animateRotate: true,
                        duration: 2000,
                        easing: 'easeOutBounce'
                    },
                    // Ajouter un texte au centre du doughnut
                    elements: {
                        center: {
                            text: `${performancePercentage}%`,
                            color: performancePercentage >= 80 ? '#198754' : performancePercentage >= 60 ? '#fd7e14' : '#dc3545',
                            fontStyle: 'bold',
                            sidePadding: 20,
                            minFontSize: 16,
                            lineHeight: 25
                        }
                    }
                },
                plugins: [{
                    // Plugin personnalisé pour afficher le pourcentage au centre
                    beforeDraw: function(chart) {
                        const { width, height, ctx } = chart;
                        
                        ctx.restore();
                        const fontSize = Math.min(height / 8, 24);
                        ctx.font = `bold ${fontSize}px Arial`;
                        ctx.textBaseline = 'middle';
                        
                        // Couleur selon le pourcentage
                        const percentage = parseFloat(performancePercentage);
                        if (percentage >= 80) {
                            ctx.fillStyle = '#198754'; // Vert
                        } else if (percentage >= 60) {
                            ctx.fillStyle = '#fd7e14'; // Orange
                        } else {
                            ctx.fillStyle = '#dc3545'; // Rouge
                        }
                        
                        const text = `${performancePercentage}%`;
                        const textX = Math.round((width - ctx.measureText(text).width) / 2);
                        const textY = height / 2;
                        
                        ctx.fillText(text, textX, textY);
                        
                        // Ajouter "Réussite" en dessous
                        ctx.font = `normal ${fontSize * 0.6}px Arial`;
                        ctx.fillStyle = '#666';
                        const subText = 'Réussite';
                        const subTextX = Math.round((width - ctx.measureText(subText).width) / 2);
                        const subTextY = textY + fontSize * 0.8;
                        
                        ctx.fillText(subText, subTextX, subTextY);
                        ctx.save();
                    }
                }]
    });
});

        // Programmer un redimensionnement après un court délai pour s'assurer que tout est rendu
        setTimeout(() => {
            console.log(`[Dashboard] ${Object.keys(this.charts).length} graphiques créés:`, Object.keys(this.charts));
            this.resizeAllCharts();
        }, 100);
    }
    
    /**
     * Met à jour le graphique de performance globale
     */
    updatePerformanceChart() {
        const ctx = document.getElementById('performanceChart');
        if (!ctx) return;
        
        // Utiliser les nouvelles données du backend
        const completedOnTime = this.stats.completed_on_time || 0;
        const completedOverdue = this.stats.completed_overdue || 0;
        const inProgressOnTime = this.stats.in_progress_on_time || 0;
        const inProgressOverdue = this.stats.in_progress_overdue || 0;
        const performancePercentage = this.stats.performance_percentage || 0;
        
        // Calculer les totaux
        const totalOnTime = completedOnTime + inProgressOnTime;
        const totalOverdue = completedOverdue + inProgressOverdue;
        
        // Déterminer la couleur selon le pourcentage
        let centerColor = '#28a745'; // Vert par défaut
        if (performancePercentage < 60) {
            centerColor = '#dc3545'; // Rouge
        } else if (performancePercentage < 80) {
            centerColor = '#ffc107'; // Orange
        }
        
        const data = {
            labels: ['À temps', 'En retard'],
            datasets: [{
                data: [totalOnTime, totalOverdue],
                backgroundColor: ['#28a745', '#dc3545'],
                borderWidth: 2,
                borderColor: '#fff'
            }]
        };
        
        const options = {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 15,
                        font: {
                            size: 12
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.parsed || 0;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
                            
                            // Détail selon le type
                            if (label === 'À temps') {
                                return [
                                    `${label}: ${value} actions (${percentage}%)`,
                                    `- Terminées: ${completedOnTime}`,
                                    `- En cours: ${inProgressOnTime}`
                                ];
                            } else {
                                return [
                                    `${label}: ${value} actions (${percentage}%)`,
                                    `- Terminées: ${completedOverdue}`,
                                    `- En cours: ${inProgressOverdue}`
                                ];
                            }
                        }
                    }
                }
            }
        };
        
        // Plugin pour afficher le pourcentage au centre
        const centerTextPlugin = {
            id: 'centerText',
            beforeDraw: function(chart) {
                const width = chart.width;
                const height = chart.height;
                const ctx = chart.ctx;
                
                ctx.restore();
                const fontSize = (height / 114).toFixed(2);
                ctx.font = `bold ${fontSize}em sans-serif`;
                ctx.textBaseline = "middle";
                ctx.fillStyle = centerColor;
                
                const text = `${performancePercentage}%`;
                const textX = Math.round((width - ctx.measureText(text).width) / 2);
                const textY = height / 2 - 10;
                
                ctx.fillText(text, textX, textY);
                
                // Sous-titre
                ctx.font = `${fontSize * 0.4}em sans-serif`;
                ctx.fillStyle = '#666';
                const subtitle = 'Performance';
                const subtitleX = Math.round((width - ctx.measureText(subtitle).width) / 2);
                const subtitleY = height / 2 + 15;
                
                ctx.fillText(subtitle, subtitleX, subtitleY);
                ctx.save();
            }
        };
        
        // Créer ou mettre à jour le graphique
        if (this.charts.performanceChart) {
            this.charts.performanceChart.data = data;
            this.charts.performanceChart.update();
        } else {
            this.charts.performanceChart = new Chart(ctx, {
                type: 'doughnut',
                data: data,
                options: options,
                plugins: [centerTextPlugin]
            });
        }
        
        // Mettre à jour le badge avec les détails
        const badgeElement = document.querySelector('#performanceChart-widget .widget-badge');
        if (badgeElement) {
            badgeElement.innerHTML = `
                <span class="badge bg-primary">KPI Principal</span>
                <small class="text-muted ms-2">
                    <i class="bi bi-check-circle text-success"></i> ${totalOnTime}
                    <i class="bi bi-x-circle text-danger ms-2"></i> ${totalOverdue}
                </small>
            `;
        }
    }
    
    /**
     * Configure un observer pour le redimensionnement automatique d'un graphique
     * @param {HTMLCanvasElement} canvas - Canvas du graphique
     * @param {Chart} chart - Instance du graphique Chart.js
     */
    setupChartResizeObserver(canvas, chart) {
        if (!canvas || !chart) return;
        
        // Utiliser ResizeObserver pour détecter les changements de taille
        if (window.ResizeObserver) {
            const resizeObserver = new ResizeObserver((entries) => {
                for (let entry of entries) {
                    // Attendre un court délai pour que le DOM soit stabilisé
                    setTimeout(() => {
                        if (chart && !chart.isDestroyed) {
                            chart.resize();
                        }
                    }, 50);
                }
            });
            
            // Observer le conteneur parent du canvas
            const container = canvas.closest('.chart-container') || canvas.closest('.card-body');
            if (container) {
                resizeObserver.observe(container);
                
                // Stocker la référence pour pouvoir la nettoyer plus tard
                if (!chart._resizeObserver) {
                    chart._resizeObserver = resizeObserver;
                }
            }
        }
    }
    
    /**
     * Force le redimensionnement de tous les graphiques
     */
    resizeAllCharts() {
        Object.values(this.charts).forEach(chart => {
            if (chart && !chart.isDestroyed) {
                try {
                    chart.resize();
                } catch (error) {
                    console.warn('Erreur lors du redimensionnement d\'un graphique:', error);
                }
            }
        });
    }
    
    renderActionLists() {
        // Méthode utilitaire pour mettre à jour une liste d'actions si elle existe dans le DOM
        const updateActionList = (listId, actions, noDataMessage, renderFunction) => {
            const listElement = document.getElementById(listId);
            if (!listElement) return; // Le widget n'est pas présent dans le dashboard
            
            if (actions && actions.length > 0) {
                listElement.innerHTML = actions.map(renderFunction).join('');
            } else {
                listElement.innerHTML = noDataMessage;
            }
        };
        
        // Fonction pour rendre une action récente
        const renderAction = (action) => {
            // Vérifier les dépassements
            const isOverBudget = action.actual_cost > action.budget_initial && action.budget_initial > 0;
            const isHighPriority = action.priority === 1; // 1 = Haute priorité
            
            // Date d'aujourd'hui pour les calculs
            const today = new Date();
            
            // Vérifier si la date planifiée est aujourd'hui (même jour/mois/année)
            const plannedDate = action.planned_date ? new Date(action.planned_date) : null;
            let isSameDay = false;
            
            if (plannedDate) {
                isSameDay = (
                    plannedDate.getDate() === today.getDate() &&
                    plannedDate.getMonth() === today.getMonth() &&
                    plannedDate.getFullYear() === today.getFullYear()
                );
            }
            
            // Utiliser la fonction utilitaire pour déterminer si l'action est en retard
            const isOverdue = DateUtils.isActionOverdue(action);

            // Débogage pour comprendre les actions en retard
if (action.planned_date && plannedDate < today && isSameDay) {
    console.log(`[DEBUG_NOT_OVERDUE] Action ${action.id} n'est PAS en retard car c'est aujourd'hui:`, {
        title: action.title,
        planned_date: action.planned_date,
        is_same_day: isSameDay,
        today: today.toDateString(),
        check_status: action.check_status
    });
}

if (isOverdue) {
    console.log(`[DEBUG_OVERDUE] Action ${action.id} est en retard:`, {
        title: action.title,
        planned_date: action.planned_date,
        is_same_day: isSameDay,
        today: today.toDateString(),
        final_status: action.final_status
    });
}
            
            // Classes CSS pour les mises en évidence
            const costClass = isOverBudget ? 'text-danger fw-bold' : '';
            const dateClass = isOverdue ? 'text-danger fw-bold' : '';
            
            return `
            <div class="alert-item ${this.getPriorityClass(action.priority)}">
                <div class="d-flex justify-content-between align-items-center">
                    <h6 class="mb-1">${action.title || 'Sans titre'}</h6>
                    <span class="badge ${action.final_status === 'OK' ? 'bg-success' : (isOverdue ? 'bg-danger' : (isHighPriority ? 'bg-warning' : 'bg-info'))}">
                        ${action.final_status === 'OK' ? 'Terminée' : this.getAlertReason(action)}
                    </span>
                </div>
                <div class="small text-muted">
                    <span><i class="bi bi-geo-alt"></i> ${action.location_name || 'Non spécifié'}</span>
                    <span class="ms-2"><i class="bi bi-person"></i> ${action.assigned_to_name || 'Non assigné'}</span>
                    <span class="ms-2 ${dateClass}"><i class="bi bi-calendar"></i> ${DateUtils.formatDate(action.planned_date)}</span>
                    ${action.budget_initial ? `<span class="ms-2 ${costClass}"><i class="bi bi-currency-euro"></i> ${isOverBudget ? `${action.actual_cost || 0}/${action.budget_initial}` : action.budget_initial}</span>` : ''}
                </div>
                <div class="mt-1">
                    <a href="actions.html?id=${action.id}" class="btn btn-sm btn-outline-secondary">
                        Voir détails
                    </a>
                    ${isOverBudget ? `<span class="badge bg-danger ms-2">Dépassement de coût</span>` : ''}
                    ${isHighPriority ? `<span class="badge bg-danger ms-2">Priorité haute</span>` : ''}
                    ${isOverdue ? `<span class="badge bg-danger ms-2">En retard</span>` : ''}
                </div>
            </div>
            `;
        };
        
        // Fonction pour rendre une action critique
        const renderCriticalAction = (action) => {
            // Vérifier les dépassements
            const isOverBudget = action.actual_cost > action.budget_initial && action.budget_initial > 0;
            const isHighPriority = action.priority === 1; // 1 = Haute priorité
            
            // Date d'aujourd'hui pour les calculs
            const today = new Date();
            
            // Vérifier si la date planifiée est aujourd'hui (même jour/mois/année)
            const plannedDate = action.planned_date ? new Date(action.planned_date) : null;
            let isSameDay = false;
            
            if (plannedDate) {
                isSameDay = (
                    plannedDate.getDate() === today.getDate() &&
                    plannedDate.getMonth() === today.getMonth() &&
                    plannedDate.getFullYear() === today.getFullYear()
                );
            }

// Utiliser la fonction utilitaire pour déterminer si l'action est en retard
const isOverdue = DateUtils.isActionOverdue(action);

// Débogage pour comprendre les actions non en retard malgré date passée
if (action.planned_date && plannedDate < today && isSameDay) {
    console.log(`[DEBUG_NOT_OVERDUE] Action ${action.id} n'est PAS en retard car c'est aujourd'hui:`, {
        title: action.title,
        planned_date: action.planned_date,
        is_same_day: isSameDay,
        today: today.toDateString(),
        check_status: action.check_status
    });
}

if (isOverdue) {
    console.log(`[DEBUG_OVERDUE] Action ${action.id} est en retard:`, {
        title: action.title,
        planned_date: action.planned_date,
        is_same_day: isSameDay,
        today: today.toDateString(),
        final_status: action.final_status
    });
}
            
            // Classes CSS pour les mises en évidence
            const costClass = isOverBudget ? 'text-danger fw-bold' : '';
            const dateClass = isOverdue ? 'text-danger fw-bold' : '';
            
            return `
            <div class="alert-item ${this.getPriorityClass(action.priority)}">
                <div class="d-flex justify-content-between align-items-center">
                    <h6 class="mb-1">${action.title || 'Sans titre'}</h6>
                    <span class="badge ${isOverdue ? 'bg-danger' : (isHighPriority ? 'bg-warning' : 'bg-info')}">
                        ${this.getAlertReason(action)}
                    </span>
                </div>
                <div class="small text-muted">
                    <span><i class="bi bi-geo-alt"></i> ${action.location_name || 'Non spécifié'}</span>
                    <span class="ms-2"><i class="bi bi-person"></i> ${action.assigned_to_name || 'Non assigné'}</span>
                    <span class="ms-2 ${dateClass}"><i class="bi bi-calendar"></i> ${DateUtils.formatDate(action.planned_date)}</span>
                    ${action.budget_initial ? `<span class="ms-2 ${costClass}"><i class="bi bi-currency-euro"></i> ${isOverBudget ? `${action.actual_cost || 0}/${action.budget_initial}` : action.budget_initial}</span>` : ''}
                </div>
                <div class="mt-1">
                    <a href="actions.html?id=${action.id}" class="btn btn-sm btn-outline-danger">
                        Voir détails
                    </a>
                    ${isOverBudget ? `<span class="badge bg-danger ms-2">Dépassement de coût</span>` : ''}
                    ${isHighPriority ? `<span class="badge bg-danger ms-2">Priorité haute</span>` : ''}
                    ${isOverdue ? `<span class="badge bg-danger ms-2">En retard</span>` : ''}
                </div>
            </div>
            `;
        };
        
        // Message à afficher si aucune action récente n'est disponible
        const noRecentActionsMessage = `
            <div class="text-center py-4">
                <i class="bi bi-inbox fs-1 text-muted"></i>
                <p class="mt-2 text-muted">Aucune action récente</p>
            </div>
        `;
        
        // Message à afficher si aucune action critique n'est disponible
        const noCriticalActionsMessage = `
            <div class="text-center py-4">
                <i class="bi bi-check-circle fs-1 text-success"></i>
                <p class="mt-2 text-muted">Aucune action critique</p>
            </div>
        `;
        
        // Filtrer les actions critiques pour ne garder que celles qui sont vraiment importantes
    const filteredCriticalActions = (this.criticalActions || []).filter(action => {
        const isOverBudget = action.actual_cost > action.budget_initial && action.budget_initial > 0;
        const isHighPriority = action.priority === 1; // 1 = Haute priorité
        const today = new Date();
        const plannedDate = action.planned_date ? new Date(action.planned_date) : null;
        let isSameDay = false;
        
        if (plannedDate) {
            isSameDay = (
                plannedDate.getDate() === today.getDate() &&
                plannedDate.getMonth() === today.getMonth() &&
                plannedDate.getFullYear() === today.getFullYear()
            );
        }
        
        const isOverdue = DateUtils.isActionOverdue(action);
        
        // Une action est critique SEULEMENT si elle est de priorité haute (selon nouvelles spécifications)
        return isHighPriority;
    });

    // Mettre à jour les listes d'actions si elles existent
    updateActionList(
        'recentActionsList', 
        this.stats.recent_actions || [], 
        '<div class="alert alert-info">Aucune action récente à afficher</div>', 
        renderAction
    );
    
    updateActionList(
        'criticalActionsList', 
        filteredCriticalActions, 
        '<div class="alert alert-info">Aucune alerte critique à afficher</div>', 
        renderCriticalAction
    );
}
    
    /**
     * Obtient la classe CSS correspondant à la priorité
     * @param {number} priority - Niveau de priorité (1-3)
     * @returns {string} - Classe CSS
     */
    getPriorityClass(priority) {
        switch (parseInt(priority)) {
            case 1:
                return 'priority-high';   // 1 = Haute (rouge)
            case 2:
                return 'priority-medium'; // 2 = Moyenne (jaune)
            case 3:
                return 'priority-low';    // 3 = Basse (verte)
            case 4 :
                return 'priority-tbd';	  // 4 = À planifier (gris)
            default:
                return 'priority-tbd';    // Par défaut, utiliser priorité À planifier 
        }
    }
    
    /**
     * Obtient la raison de l'alerte pour une action critique
     * @param {Object} action - Action critique
     * @returns {string} - Raison de l'alerte
     */
    getAlertReason(action) {
        // Vérifier les dépassements
        const isOverBudget = action.actual_cost > action.budget_initial && action.budget_initial > 0;
        const isHighPriority = action.priority === 1; // 1 = Haute priorité
        
        // Date d'aujourd'hui pour les calculs
        const today = new Date();
        const plannedDate = action.planned_date ? new Date(action.planned_date) : null;

        // Vérifier si la date planifiée est aujourd'hui (même jour/mois/année)
        let isSameDay = false;
        if (plannedDate) {
            isSameDay = (
                plannedDate.getDate() === today.getDate() &&
                plannedDate.getMonth() === today.getMonth() &&
                plannedDate.getFullYear() === today.getFullYear()
            );
        }

        // Utiliser la fonction utilitaire pour déterminer si l'action est en retard
        const isOverdue = DateUtils.isActionOverdue(action);

        // Débogage pour comprendre pourquoi cette action est ou n'est pas en retard
        if (action.planned_date && plannedDate < today && isSameDay) {
            console.log(`[DEBUG_ALERT_NOT_OVERDUE] Action ${action.id} n'est PAS en retard car c'est aujourd'hui:`, {
                title: action.title,
                planned_date: action.planned_date,
                is_same_day: isSameDay,
                today: today.toDateString(),
                check_status: action.check_status
            });
        }

        if (isOverdue) {
            console.log(`[DEBUG_ALERT_OVERDUE] Action ${action.id} est en retard:`, {
                title: action.title,
                planned_date: action.planned_date,
                is_same_day: isSameDay,
                today: today.toDateString(),
                final_status: action.final_status
            });
        }
        
        // Déterminer la raison principale
        if (isOverdue) {
            return 'En retard';
        } else if (isHighPriority) {
            return 'Priorité haute';
        } else if (isOverBudget) {
            return 'Dépassement budget';
        } else if (isSameDay) {
            return 'Aujourd\'hui';
        } else {
            // Si la date planifiée est dépassée (avant aujourd'hui) et que l'action n'est pas complétée
            // alors on affiche "En retard" au lieu de "À venir"
            if (plannedDate && plannedDate < today && action.final_status !== 'OK') {
                return 'En retard';
            } else {
                return 'À venir';
            }
        }
    }
    
    /**
     * Affiche l'indicateur de chargement
     */
    showLoading() {
        const loadingIndicator = document.getElementById('loadingIndicator');
        if (loadingIndicator) {
            loadingIndicator.style.display = 'flex';
        }
    }
    
    /**
     * Masque l'indicateur de chargement
     */
    hideLoading() {
        const loadingIndicator = document.getElementById('loadingIndicator');
        if (loadingIndicator) {
            loadingIndicator.style.display = 'none';
        }
    }
    
    /**
     * Redimensionne tous les widgets du dashboard
     */
    resizeAllWidgets() {
        // Redimensionner d'abord tous les graphiques
        this.resizeAllCharts();
        
        // Ensuite traiter les autres éléments des widgets
        const widgets = document.querySelectorAll('.grid-stack-item');
        if (widgets && widgets.length > 0) {
            widgets.forEach(widget => {
                this.resizeWidgetContent(widget);
            });
        }
    }
    
    /**
     * Redimensionne dynamiquement le contenu d'un widget (graphiques, tableaux, etc.)
     * @param {HTMLElement} element - Élément widget qui a été redimensionné
     */
    resizeWidgetContent(element) {
        if (!element) return;
        
        // Récupérer l'ID du widget
        const widgetId = element.getAttribute('gs-id');
        if (!widgetId) return;
        
        // Déterminer les dimensions du widget
        const width = parseInt(element.getAttribute('gs-w')) || 0;
        const height = parseInt(element.getAttribute('gs-h')) || 0;
        const isSmallWidget = width < 4 || height < 4;
        const isTinyWidget = width < 3 || height < 3;
        
        // Calculer les dimensions réelles du widget
        const widgetRect = element.getBoundingClientRect();
        const actualWidth = widgetRect.width;
        const actualHeight = widgetRect.height;
        
        // 1. GÉRER LES GRAPHIQUES avec Chart.js
        const chart = this.charts[widgetId];
        if (chart && !chart.isDestroyed) {
            // Adapter les options du graphique selon la taille
            const options = chart.options;
            
            if (isTinyWidget || actualWidth < 250) {
                // Pour les très petits widgets, simplifier l'affichage
                options.plugins.legend.display = false;
                options.plugins.tooltip.enabled = true; // Garder les tooltips
                if (options.scales) {
                    Object.keys(options.scales).forEach(scaleKey => {
                        if (options.scales[scaleKey].ticks) {
                            options.scales[scaleKey].ticks.display = false;
                        }
                    });
                }
            } else if (isSmallWidget || actualWidth < 400) {
                // Pour les petits widgets, réduire les éléments
                options.plugins.legend.display = true;
                options.plugins.legend.position = 'bottom';
                options.plugins.legend.labels = { 
                    font: { size: 9 },
                    padding: 8,
                    boxWidth: 8
                };
                options.plugins.tooltip.enabled = true;
                if (options.scales) {
                    Object.keys(options.scales).forEach(scaleKey => {
                        if (options.scales[scaleKey].ticks) {
                            options.scales[scaleKey].ticks.font = { size: 8 };
                            options.scales[scaleKey].ticks.display = true;
                            options.scales[scaleKey].ticks.maxTicksLimit = 5;
                        }
                    });
                }
            } else {
                // Pour les widgets normaux, affichage complet
                options.plugins.legend.display = true;
                options.plugins.legend.position = 'bottom';
                options.plugins.legend.labels = { 
                    font: { size: 11 },
                    padding: 15,
                    boxWidth: 12
                };
                options.plugins.tooltip.enabled = true;
                if (options.scales) {
                    Object.keys(options.scales).forEach(scaleKey => {
                        if (options.scales[scaleKey].ticks) {
                            options.scales[scaleKey].ticks.font = { size: 10 };
                            options.scales[scaleKey].ticks.display = true;
                            options.scales[scaleKey].ticks.maxTicksLimit = 8;
                        }
                    });
                }
            }
        }
        
        // 2. ADAPTER LA HAUTEUR DES CONTENEURS DE GRAPHIQUES AVEC PRECISION
        const chartContainer = element.querySelector('.chart-container');
        if (chartContainer) {
            const cardHeader = element.querySelector('.card-header');
            const cardBody = element.querySelector('.card-body');
            
            if (cardBody) {
                // Calculs précis des espaces occupés
                const cardStyles = window.getComputedStyle(cardBody);
                const cardPaddingTop = parseInt(cardStyles.paddingTop) || 0;
                const cardPaddingBottom = parseInt(cardStyles.paddingBottom) || 0;
                const cardPadding = cardPaddingTop + cardPaddingBottom;
                
                const headerHeight = cardHeader ? cardHeader.offsetHeight : 0;
                
                // Hauteur disponible = hauteur totale - header - padding du card-body
                const availableHeight = actualHeight - headerHeight - cardPadding - 10; // -10 pour marge de sécurité
                
                // Calculer la hauteur optimale
                let optimalHeight;
                if (isTinyWidget || actualHeight < 150) {
                    optimalHeight = Math.max(60, Math.min(availableHeight, 100));
                } else if (isSmallWidget || actualHeight < 250) {
                    optimalHeight = Math.max(100, Math.min(availableHeight, 180));
                } else {
                    optimalHeight = Math.max(150, availableHeight - 30); // -30 pour légende
                }
                
                // Appliquer la nouvelle hauteur
                chartContainer.style.height = `${Math.floor(optimalHeight)}px`;
                chartContainer.style.width = '100%';
                chartContainer.style.position = 'relative';
                
                // Forcer la mise à jour du graphique après changement de taille du conteneur
                if (chart && !chart.isDestroyed) {
                    // Double update : d'abord les options, puis le resize
                    chart.update('none');
                    setTimeout(() => {
                        if (chart && !chart.isDestroyed) {
                            chart.resize();
                        }
                    }, 50);
                }
            }
        }
        
        // 3. ADAPTER LES TABLEAUX ET LISTES AVEC PRECISION
        const tableContainer = element.querySelector('.table-responsive');
        if (tableContainer) {
            const cardBody = element.querySelector('.card-body');
            if (cardBody) {
                const cardHeader = element.querySelector('.card-header');
                const headerHeight = cardHeader ? cardHeader.offsetHeight : 0;
                const cardStyles = window.getComputedStyle(cardBody);
                const cardPadding = parseInt(cardStyles.paddingTop) + parseInt(cardStyles.paddingBottom);
                
                const availableHeight = actualHeight - headerHeight - cardPadding - 30; // -30 pour marge
                let maxHeight;
                
                if (isTinyWidget || actualHeight < 150) {
                    maxHeight = Math.max(80, availableHeight);
                    const table = tableContainer.querySelector('table');
                    if (table) {
                        table.classList.add('small-widget-table');
                        table.style.fontSize = '0.7rem';
                    }
                } else if (isSmallWidget || actualHeight < 250) {
                    maxHeight = Math.max(120, availableHeight);
                    const table = tableContainer.querySelector('table');
                    if (table) {
                        table.classList.add('small-widget-table');
                        table.style.fontSize = '0.8rem';
                    }
                } else {
                    maxHeight = Math.max(180, availableHeight);
                    const table = tableContainer.querySelector('table');
                    if (table) {
                        table.classList.remove('small-widget-table');
                        table.style.fontSize = '';
                    }
                }
                
                tableContainer.style.maxHeight = `${Math.floor(maxHeight)}px`;
                tableContainer.style.overflowY = 'auto';
                tableContainer.style.overflowX = 'hidden';
            }
        }
        
        // 4. ADAPTER LES LISTES D'ACTIONS AVEC PRECISION
        const actionsList = element.querySelector('#recentActionsList, #criticalActionsList');
        if (actionsList) {
            const cardBody = element.querySelector('.card-body');
            if (cardBody) {
                const cardHeader = element.querySelector('.card-header');
                const headerHeight = cardHeader ? cardHeader.offsetHeight : 0;
                const cardStyles = window.getComputedStyle(cardBody);
                const cardPadding = parseInt(cardStyles.paddingTop) + parseInt(cardStyles.paddingBottom);
                
                const availableHeight = actualHeight - headerHeight - cardPadding - 20;
                let maxHeight;
                
                if (isTinyWidget || actualHeight < 150) {
                    maxHeight = Math.max(60, availableHeight);
                    actionsList.style.fontSize = '0.7rem';
                } else if (isSmallWidget || actualHeight < 250) {
                    maxHeight = Math.max(100, availableHeight);
                    actionsList.style.fontSize = '0.8rem';
                } else {
                    maxHeight = Math.max(150, availableHeight);
                    actionsList.style.fontSize = '';
                }
                
                actionsList.style.maxHeight = `${Math.floor(maxHeight)}px`;
                actionsList.style.overflowY = 'auto';
                actionsList.style.overflowX = 'hidden';
            }
        }
        
        // 5. ADAPTER LES CARTES STATISTIQUES SELON LA TAILLE REELLE
        if (widgetId.startsWith('stats')) {
            const displayValue = element.querySelector('.display-2');
            const heading = element.querySelector('h3');
            const icon = element.querySelector('.fs-1');
            
            // Adapter selon la largeur ET la hauteur réelles
            if (actualWidth < 200 || actualHeight < 120) {
                // Très petit widget
                if (displayValue) displayValue.className = 'display-5 fw-bold me-1';
                if (heading) heading.className = 'small mb-0 flex-grow-1';
                if (icon) icon.className = 'bi fs-4 ps-1';
            } else if (actualWidth < 300 || actualHeight < 150) {
                // Petit widget
                if (displayValue) displayValue.className = 'display-4 fw-bold me-2';
                if (heading) heading.className = 'h6 mb-0 flex-grow-1';
                if (icon) icon.className = 'bi fs-3 ps-2';
            } else if (actualWidth < 400 || actualHeight < 200) {
                // Widget moyen
                if (displayValue) displayValue.className = 'display-3 fw-bold me-3';
                if (heading) heading.className = 'h5 mb-0 flex-grow-1';
                if (icon) icon.className = 'bi fs-2 ps-2';
            } else {
                // Grand widget
                if (displayValue) displayValue.className = 'display-2 fw-bold me-3';
                if (heading) heading.className = 'h3 mb-0 flex-grow-1';
                if (icon) icon.className = 'bi fs-1 ps-2';
            }
        }
    }
}

// Initialiser le tableau de bord lors du chargement de la page
document.addEventListener('DOMContentLoaded', function() {
    // Vérifier si le module GridStack est disponible
    if (typeof GridStack === 'undefined') {
        console.error('GridStack library is not loaded. Dashboard cannot be initialized.');
        showToast('Erreur de chargement: librairie GridStack non disponible', 'error');
        return;
    }
    
    // Initialisation du tableau de bord
    const dashboard = new Dashboard();
    dashboard.init();
    
    // Ajouter un gestionnaire d'événement pour le bouton de rafraîchissement forcé
    const hardRefreshButton = document.getElementById('hardRefreshButton');
    if (hardRefreshButton) {
        hardRefreshButton.addEventListener('click', function() {
            // Forcer un rechargement complet de la page sans utiliser le cache
            window.location.reload(true);
            
            // Méthode alternative si la première ne fonctionne pas sur certains navigateurs
            // Cette approche efface explicitement le cache avant de recharger
            fetch(window.location.href, {
                method: 'GET',
                cache: 'no-cache',
                headers: {
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0'
                }
            }).then(() => {
                window.location.reload(true);
            });
        });
    }
    
    // Ajouter au contexte global pour débogage
    window.dashboard = dashboard;
});

// Styles CSS pour les éléments du tableau de bord
document.addEventListener('DOMContentLoaded', function() {
    const style = document.createElement('style');
    style.textContent = `
        /* Styles pour le panneau des widgets masqués */
        .hidden-widgets-panel {
            position: fixed;
            bottom: 70px;
            right: 20px;
            width: 300px;
            background: white;
            border-radius: 5px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
            padding: 15px;
            z-index: 999;
            display: none;
            max-height: 300px;
            overflow-y: auto;
        }
        
        .hidden-widgets-panel.show {
            display: block;
        }
        
        /* Styles pour les icônes de widgets masqués */
        .widget-icon {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            width: 80px;
            height: 80px;
            margin: 8px;
            border-radius: 5px;
            border: 1px solid #e0e0e0;
            cursor: pointer;
            transition: all 0.2s;
            padding: 10px;
            text-align: center;
        }
        
        .widget-icon:hover {
            background-color: #f5f5f5;
            transform: translateY(-2px);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }
        
        .widget-icon i {
            font-size: 24px;
            margin-bottom: 5px;
            color: #0d6efd;
        }
        
        .widget-icon span {
            font-size: 11px;
            color: #555;
        }
        
        /* Styles pour les contrôles des widgets */
        .widget-controls {
            position: absolute;
            top: 5px;
            right: 5px;
            z-index: 10;
            display: none;
        }
        
        .grid-stack-item:hover .widget-controls {
            display: flex;
        }
        
        .widget-control-btn {
            background: none;
            border: none;
            color: rgba(0, 0, 0, 0.5);
            cursor: pointer;
            padding: 2px 6px;
            font-size: 14px;
            border-radius: 3px;
            transition: all 0.2s;
        }
        
        .widget-control-btn:hover {
            background-color: rgba(0, 0, 0, 0.1);
            color: rgba(0, 0, 0, 0.7);
        }
        
        /* Styles pour les cartes statistiques */
        .stats-card {
            overflow: hidden;
            position: relative;
        }
        
        .stats-card i {
            opacity: 0.2;
            position: absolute;
            right: -15px;
            bottom: -15px;
            font-size: 120px;
        }
        
        /* Styles pour les items d'alerte */
        .alert-item {
            padding: 12px;
            margin-bottom: 10px;
            border-radius: 5px;
            border-left: 4px solid #ccc;
            background-color: #f8f9fa;
        }
        
        .alert-item:last-child {
            margin-bottom: 0;
        }
        
        .alert-item.priority-high {
            border-left-color: #dc3545;
        }
        
        .alert-item.priority-medium {
            border-left-color: #ffc107;
        }
        
        .alert-item.priority-low {
            border-left-color: #198754;
        }
        
        /* Styles pour les conteneurs de graphiques */
        .chart-container {
            position: relative;
            height: 100%;
            width: 100%;
            min-height: 200px;
        }
        
        /* Styles pour le conteneur du tableau de bord */
        #dashboardContainer {
            padding-bottom: 50px;
        }
        
        /* Style pour l'indicateur de chargement */
        #loadingIndicator {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(255, 255, 255, 0.7);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 9999;
        }
        
        /* Style pour les tableaux dans les petits widgets */
        .small-widget-table {
            font-size: 0.8rem;
        }
        
        .small-widget-table th,
        .small-widget-table td {
            padding: 0.25rem 0.5rem;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 100px;
        }
        
        /* Optimiser l'affichage des graphiques dans de petits espaces */
        .chart-container canvas {
            max-height: 100%;
            max-width: 100%;
        }
        
        /* Améliorer la fluidité des widgets redimensionnables */
        .grid-stack-item {
            transition: all 0.3s ease;
        }
        
        .grid-stack-item.grid-stack-item-moving {
            transition: none;
        }
        
        .grid-stack-item.grid-stack-item-resizing {
            transition: none;
        }
        
        .grid-stack-item-content {
            transition: all 0.2s ease;
            overflow: hidden;
        }
        
        /* Améliorer les performances pendant le redimensionnement */
        .grid-stack-item-resizing .chart-container canvas {
            pointer-events: none;
        }
        
        .grid-stack-item-moving .chart-container canvas {
            pointer-events: none;
        }
        
        /* Styles responsive pour les graphiques */
        @media (max-width: 768px) {
            .chart-container {
                height: 200px !important;
            }
            
            .stats-card .display-2 {
                font-size: 2rem !important;
            }
            
            .stats-card h3 {
                font-size: 1rem !important;
            }
        }
        
        @media (max-width: 576px) {
            .chart-container {
                height: 150px !important;
            }
            
            .stats-card .display-2 {
                font-size: 1.5rem !important;
            }
            
            .stats-card h3 {
                font-size: 0.9rem !important;
            }
        }
        
        /* Animation fluide pour les graphiques */
        .chart-container {
            transform: translateZ(0);
            backface-visibility: hidden;
            perspective: 1000px;
        }
        
        /* Améliorer les indicateurs de redimensionnement */
        .ui-resizable-handle {
            background: rgba(13, 110, 253, 0.1);
            border: 1px solid rgba(13, 110, 253, 0.3);
        }
        
        .ui-resizable-handle:hover {
            background: rgba(13, 110, 253, 0.2);
            border-color: rgba(13, 110, 253, 0.5);
        }
        
        /* Styles pour les widgets en mode compact */
        .grid-stack-item[gs-w="1"] .card-body,
        .grid-stack-item[gs-w="2"] .card-body {
            padding: 0.5rem;
        }
        
        .grid-stack-item[gs-h="1"] .card-body,
        .grid-stack-item[gs-h="2"] .card-body {
            padding: 0.5rem;
        }
        
        .grid-stack-item[gs-w="1"] .card-header,
        .grid-stack-item[gs-w="2"] .card-header {
            padding: 0.25rem 0.5rem;
            font-size: 0.8rem;
        }
        
        .grid-stack-item[gs-h="1"] .card-header,
        .grid-stack-item[gs-h="2"] .card-header {
            padding: 0.25rem 0.5rem;
            font-size: 0.8rem;
        }
    `;
    document.head.appendChild(style);
});
