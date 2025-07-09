import http.server
import socketserver
import os
import threading
import mimetypes

# Configuration
PORT = int(os.getenv('FRONTEND_PORT', 3000))
DIRECTORY = os.path.join(os.path.dirname(os.path.abspath(__file__)), "frontend")

# Améliorer les types MIME pour une meilleure compatibilité
mimetypes.init()
mimetypes.add_type('application/javascript', '.js')
mimetypes.add_type('text/css', '.css')
mimetypes.add_type('application/font-woff', '.woff')
mimetypes.add_type('application/font-woff2', '.woff2')

class ProductionHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)
    
    def end_headers(self):
        # Headers de sécurité et cache pour production
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'SAMEORIGIN')
        self.send_header('X-XSS-Protection', '1; mode=block')
        
        # Cache pour les assets statiques
        if self.path.endswith(('.js', '.css', '.woff', '.woff2', '.jpg', '.png', '.gif')):
            self.send_header('Cache-Control', 'public, max-age=3600')
        else:
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        
        # CORS pour l'API
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Authorization')
        
        super().end_headers()
    
    def log_message(self, format, *args):
        """Log personnalisé pour la production"""
        # En production, on peut réduire les logs ou les rediriger
        if os.getenv('APP_MODE') != 'production' or 'error' in format.lower():
            super().log_message(format, *args)

if __name__ == "__main__":
    os.chdir(DIRECTORY)
    
    # Utiliser ThreadingHTTPServer pour gérer les connexions simultanées
    class ThreadingHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
        daemon_threads = True
        allow_reuse_address = True
    
    print(f"🌐 Démarrage du serveur frontend...")
    print(f"📁 Répertoire: {DIRECTORY}")
    print(f"🔌 Port: {PORT}")
    
    with ThreadingHTTPServer(("", PORT), ProductionHandler) as httpd:
        print(f"\n✅ Frontend accessible sur http://localhost:{PORT}")
        print(f"ℹ️ Le serveur supporte les connexions simultanées")
        
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n⏹️ Arrêt du serveur frontend...")
            httpd.server_close()
