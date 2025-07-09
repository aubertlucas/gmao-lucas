#!/usr/bin/env python
"""
Serveur proxy simple pour rediriger les requêtes d'images vers le backend
Exécutez ce script au lieu du serveur HTTP simple standard
"""

import http.server
import socketserver
import urllib.request
import urllib.error
import os
import sys

# Configuration
FRONTEND_PORT = 3000
BACKEND_URL = "http://localhost:8000"
STATIC_PATHS = ["/uploads/", "/static/"]  # Chemins à rediriger vers le backend

class ProxyHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        # Vérifier si le chemin demandé correspond à un chemin statique à rediriger
        if any(self.path.startswith(path) for path in STATIC_PATHS):
            print(f"[PROXY] Redirection de {self.path} vers le backend")
            try:
                # Construire l'URL complète vers le backend
                backend_url = f"{BACKEND_URL}{self.path}"
                print(f"[PROXY] URL backend: {backend_url}")
                
                # Effectuer la requête au backend
                with urllib.request.urlopen(backend_url) as response:
                    # Copier les en-têtes de réponse
                    self.send_response(response.status)
                    for header, value in response.getheaders():
                        if header.lower() != 'transfer-encoding':
                            self.send_header(header, value)
                    self.end_headers()
                    
                    # Copier le contenu de la réponse
                    self.wfile.write(response.read())
                    return
                    
            except urllib.error.URLError as e:
                print(f"[PROXY] Erreur lors de la redirection: {e}")
                self.send_error(500, f"Erreur proxy: {str(e)}")
                return
        
        # Pour tous les autres chemins, utiliser le comportement standard
        return super().do_GET()

def run_proxy_server(port=FRONTEND_PORT):
    handler = ProxyHandler
    
    # Déterminer le répertoire à servir (répertoire courant)
    directory = os.getcwd()
    handler.directory = directory
    
    # Démarrer le serveur
    with socketserver.TCPServer(("", port), handler) as httpd:
        print(f"Serveur proxy démarré sur le port {port}")
        print(f"Redirection des chemins {', '.join(STATIC_PATHS)} vers {BACKEND_URL}")
        print(f"Serveur de fichiers pour {directory}")
        print("Appuyez sur Ctrl+C pour arrêter")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServeur arrêté")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        run_proxy_server(int(sys.argv[1]))
    else:
        run_proxy_server()
