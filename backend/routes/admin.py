from fastapi import APIRouter, Depends, HTTPException, status, Response, File, UploadFile, Form, Body
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel
import os
import shutil
from datetime import datetime
from PIL import Image
import io
import base64
import random
import json
from database import get_db
from models import User, Action
from schemas import StorageInfo, ImageCompressionPreview, ImageCompressionResult, ImageCompressionPreviewRequest
from utils.auth import get_current_user, get_password_hash
from utils.delay_tolerance import is_action_overdue_with_tolerance, load_delay_tolerance_config

router = APIRouter(prefix="/admin", tags=["admin"])

class DelayToleranceRequest(BaseModel):
    enabled: bool

# --- Configuration des chemins ---
# Utilisation de chemins absolus pour être indépendant du répertoire de lancement
# Le fichier admin.py est dans backend/routes/, on remonte de 3 niveaux pour la racine du projet
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB_PATH = os.path.join(PROJECT_ROOT, "backend", "gmao.db")
BACKUP_DIR = os.path.join(PROJECT_ROOT, "backend", "db_backups")
UPLOADS_DIR = os.path.join(PROJECT_ROOT, "backend", "uploads")

def create_backup():
    """Crée une sauvegarde de la base de données avec un timestamp."""
    if not os.path.exists(DB_PATH):
        raise HTTPException(status_code=500, detail=f"Fichier de base de données introuvable à '{DB_PATH}'.")
        
    os.makedirs(BACKUP_DIR, exist_ok=True)
    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    backup_filename = f"gmao.db.{timestamp}.bak"
    backup_path = os.path.join(BACKUP_DIR, backup_filename)
    
    try:
        shutil.copy2(DB_PATH, backup_path)
        return backup_path
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors de la création de la sauvegarde: {e}")

