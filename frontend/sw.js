// Service Worker pour la GMAO - Gestion anti-cache
const CACHE_VERSION = 'gmao-v2025-06-04-hotfix';
const CACHE_NAME = `gmao-cache-${CACHE_VERSION}`;

// Fichiers à ne JAMAIS mettre en cache (toujours récupérer du serveur)
const NO_CACHE_FILES = [
    '/css/main.css',
    '/js/dashboard.js',
    '/js/api.js',
    '/js/auth.js',
    '/dashboard.html',
    '/actions.html',
    '/admin.html',
    '/js/components/ActionsList.js',
    '/js/components/PhotoManager.js',
    '/js/components/ActionForm.js'
];

// Installation du service worker
self.addEventListener('install', event => {
    console.log('[SW] Installation du service worker version:', CACHE_VERSION);
    // Activer immédiatement le nouveau service worker
    self.skipWaiting();
});

// Activation du service worker
self.addEventListener('activate', event => {
    console.log('[SW] Activation du service worker');
    
    event.waitUntil(
        // Nettoyer les anciens caches
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[SW] Suppression de l\'ancien cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            // Prendre le contrôle de tous les clients immédiatement
            return self.clients.claim();
        })
    );
});

// Interception des requêtes
self.addEventListener('fetch', event => {
    const requestUrl = new URL(event.request.url);
    
    // Vérifier si le fichier ne doit jamais être mis en cache
    const shouldNotCache = NO_CACHE_FILES.some(file => 
        requestUrl.pathname.endsWith(file) || 
        requestUrl.pathname.includes(file)
    );
    
    if (shouldNotCache) {
        // Pour les fichiers qui ne doivent pas être mis en cache, 
        // toujours aller chercher la version la plus récente
        console.log('[SW] Récupération sans cache pour:', requestUrl.pathname);
        
        event.respondWith(
            fetch(event.request, {
                cache: 'no-cache',
                headers: {
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0'
                }
            }).catch(error => {
                console.error('[SW] Erreur de récupération:', error);
                // En cas d'erreur réseau, essayer de récupérer depuis le cache
                return caches.match(event.request);
            })
        );
        return;
    }
    
    // Pour les autres fichiers (CSS, images, etc.), utiliser la stratégie cache-first
    event.respondWith(
        caches.match(event.request).then(response => {
            if (response) {
                return response;
            }
            
            return fetch(event.request).then(response => {
                // Ne mettre en cache que les réponses valides
                if (!response || response.status !== 200 || response.type !== 'basic') {
                    return response;
                }
                
                // Cloner la réponse car elle ne peut être consommée qu'une fois
                const responseToCache = response.clone();
                
                caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, responseToCache);
                });
                
                return response;
            });
        })
    );
});

// Gérer les messages du client principal
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'CLEAR_CACHE') {
        console.log('[SW] Demande de nettoyage du cache reçue');
        
        // Nettoyer tous les caches
        event.waitUntil(
            caches.keys().then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => {
                        console.log('[SW] Suppression du cache:', cacheName);
                        return caches.delete(cacheName);
                    })
                );
            }).then(() => {
                // Informer le client que le nettoyage est terminé
                event.ports[0].postMessage({ success: true });
            }).catch(error => {
                console.error('[SW] Erreur lors du nettoyage:', error);
                event.ports[0].postMessage({ success: false, error: error.message });
            })
        );
    }
}); 
