"""
Configuration centralisée pour les fichiers statiques et les URLs.
Ce module permet de configurer de façon cohérente les chemins et URLs des ressources statiques.
"""

import os

# Configuration des chemins
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOADS_DIR = os.path.join(BASE_DIR, "uploads")
PHOTOS_DIR = os.path.join(UPLOADS_DIR, "photos")
THUMBS_DIR = os.path.join(UPLOADS_DIR, "thumbs")

# Configuration des URLs (peut être modifiée selon l'environnement)
API_BASE_URL = "http://frsasrvgmao:8000"  # URL du backend

# Fonction pour obtenir l'URL absolue d'une ressource
def get_absolute_url(relative_path):
    """Convertit un chemin relatif en URL absolue pour le client"""
    if not relative_path:
        return None
    
    # S'assurer que le chemin utilise des slashes avant (pas de backslashes)
    normalized_path = relative_path.replace("\\", "/")
    
    # Supprimer le slash initial s'il existe pour éviter les doubles slashes
    if normalized_path.startswith("/"):
        normalized_path = normalized_path[1:]
        
    return f"{API_BASE_URL}/{normalized_path}"

# Fonction de configuration pour FastAPI
def setup_static_files(app):
    """Monte les répertoires statiques et configure le CORS pour l'application FastAPI."""
    from fastapi.staticfiles import StaticFiles
    from fastapi.middleware.cors import CORSMiddleware

    # --- CORS Middleware ---
    origins = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://frsasrvgmao:3000",
    ]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        allow_headers=["*"],
        expose_headers=["*"],
    )

    print("CORS middleware configuré pour les origines:", origins)

# Fonction pour créer les répertoires nécessaires
def ensure_directories_exist():
    """Crée les répertoires nécessaires s'ils n'existent pas"""
    os.makedirs(UPLOADS_DIR, exist_ok=True)
    os.makedirs(PHOTOS_DIR, exist_ok=True)
    os.makedirs(THUMBS_DIR, exist_ok=True)
    
    print(f"Dossiers vérifiés et créés si nécessaire:")
    print(f" - Uploads: {UPLOADS_DIR} (existe: {os.path.exists(UPLOADS_DIR)})")
    print(f" - Photos: {PHOTOS_DIR} (existe: {os.path.exists(PHOTOS_DIR)})")
    print(f" - Miniatures: {THUMBS_DIR} (existe: {os.path.exists(THUMBS_DIR)})")
