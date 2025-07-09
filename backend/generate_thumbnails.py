"""
Script pour générer automatiquement les miniatures pour toutes les photos existantes
qui n'en ont pas encore
"""
import os
import sys
import sqlite3
from PIL import Image
import shutil

# Ajouter le répertoire parent au path pour importer les modules du projet
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import engine, get_db
from models import ActionPhoto
from sqlalchemy.orm import Session

def generate_thumbnails():
    """
    Génère des miniatures pour toutes les photos qui n'en ont pas
    """
    print("Démarrage de la génération des miniatures...")
    
    # Obtenir une session de base de données
    db = Session(engine)
    
    try:
        # Récupérer toutes les photos
        photos = db.query(ActionPhoto).all()
        print(f"Trouvé {len(photos)} photos au total")
        
        # Compter les photos traitées et les erreurs
        processed_count = 0
        error_count = 0
        
        for photo in photos:
            try:
                # Force la régénération de toutes les miniatures même si le chemin existe dans la DB
                # Vérifier si le fichier de miniature existe physiquement
                if photo.thumbnail_path:
                    thumb_file_path = os.path.join(os.path.dirname(__file__), photo.thumbnail_path)
                    if os.path.exists(thumb_file_path):
                        print(f"La miniature existe physiquement pour {photo.filename}, mais sera recréée")
                    else:
                        print(f"Le chemin de miniature existe dans la DB mais le fichier n'existe pas pour {photo.filename}")
                else:
                    print(f"Pas de chemin de miniature pour {photo.filename}")
                
                # On va recréer la miniature dans tous les cas pour s'assurer qu'elle fonctionne
                
                # Chemin complet vers le fichier original
                original_path = os.path.join(os.path.dirname(__file__), photo.file_path)
                
                # Si le fichier original n'existe pas, passer à la suite
                if not os.path.exists(original_path):
                    print(f"ATTENTION: Le fichier original n'existe pas: {original_path}")
                    continue
                
                # Définir le chemin de la miniature
                action_id = photo.action_id
                filename = os.path.basename(photo.file_path)
                thumb_dir = os.path.join(os.path.dirname(__file__), "uploads", "thumbs", str(action_id))
                thumb_path = os.path.join(thumb_dir, filename)
                
                # Créer le répertoire de miniatures s'il n'existe pas
                os.makedirs(thumb_dir, exist_ok=True)
                
                # Générer la miniature
                try:
                    img = Image.open(original_path)
                    img.thumbnail((200, 200))
                    img.save(thumb_path)
                    
                    # Mettre à jour le chemin dans la base de données
                    thumb_url_path = f"uploads/thumbs/{action_id}/{filename}"
                    photo.thumbnail_path = thumb_url_path
                    db.commit()
                    
                    processed_count += 1
                    print(f"Miniature créée pour {photo.filename}")
                    
                except Exception as e:
                    # En cas d'erreur de traitement d'image, copier simplement le fichier original
                    print(f"Erreur lors de la génération de la miniature pour {photo.filename}: {e}")
                    shutil.copy2(original_path, thumb_path)
                    
                    # Mettre à jour le chemin dans la base de données malgré l'erreur
                    thumb_url_path = f"uploads/thumbs/{action_id}/{filename}"
                    photo.thumbnail_path = thumb_url_path
                    db.commit()
                    
                    error_count += 1
                
            except Exception as e:
                print(f"Erreur lors du traitement de la photo {photo.id} - {photo.filename}: {e}")
                error_count += 1
        
        print(f"\nTerminé! {processed_count} miniatures générées, {error_count} erreurs")
    
    except Exception as e:
        print(f"Erreur générale: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    generate_thumbnails()