@router.post("/recalculate-overdue-flags", status_code=status.HTTP_200_OK)
async def recalculate_overdue_flags_endpoint(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Recalcule le drapeau 'was_overdue_on_completion' pour toutes les actions terminées.
    Crée une sauvegarde avant de commencer. Accessible uniquement aux administrateurs.
    """
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Accès non autorisé")

    # Étape 1: Créer une sauvegarde
    try:
        backup_path = create_backup()
    except Exception as e:
        # Si la sauvegarde échoue, ne pas continuer
        raise HTTPException(status_code=500, detail=f"La migration a été annulée car la sauvegarde a échoué: {e}")

    # Étape 2: Lancer la migration
    updated_count = 0
    log_messages = []
    try:
        completed_actions = db.query(Action).filter(Action.final_status == "OK").all()
        log_messages.append(f"Vérification de {len(completed_actions)} actions terminées...")

        for action in completed_actions:
            if not action.completion_date:
                continue

            deadline = action.predicted_end_date if action.predicted_end_date else action.planned_date
            if not deadline:
                continue

            # Utiliser la nouvelle logique avec tolérance
            is_overdue_correct = is_action_overdue_with_tolerance(
                action.completion_date, 
                deadline, 
                action.assigned_to, 
                db
            )
            
            if action.was_overdue_on_completion != is_overdue_correct:
                log_messages.append(f"  Mise à jour Action ID {action.id}: '{action.title[:30]}...' -> en retard de '{action.was_overdue_on_completion}' à '{is_overdue_correct}'")
                action.was_overdue_on_completion = is_overdue_correct
                updated_count += 1
        
        if updated_count > 0:
            db.commit()
            log_messages.append(f"\nCorrection terminée. {updated_count} action(s) ont été mise(s) à jour.")
        else:
            log_messages.append("\nAucune mise à jour nécessaire. Tous les indicateurs sont déjà corrects.")
        
        return {
            "status": "success",
            "message": "Migration terminée avec succès.",
            "backup_path": backup_path,
            "updated_count": updated_count,
            "logs": log_messages
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Une erreur est survenue pendant la migration: {e}")


def get_folder_size(path):
    """Helper function to recursively get folder size."""
    total = 0
    if os.path.exists(path):
        for entry in os.scandir(path):
            if entry.is_file():
                total += entry.stat().st_size
            elif entry.is_dir():
                total += get_folder_size(entry.path)
    return total

@router.get("/storage-info", response_model=StorageInfo)
async def get_storage_info_endpoint(
    current_user: User = Depends(get_current_user)
):
    """
    Gets disk and uploads folder storage information.
    Accessible only to administrators.
    """
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Accès non autorisé")

    try:
        # Get disk usage for the partition where the project is
        total, used, free = shutil.disk_usage(PROJECT_ROOT)

        # Calculate uploads folder size
        uploads_path = os.path.join(PROJECT_ROOT, "backend", "uploads")
        uploads_size = get_folder_size(uploads_path)
        
        # Calculate percentage
        uploads_percentage = (uploads_size / total * 100) if total > 0 else 0

        return {
            "total_disk_space": total,
            "used_disk_space": used,
            "free_disk_space": free,
            "uploads_folder_size": uploads_size,
            "uploads_percentage_of_disk": round(uploads_percentage, 2)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors de la récupération des informations de stockage: {e}")


@router.get("/sample-images", response_model=List[str])
async def get_sample_images(current_user: User = Depends(get_current_user)):
    """
    Returns a list of sample image paths from the uploads folder.
    """
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Accès non autorisé")
    
    image_paths = []
    if os.path.exists(UPLOADS_DIR):
        for subdir, _, files in os.walk(UPLOADS_DIR):
            for filename in files:
                if filename.lower().endswith(('.png', '.jpg', '.jpeg')):
                    full_path = os.path.join(subdir, filename)
                    # Return a path relative to the UPLOADS_DIR
                    relative_path = os.path.relpath(full_path, UPLOADS_DIR)
                    image_paths.append(relative_path.replace('\\', '/'))

    # Return a sample of up to 10 images to avoid overwhelming the frontend
    if len(image_paths) > 10:
        return random.sample(image_paths, 10)
    return image_paths


@router.post("/compress-preview", response_model=ImageCompressionPreview)
async def compress_image_preview(
    request_data: ImageCompressionPreviewRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Compresses a single image from the server for preview purposes.
    """
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Accès non autorisé")

    # Security check: ensure the file path is within the uploads directory
    full_path = os.path.join(UPLOADS_DIR, request_data.file_path)
    
    safe_uploads_dir = os.path.realpath(UPLOADS_DIR)
    safe_full_path = os.path.realpath(full_path)

    if not safe_full_path.startswith(safe_uploads_dir):
        raise HTTPException(status_code=400, detail="Chemin de fichier non autorisé.")

    if not os.path.exists(safe_full_path):
        raise HTTPException(status_code=404, detail=f"Fichier image non trouvé: {request_data.file_path}")

    try:
        with open(safe_full_path, "rb") as f:
            original_contents = f.read()
        
        original_size = len(original_contents)
        img = Image.open(io.BytesIO(original_contents))
        
        if img.format.upper() not in ["JPEG", "PNG"]:
            raise HTTPException(status_code=400, detail=f"Prévisualisation non supportée pour le format {img.format}.")

        buffer = io.BytesIO()
        img.save(buffer, format=img.format, quality=request_data.quality, optimize=True)
        compressed_contents = buffer.getvalue()
        compressed_size = len(compressed_contents)

        ext = os.path.splitext(safe_full_path)[1].lower()
        mime_type = "image/jpeg" if ext in ['.jpg', '.jpeg'] else "image/png"
        base64_encoded_img = base64.b64encode(compressed_contents).decode('utf-8')
        data_url = f"data:{mime_type};base64,{base64_encoded_img}"

        return {
            "original_size": original_size,
            "compressed_size": compressed_size,
            "compressed_image_data_url": data_url
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors de la prévisualisation de la compression: {e}")


@router.post("/compress-all-images", response_model=ImageCompressionResult)
async def compress_all_images(
    quality: int = Body(..., embed=True),
    current_user: User = Depends(get_current_user)
):
    """
    Compresses all images in the uploads folder.
    """
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Accès non autorisé")
    
    total_size_before = get_folder_size(UPLOADS_DIR)
    processed_files = 0
    errors = []

    for subdir, _, files in os.walk(UPLOADS_DIR):
        for filename in files:
            file_path = os.path.join(subdir, filename)
            try:
                img = Image.open(file_path)

                # Only process JPEG and PNG files, skip others
                if img.format.upper() in ["JPEG", "PNG"]:
                    # Overwrite the original file with the compressed version
                    img.save(file_path, format=img.format, quality=quality, optimize=True)
                    processed_files += 1
            except Exception as e:
                errors.append(f"Erreur sur {filename}: {str(e)}")
    
    total_size_after = get_folder_size(UPLOADS_DIR)
    space_saved = total_size_before - total_size_after

    return {
        "processed_files": processed_files,
        "total_size_before": total_size_before,
        "total_size_after": total_size_after,
        "space_saved": space_saved,
        "errors": errors
    }


class PasswordReset(BaseModel):
    user_id: int
    new_password: str

@router.post("/reset-password", status_code=status.HTTP_200_OK)
async def reset_password(
    data: PasswordReset,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Réinitialise le mot de passe d'un utilisateur.
    Accessible uniquement aux administrateurs.
    """
    # Vérifier que l'utilisateur courant est admin
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Seuls les administrateurs peuvent réinitialiser les mots de passe"
        )
    
    # Récupérer l'utilisateur à mettre à jour
    user = db.query(User).filter(User.id == data.user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Utilisateur avec l'ID {data.user_id} non trouvé"
        )
    
    # Mettre à jour le mot de passe
    hashed_password = get_password_hash(data.new_password)
    user.password_hash = hashed_password
    db.commit()
    
    print(f"[INFO] Mot de passe réinitialisé pour l'utilisateur {user.username} (ID: {user.id}) par l'admin {current_user.username}")
    
    return {"message": f"Mot de passe réinitialisé avec succès pour {user.username}"}

@router.get("/user-working-hours/{user_id}")
async def get_user_working_hours(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Récupère les heures de travail moyennes par jour pour un utilisateur.
    Utilisé pour le calcul de tolérance côté frontend.
    """
    try:
        from utils.delay_tolerance import get_user_working_hours_per_day
        working_hours = get_user_working_hours_per_day(user_id, db)
        
        return {
            "user_id": user_id,
            "working_hours_per_day": working_hours,
            "tolerance_hours": working_hours
        }
    except Exception as e:
        print(f"Erreur lors du calcul des heures de travail: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur: {e}")

@router.get("/all-users-working-hours")
async def get_all_users_working_hours(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Récupère les heures de travail pour tous les utilisateurs.
    Optimisé pour le calcul de tolérance côté frontend.
    """
    try:
        from utils.delay_tolerance import get_user_working_hours_per_day
        
        # Récupérer tous les utilisateurs actifs
        users = db.query(User).filter(User.is_active == True).all()
        
        working_hours_map = {}
        for user in users:
            working_hours = get_user_working_hours_per_day(user.id, db)
            working_hours_map[user.id] = {
                "user_id": user.id,
                "username": user.username,
                "working_hours_per_day": working_hours,
                "tolerance_hours": working_hours
            }
        
        return {"users_working_hours": working_hours_map}
        
    except Exception as e:
        print(f"Erreur lors du calcul des heures de travail: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur: {e}")

@router.post("/toggle-delay-tolerance", status_code=status.HTTP_200_OK)
async def toggle_delay_tolerance(
    request: DelayToleranceRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Active ou désactive la tolérance de retard et recalcule automatiquement les indicateurs.
    """
    if current_user.role != 'admin':
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs")
    
    try:
        # Charger la configuration actuelle
        config_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'config.json')
        with open(config_path, 'r', encoding='utf-8') as f:
            config = json.load(f)
        
        # Mettre à jour la configuration
        if 'delayToleranceSettings' not in config:
            config['delayToleranceSettings'] = {
                "description": "Lissage des retards à la journée de travail près",
                "enabled": False,
                "toleranceType": "working_day"
            }
        
        old_state = config['delayToleranceSettings'].get('enabled', False)
        config['delayToleranceSettings']['enabled'] = request.enabled
        config['delayToleranceEnabled'] = request.enabled  # Raccourci pour compatibilité
        
        # Sauvegarder la configuration
        with open(config_path, 'w', encoding='utf-8') as f:
            json.dump(config, f, indent=4, ensure_ascii=False)
        
        # Si l'état a changé, recalculer automatiquement les indicateurs de retard
        if old_state != request.enabled:
            print(f"[TOLERANCE] Tolérance {'activée' if request.enabled else 'désactivée'} par {current_user.username}, recalcul en cours...")
            
            # Récupérer toutes les actions terminées
            completed_actions = db.query(Action).filter(
                Action.final_status == "OK",
                Action.completion_date.isnot(None)
            ).all()
            
            updated_count = 0
            log_messages = []
            
            for action in completed_actions:
                if not action.completion_date:
                    continue

                deadline = action.predicted_end_date if action.predicted_end_date else action.planned_date
                if not deadline:
                    continue

                # Utiliser la nouvelle logique avec tolérance
                is_overdue_correct = is_action_overdue_with_tolerance(
                    action.completion_date, 
                    deadline, 
                    action.assigned_to, 
                    db
                )
                
                if action.was_overdue_on_completion != is_overdue_correct:
                    # Log pour l'interface utilisateur (sans détails sensibles)
                    log_messages.append(f"Action #{action.number}: {'EN RETARD' if is_overdue_correct else 'À TEMPS'}")
                    action.was_overdue_on_completion = is_overdue_correct
                    updated_count += 1
            
            if updated_count > 0:
                db.commit()
                print(f"[TOLERANCE] Recalcul terminé: {updated_count} actions mises à jour par {current_user.username}")
            else:
                print(f"[TOLERANCE] Aucune action à mettre à jour pour {current_user.username}")
            
            return {
                "message": f"Tolérance {'activée' if request.enabled else 'désactivée'} avec succès",
                "recalculated": True,
                "updated_actions": updated_count,
                "log": log_messages[:10],  # Limiter les logs affichés dans l'interface
                "admin_user": current_user.username  # Identifier qui a fait l'action
            }
        else:
            return {
                "message": f"Tolérance déjà {'activée' if request.enabled else 'désactivée'}",
                "recalculated": False
            }
            
    except Exception as e:
        print(f"Erreur lors du toggle de tolérance: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur: {e}")

@router.get("/delay-tolerance-status")
async def get_delay_tolerance_status(
    current_user: User = Depends(get_current_user)
):
    """
    Récupère le statut actuel de la tolérance de retard.
    """
    try:
        config = load_delay_tolerance_config()
        
        return {
            "enabled": config.get('enabled', False),
            "description": config.get('description', ''),
            "toleranceType": config.get('toleranceType', 'working_day')
        }
    except Exception as e:
        return {
            "enabled": False,
            "error": str(e)
        }

