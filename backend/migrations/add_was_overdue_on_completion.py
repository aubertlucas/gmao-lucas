"""
Migration pour ajouter le champ was_overdue_on_completion à la table actions
"""

import sqlite3
import os
from datetime import datetime

def upgrade():
    """Ajouter la colonne was_overdue_on_completion"""
    db_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'gmao.db')
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Vérifier si la colonne existe déjà
        cursor.execute("PRAGMA table_info(actions)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if 'was_overdue_on_completion' not in columns:
            print("Ajout de la colonne was_overdue_on_completion...")
            cursor.execute("""
                ALTER TABLE actions 
                ADD COLUMN was_overdue_on_completion BOOLEAN DEFAULT 0
            """)
            
            # Mettre à jour les actions déjà terminées qui étaient en retard
            # Une action était en retard si completion_date > planned_date
            cursor.execute("""
                UPDATE actions 
                SET was_overdue_on_completion = 1
                WHERE final_status = 'OK' 
                AND completion_date IS NOT NULL 
                AND planned_date IS NOT NULL
                AND completion_date > planned_date
            """)
            
            affected_rows = cursor.rowcount
            print(f"Mise à jour de {affected_rows} actions qui étaient en retard lors de leur complétion")
            
            conn.commit()
            print("Migration réussie!")
        else:
            print("La colonne was_overdue_on_completion existe déjà")
            
    except Exception as e:
        print(f"Erreur lors de la migration: {e}")
        conn.rollback()
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    upgrade() 