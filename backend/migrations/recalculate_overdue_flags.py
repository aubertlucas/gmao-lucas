import os
import sys
import shutil
from datetime import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# --- Configuration ---
# Le script doit être exécuté depuis la racine du projet (GMAO_Lucas)
DB_FOLDER = "backend"
DB_FILENAME = "gmao.db"
DB_PATH = os.path.join(DB_FOLDER, DB_FILENAME)
BACKUP_DIR = os.path.join(DB_FOLDER, "db_backups")
DATABASE_URL = f"sqlite:///{DB_PATH}"

# Assurez-vous que le chemin du projet est correct pour importer les modèles
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))
from backend.models import Action

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def create_backup():
    """Crée une sauvegarde de la base de données avec un timestamp."""
    if not os.path.exists(DB_PATH):
        print(f"ERREUR: Fichier de base de données introuvable à '{DB_PATH}'.")
        return None
        
    os.makedirs(BACKUP_DIR, exist_ok=True)
    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    backup_filename = f"{DB_FILENAME}.{timestamp}.bak"
    backup_path = os.path.join(BACKUP_DIR, backup_filename)
    
    try:
        shutil.copy2(DB_PATH, backup_path)
        print(f"\nSauvegarde créée avec succès: '{backup_path}'")
        return backup_path
    except Exception as e:
        print(f"\nERREUR lors de la création de la sauvegarde: {e}")
        return None

def list_backups():
    """Liste les sauvegardes disponibles."""
    if not os.path.isdir(BACKUP_DIR):
        return []
    
    backups = sorted(
        [f for f in os.listdir(BACKUP_DIR) if f.endswith(".bak")],
        reverse=True
    )
    return [os.path.join(BACKUP_DIR, b) for b in backups]

def restore_backup(backup_path):
    """Restaure la base de données depuis une sauvegarde."""
    if not os.path.exists(backup_path):
        print(f"ERREUR: Fichier de sauvegarde introuvable: '{backup_path}'")
        return False
        
    try:
        print(f"Restauration depuis '{backup_path}'...")
        shutil.copy2(backup_path, DB_PATH)
        print("Restauration terminée avec succès.")
        return True
    except Exception as e:
        print(f"ERREUR lors de la restauration: {e}")
        return False

def recalculate_overdue_flags():
    """Recalcule le drapeau 'was_overdue_on_completion' pour toutes les actions terminées."""
    print("\n--- Lancement de la migration des données ---")
    db = SessionLocal()
    try:
        completed_actions = db.query(Action).filter(Action.final_status == "OK").all()
        updated_count = 0
        print(f"Vérification de {len(completed_actions)} actions terminées...")

        for action in completed_actions:
            if not action.completion_date:
                continue

            deadline = action.predicted_end_date if action.predicted_end_date else action.planned_date
            if not deadline:
                continue

            is_overdue_correct = action.completion_date > deadline
            
            if action.was_overdue_on_completion != is_overdue_correct:
                print(f"  Mise à jour Action ID {action.id}: '{action.title[:30]}...' -> en retard de '{action.was_overdue_on_completion}' à '{is_overdue_correct}'")
                action.was_overdue_on_completion = is_overdue_correct
                updated_count += 1
        
        if updated_count > 0:
            db.commit()
            print(f"\nCorrection terminée. {updated_count} action(s) ont été mise(s) à jour.")
        else:
            print("\nAucune mise à jour nécessaire. Tous les indicateurs sont déjà corrects.")
    
    except Exception as e:
        print(f"\nUne erreur est survenue pendant la migration: {e}")
        db.rollback()
    finally:
        db.close()

def main():
    """Fonction principale interactive."""
    print("="*50)
    print("  Script de Maintenance de la Base de Données")
    print("="*50)

    backups = list_backups()

    while True:
        print("\nQue souhaitez-vous faire ?")
        print("  1. Lancer la migration (recalculer les indicateurs de retard)")
        if backups:
            print("  2. Restaurer une sauvegarde")
        print("  Q. Quitter")

        choice = input("> ").strip().upper()

        if choice == '1':
            print("\nAVERTISSEMENT: Cette opération va modifier les données existantes.")
            if input("Une sauvegarde sera créée automatiquement. Continuer ? (y/n): ").strip().lower() == 'y':
                if create_backup():
                    recalculate_overdue_flags()
                else:
                    print("La migration a été annulée car la sauvegarde a échoué.")
            else:
                print("Migration annulée.")
            break

        elif choice == '2' and backups:
            print("\nSauvegardes disponibles:")
            for i, backup_path in enumerate(backups):
                print(f"  {i+1}. {os.path.basename(backup_path)}")
            
            try:
                restore_choice = int(input("Entrez le numéro de la sauvegarde à restaurer: ").strip())
                if 1 <= restore_choice <= len(backups):
                    selected_backup = backups[restore_choice-1]
                    if input(f"Êtes-vous sûr de vouloir écraser la base de données actuelle avec '{os.path.basename(selected_backup)}' ? (y/n): ").strip().lower() == 'y':
                        restore_backup(selected_backup)
                    else:
                        print("Restauration annulée.")
                else:
                    print("Choix invalide.")
            except ValueError:
                print("Veuillez entrer un numéro valide.")
            break

        elif choice == 'Q':
            print("Opération annulée.")
            break

        else:
            print("Choix invalide, veuillez réessayer.")


if __name__ == "__main__":
    main() 
