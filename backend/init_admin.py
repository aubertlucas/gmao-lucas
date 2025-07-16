import os
import sys
from sqlalchemy.orm import Session

# Ajouter le dossier parent au path pour pouvoir importer les modules locaux
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Définir le répertoire de base (comme dans database.py)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

from database import SessionLocal, engine
from models import User, Base
from utils.auth import get_password_hash

# Afficher le chemin de la base de données
print(f"Chemin de la base de données: {engine.url.database}")

# Créer les tables si elles n'existent pas
Base.metadata.create_all(bind=engine)

# Supprimer l'ancienne base de données à la racine du projet (si elle existe)
root_db_path = os.path.join(os.path.dirname(BASE_DIR), "gmao.db")
if os.path.exists(root_db_path):
    try:
        os.remove(root_db_path)
        print(f"Ancienne base de données supprimée: {root_db_path}")
    except Exception as e:
        print(f"Impossible de supprimer l'ancienne base de données: {e}")

def generate_secure_password(length=12):
    """Generate a secure random password"""
    import secrets
    import string
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    password = ''.join(secrets.choice(alphabet) for _ in range(length))
    return password

# Données de l'utilisateur admin - utiliser les variables d'environnement ou des valeurs par défaut sécurisées
admin_username = os.getenv("ADMIN_USERNAME", "admin")
admin_email = os.getenv("ADMIN_EMAIL", "admin@company.com")
admin_password = os.getenv("ADMIN_PASSWORD")  # Must be set in environment
admin_role = "admin"

# Si aucun mot de passe n'est fourni dans l'environnement, générer un mot de passe sécurisé
if not admin_password:
    admin_password = generate_secure_password(16)
    print(f"ATTENTION: Aucun mot de passe admin configuré dans l'environnement.")
    print(f"Un mot de passe sécurisé a été généré automatiquement.")
    print(f"VEUILLEZ NOTER CE MOT DE PASSE: {admin_password}")
    print(f"Configurez la variable d'environnement ADMIN_PASSWORD pour un usage en production.")

# Ouvrir une session
db = SessionLocal()

try:
    # Vérifier si l'utilisateur existe déjà
    existing_user = db.query(User).filter(User.username == admin_username).first()
    
    if existing_user:
        print(f"L'utilisateur {admin_username} existe déjà!")
    else:
        # Créer un utilisateur admin
        hashed_password = get_password_hash(admin_password)
        admin_user = User(
            username=admin_username,
            email=admin_email,
            password_hash=hashed_password,
            role=admin_role,
            is_active=True
        )
        
        # Ajouter à la base de données
        db.add(admin_user)
        db.commit()
        db.refresh(admin_user)
        
        # Vérifier que l'utilisateur a bien été créé
        verify_user = db.query(User).filter(User.username == admin_username).first()
        if verify_user:
            print(f"Vérification: L'utilisateur {admin_username} a bien été enregistré avec l'ID {verify_user.id}")
        else:
            print(f"ERREUR: L'utilisateur {admin_username} n'a PAS été enregistré malgré le commit!")
        
        print(f"Utilisateur administrateur créé avec succès!")
        print(f"Username: {admin_username}")
        print(f"Email: {admin_email}")
        print(f"Role: {admin_role}")
        if not os.getenv("ADMIN_PASSWORD"):
            print(f"Password: {admin_password} (À CHANGER IMMÉDIATEMENT)")
except Exception as e:
    print(f"Erreur lors de la création de l'administrateur: {e}")
finally:
    db.close()
