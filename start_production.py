"""
Script de démarrage pour la production GMAO
Lance le backend et le frontend de manière coordonnée
"""

import os
import sys
import subprocess
import threading
import time
import signal
from pathlib import Path
from dotenv import load_dotenv

# Charger les variables d'environnement
load_dotenv()

# Configuration
BACKEND_HOST = os.getenv('BACKEND_HOST', '0.0.0.0')
BACKEND_PORT = int(os.getenv('BACKEND_PORT', 8000))
FRONTEND_PORT = int(os.getenv('FRONTEND_PORT', 3000))

# Processus globaux
backend_process = None
frontend_process = None

def create_directories():
    """Créer les répertoires nécessaires"""
    directories = [
        'data',
        'data/uploads',
        'data/uploads/photos',
        'data/uploads/thumbs',
        'logs'
    ]
    
    for directory in directories:
        Path(directory).mkdir(parents=True, exist_ok=True)
    
    print("✅ Répertoires créés")

def check_dependencies():
    """Vérifier que toutes les dépendances sont installées"""
    try:
        import fastapi
        import uvicorn
        import sqlalchemy
        print("✅ Dépendances Python vérifiées")
    except ImportError as e:
        print(f"❌ Dépendance manquante: {e}")
        print("Veuillez exécuter: pip install -r requirements.txt")
        sys.exit(1)

def start_backend():
    """Démarrer le serveur backend FastAPI"""
    global backend_process
    print(f"\n🚀 Démarrage du backend sur {BACKEND_HOST}:{BACKEND_PORT}...")
    
    cmd = [
        sys.executable,
        "-m", "uvicorn",
        "main:app",
        "--host", BACKEND_HOST,
        "--port", str(BACKEND_PORT)
    ]
    
    backend_process = subprocess.Popen(cmd, cwd="backend")

def start_frontend():
    """Démarrer le serveur frontend"""
    global frontend_process
    print(f"\n🚀 Démarrage du frontend sur le port {FRONTEND_PORT}...")
    
    cmd = [sys.executable, "serve_frontend.py"]
    
    # Définir le port via variable d'environnement
    env = os.environ.copy()
    env['FRONTEND_PORT'] = str(FRONTEND_PORT)
    
    frontend_process = subprocess.Popen(cmd, env=env)

def signal_handler(signum, frame):
    """Gestionnaire pour arrêt propre"""
    print("\n\n⏹️ Arrêt de l'application...")
    
    if backend_process:
        backend_process.terminate()
        backend_process.wait()
    
    if frontend_process:
        frontend_process.terminate()
        frontend_process.wait()
    
    print("✅ Application arrêtée proprement")
    sys.exit(0)

def main():
    print("="*60)
    print("🏭 GMAO - Démarrage en mode PRODUCTION")
    print("="*60)
    
    # Enregistrer le gestionnaire de signal
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # Créer les répertoires nécessaires
    create_directories()
    
    # Définir le chemin absolu de la base de données et le passer à l'environnement.
    # C'est la solution la plus robuste pour que le backend trouve la DB.
    db_file_path = Path('data/gmao.db').resolve()
    print(f"🔧 Configuration de la base de données sur: {db_file_path}")
    os.environ['DATABASE_URL'] = f'sqlite:///{db_file_path}'
    
    # Vérifier les dépendances
    check_dependencies()
    
    # Démarrer les services
    backend_thread = threading.Thread(target=start_backend)
    backend_thread.start()
    
    # Attendre que le backend soit prêt
    time.sleep(3)
    
    frontend_thread = threading.Thread(target=start_frontend)
    frontend_thread.start()
    
    print("\n" + "="*60)
    print("✅ GMAO Application démarrée!")
    print(f"🌐 Backend API: http://localhost:{BACKEND_PORT}")
    print(f"🖥️ Frontend: http://localhost:{FRONTEND_PORT}")
    print(f"📚 Documentation API: http://localhost:{BACKEND_PORT}/docs")
    print("\nAppuyez sur Ctrl+C pour arrêter l'application")
    print("="*60 + "\n")
    
    # Attendre les processus
    try:
        if backend_process:
            backend_process.wait()
        if frontend_process:
            frontend_process.wait()
    except KeyboardInterrupt:
        signal_handler(None, None)

if __name__ == "__main__":
    main() 