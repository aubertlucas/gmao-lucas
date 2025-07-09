import os
import sys
import sqlite3

# Ajouter le répertoire parent au path pour importer les modules du projet
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import DATABASE_URL

def main():
    """
    Script de migration pour ajouter la colonne thumbnail_path à la table action_photos
    """
    # Extraire le chemin de la base de données depuis l'URL SQLAlchemy
    db_path = DATABASE_URL.replace('sqlite:///', '')
    
    print(f"Connexion à la base de données: {db_path}")
    
    # Se connecter à la base de données SQLite
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Vérifier si la colonne existe déjà
        cursor.execute("PRAGMA table_info(action_photos)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if 'thumbnail_path' not in columns:
            print("Ajout de la colonne thumbnail_path à la table action_photos...")
            cursor.execute("ALTER TABLE action_photos ADD COLUMN thumbnail_path TEXT")
            conn.commit()
            print("Migration réussie!")
        else:
            print("La colonne thumbnail_path existe déjà.")
            
    except Exception as e:
        print(f"Erreur lors de la migration: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    main()
