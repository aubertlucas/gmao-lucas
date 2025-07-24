from fastapi import FastAPI, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os
import json
from sqlalchemy.orm import Session
from fastapi.responses import JSONResponse
import shutil

from database import engine, Base, get_db
from models import User, Action, Location, ActionPhoto, WorkCalendar, WorkSchedule, CalendarException
from routes import auth, actions, photos, dashboard, config, calendar, users, db_viewer, admin, planning
from routes.auth import users_router as auth_users_router
from utils.auth import get_password_hash
from utils.image_utils import compress_image
from static_file_config import setup_static_files

# Initialize FastAPI app
app = FastAPI(
    title="GMBAO API",
    description="API for GMBAO (Gestion de Maintenance Batiment Assistée par Ordinateur)",
    version="1.0.0"
)

# Create the database tables
# We do this after app definition but before adding routes
Base.metadata.create_all(bind=engine)

# Setup CORS and static file serving
setup_static_files(app)

# Middleware de débogage pour les requêtes
@app.middleware("http")
async def debug_requests(request: Request, call_next):
    path = request.url.path
    print(f"\n[DEBUG REQUÊTE] {request.method} {path}")
    
    # Débogage spécifique pour les requêtes de fichiers statiques
    if path.startswith(("/uploads/", "/static/")):
        print(f"[DEBUG FICHIER STATIQUE] Demande de: {path}")
        print(f"[DEBUG FICHIER STATIQUE] URL complète: {request.url}")
        
        # Vérifier si le fichier existe physiquement
        physical_path = os.path.join(os.path.dirname(__file__), path.lstrip("/"))
        file_exists = os.path.exists(physical_path)
        print(f"[DEBUG FICHIER STATIQUE] Chemin physique: {physical_path}")
        print(f"[DEBUG FICHIER STATIQUE] Fichier existe: {file_exists}")
        
        if not file_exists:
            print(f"[DEBUG FICHIER STATIQUE] Fichier MANQUANT: {physical_path}")
            # Vérifier si le répertoire parent existe
            parent_dir = os.path.dirname(physical_path)
            parent_exists = os.path.exists(parent_dir)
            print(f"[DEBUG FICHIER STATIQUE] Répertoire parent existe: {parent_exists} ({parent_dir})")
            
            if parent_exists:
                # Lister les fichiers dans le répertoire parent
                files_in_dir = os.listdir(parent_dir)
                print(f"[DEBUG FICHIER STATIQUE] Fichiers dans le répertoire parent: {files_in_dir}")
    
    response = await call_next(request)
    print(f"[DEBUG RÉPONSE] {path} => {response.status_code}")
    return response

# Configuration simplifiée des dossiers pour les fichiers statiques
print("Configuration du serveur pour les fichiers statiques...")

# Chemin de base pour les uploads
base_dir = os.path.dirname(os.path.abspath(__file__))
uploads_dir = os.path.join(base_dir, "uploads")

# Chemins spécifiques pour les photos et miniatures
photos_dir = os.path.join(uploads_dir, "photos")
thumbs_dir = os.path.join(uploads_dir, "thumbs")

# Créer les répertoires nécessaires
os.makedirs(uploads_dir, exist_ok=True)
os.makedirs(photos_dir, exist_ok=True)
os.makedirs(thumbs_dir, exist_ok=True)

print(f"Dossiers créés: \n - Uploads: {uploads_dir} (existe: {os.path.exists(uploads_dir)})\n - Photos: {photos_dir} (existe: {os.path.exists(photos_dir)})\n - Miniatures: {thumbs_dir} (existe: {os.path.exists(thumbs_dir)})")

# CONFIGURATION DES FICHIERS STATIQUES - VERSION AMÉLIORÉE
# Utiliser une approche plus robuste pour servir les fichiers statiques
print(f"Configuration des fichiers statiques...")

# S'assurer que le contenu des dossiers est accessible
for root, dirs, files in os.walk(uploads_dir):
    for file in files:
        file_path = os.path.join(root, file)
        rel_path = os.path.relpath(file_path, uploads_dir)
        print(f"Fichier statique: {rel_path} (taille: {os.path.getsize(file_path)} octets)")

# Monter le répertoire des uploads avec plus de détails
print(f"\n[CONFIG] Montage du répertoire des uploads: {uploads_dir}")
print(f"[CONFIG] Uploads existe: {os.path.exists(uploads_dir)}")

# Vérifier la structure du répertoire des uploads
for root, dirs, files in os.walk(uploads_dir):
    level = root.replace(uploads_dir, '').count(os.sep)
    indent = ' ' * 4 * level
    subdir = os.path.basename(root)
    print(f"[CONFIG] {indent}{subdir}/")
    sub_indent = ' ' * 4 * (level + 1)
    for f in files:
        print(f"[CONFIG] {sub_indent}{f} ({os.path.getsize(os.path.join(root, f))} octets)")

app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")

# Include routers for API endpoints
app.include_router(auth.router)
app.include_router(actions.router)
app.include_router(photos.router)
app.include_router(dashboard.router)
app.include_router(config.router)
app.include_router(calendar.router)
app.include_router(planning.router)
# Inverser l'ordre pour que users.router ait la priorité sur auth_users_router
app.include_router(users.router, prefix="/users")
app.include_router(auth_users_router, prefix="/auth/users")  # Déplacer vers un autre préfixe pour éviter les conflits
app.include_router(db_viewer.router)
app.include_router(admin.router)

@app.get("/")
async def root():
    """
    Root endpoint for API health check
    """
    return {"status": "online", "message": "GMAO API is running"}

@app.on_event("startup")
async def startup_db_client():
    """
    Initialize database with default data on startup
    """
    db = next(get_db())
    
    # Check if we need to create default admin user
    admin_exists = db.query(User).filter(User.username == "admin").first()
    if not admin_exists:
        admin_user = User(
            username="admin",
            email="admin@example.com",
            password_hash=get_password_hash("admin"),
            role="admin"
        )
        db.add(admin_user)
    
    # Add default locations if none exist
    locations_exist = db.query(Location).first()
    if not locations_exist:
        default_locations = [
            Location(name="Luxe", is_active=True),
            Location(name="Forge", is_active=True),
            Location(name="Ancien Luxe", is_active=True),
            Location(name="Parking", is_active=True)
        ]
        db.add_all(default_locations)
    
    # Les utilisateurs doivent être créés manuellement via l'API
    # La génération automatique d'utilisateurs a été désactivée pour éviter les problèmes d'IDs
    
    db.commit()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
