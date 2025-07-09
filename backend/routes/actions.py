from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile, Form, Response, Request, Body
from typing import List, Optional
from sqlalchemy.orm import Session
from datetime import datetime, date, timedelta
import math
import uuid
import os
import sys
import shutil
import hashlib
from PIL import Image
import io

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Importer la configuration centralisée pour les fichiers statiques
from static_file_config import get_absolute_url

from database import get_db
from models import Action, User, Location, ActionPhoto, WorkSchedule, CalendarException
from schemas import Action as ActionSchema, ActionCreate, ActionUpdate, ActionPatch, Photo
from utils.auth import get_current_active_user
from utils.image_utils import compress_image

router = APIRouter(
    prefix="/actions",
    tags=["actions"],
    responses={404: {"description": "Not found"}},
)

@router.get("/", response_model=List[ActionSchema])
async def get_actions(
    skip: int = 0,
    limit: int = 100,
    location: Optional[str] = None,
    status: Optional[str] = None,
    priority: Optional[int] = None,
    assigned_to: Optional[int] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Get a list of maintenance actions with optional filtering
    """
    query = db.query(Action)
    
    # Apply filters
    if location:
        location_obj = db.query(Location).filter(Location.name == location).first()
        if location_obj:
            query = query.filter(Action.location_id == location_obj.id)
    
    if status:
        if status.upper() == "OK":
            query = query.filter(Action.final_status == "OK")
        elif status.upper() == "NON":
            query = query.filter(Action.final_status == "NON")
    
    if priority:
        query = query.filter(Action.priority == priority)
    
    if assigned_to:
        query = query.filter(Action.assigned_to == assigned_to)
    
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            (Action.title.ilike(search_term)) | 
            (Action.description.ilike(search_term)) |
            (Action.comments.ilike(search_term))
        )
    
    # Order by number for consistent results
    query = query.order_by(Action.number)
    
    actions = query.offset(skip).limit(limit).all()
    return actions

@router.get("/diagnostic", response_model=List[ActionSchema])
async def get_actions_diagnostic(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Get all actions ordered by creation ID for diagnostic and repair purposes.
    """
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Operation not authorized")
    
    actions = db.query(Action).order_by(Action.id).all()
    return actions

@router.post("/", response_model=ActionSchema, status_code=status.HTTP_201_CREATED)
async def create_action(
    action: ActionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Create a new maintenance action
    """
    # Generate action number if not provided
    if not action.number:
        # Get the highest action number currently in the database
        latest_action = db.query(Action).order_by(Action.number.desc()).first()
        next_number = 1  # Default starting number
        if latest_action and latest_action.number:
            next_number = latest_action.number + 1
        action.number = next_number
    # Check if action number already exists
    elif db.query(Action).filter(Action.number == action.number).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Action with number {action.number} already exists"
        )
    
    # Create new action
    action_data = action.dict(exclude_unset=False)  # Include default values
    db_action = Action(**action_data)
    
    # Always calculate predicted end date if we have the necessary data
    if db_action.planned_date and db_action.estimated_duration:
        db_action.predicted_end_date = calculate_end_date(
            db_action.planned_date,
            db_action.estimated_duration,
            db_action.assigned_to,
            db
        )
    
    db.add(db_action)
    db.commit()
    db.refresh(db_action)
    return db_action

@router.get("/{action_id}", response_model=ActionSchema)
async def get_action(
    action_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Get a specific maintenance action by ID
    """
    action = db.query(Action).filter(Action.id == action_id).first()
    if not action:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Action with ID {action_id} not found"
        )
    return action

@router.put("/{action_id}", response_model=ActionSchema)
async def update_action(
    action_id: int,
    action_update: ActionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Update a maintenance action
    """
    db_action = db.query(Action).filter(Action.id == action_id).first()
    if not db_action:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Action with ID {action_id} not found"
        )
    
    # Update action with provided fields
    update_data = action_update.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_action, key, value)
    
    # Always recalculate predicted end date if we have the necessary data
    if db_action.planned_date and db_action.estimated_duration:
        db_action.predicted_end_date = calculate_end_date(
            db_action.planned_date,
            db_action.estimated_duration,
            db_action.assigned_to,
            db
        )
    
    _recalculate_overdue_status(db_action)
    
    db.commit()
    db.refresh(db_action)
    return db_action

# Gérer les requêtes OPTIONS pour le preflight CORS
@router.options("/{action_id}/field")
async def options_action_field(
    action_id: int,
    request: Request,
    response: Response,
):
    # Récupérer l'origine de la requête
    origin = "http://frsasrvgmao:3000"  # Valeur par défaut
    if "origin" in request.headers:
        request_origin = request.headers["origin"]
        # Vérifier si l'origine est autorisée
        allowed_origins = [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:5000",
            "http://127.0.0.1:5000",
	    "http://frsasrvgmao:3000",
	    "http://frsasrvgmao:5000"
        ]
        if request_origin in allowed_origins:
            origin = request_origin
    
    # Définir les en-têtes CORS pour la réponse OPTIONS
    response.headers["Access-Control-Allow-Origin"] = origin
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Requested-With"
    response.headers["Access-Control-Max-Age"] = "600"  # Cache le preflight pour 10 minutes
    response.headers["Access-Control-Allow-Credentials"] = "true"
    
    # Pour les requêtes OPTIONS, on renvoie juste les en-têtes sans corps
    return {}

@router.patch("/{action_id}/field", response_model=ActionSchema)
async def update_action_field(
    action_id: int,
    update: ActionPatch,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Update a single field of a maintenance action (for Excel-like interface)
    """
    # Ajouter les en-têtes CORS nécessaires à la réponse
    origin = "http://frsasrvgmao:3000"  # Valeur par défaut
    if "origin" in request.headers:
        request_origin = request.headers["origin"]
        # Vérifier si l'origine est autorisée
        allowed_origins = [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:5000",
            "http://127.0.0.1:5000",
	    "http://frsasrvgmao:3000",
	    "http://frsasrvgmao:5000"
        ]
        if request_origin in allowed_origins:
            origin = request_origin
    
    # Définir les en-têtes CORS pour la réponse PATCH
    response.headers["Access-Control-Allow-Origin"] = origin
    response.headers["Access-Control-Allow-Methods"] = "PATCH, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    response.headers["Access-Control-Allow-Credentials"] = "true"
    db_action = db.query(Action).filter(Action.id == action_id).first()
    if not db_action:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Action with ID {action_id} not found"
        )
    
    # Update the specific field
    field = update.field
    value = update.value
    
    # Handle special data types
    if field in ["planned_date", "predicted_end_date", "completion_date"]:
        # Convert string date to date object
        try:
            if value:
                value = date.fromisoformat(value)
            else:
                value = None
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid date format for {field}"
            )
    elif field in ["priority", "assigned_to"]:
        # Convert string to integer
        try:
            if value:
                value = int(value)
            else:
                value = None
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid integer format for {field}"
            )
    elif field in ["budget_initial", "actual_cost", "estimated_duration"]:
        # Convert string to float
        try:
            if value:
                value = float(value)
            else:
                value = None
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid float format for {field}"
            )
    elif field == "location_id" and value:
        # Convert location name to location_id
        location = db.query(Location).filter(Location.name == value).first()
        if location:
            value = location.id
        else:
            # Create new location if it doesn't exist
            new_location = Location(name=value)
            db.add(new_location)
            db.commit()
            db.refresh(new_location)
            value = new_location.id
    
    # Set the attribute
    setattr(db_action, field, value)
    
    # Si on met à jour le final_status à "OK", vérifier si l'action est en retard
    if field == "final_status" and value == "OK":
        # Mettre à jour la date de complétion si elle n'est pas déjà définie
        if not db_action.completion_date:
            db_action.completion_date = date.today()
        
    # Always recalculate predicted end date if we have the necessary data
    if db_action.planned_date and db_action.estimated_duration:
        db_action.predicted_end_date = calculate_end_date(
            db_action.planned_date,
            db_action.estimated_duration,
            db_action.assigned_to,
            db
        )
    
    _recalculate_overdue_status(db_action)
    
    db.commit()
    db.refresh(db_action)
    return db_action

@router.delete("/{action_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_action(
    action_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Delete a maintenance action
    """
    db_action = db.query(Action).filter(Action.id == action_id).first()
    if not db_action:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Action with ID {action_id} not found"
        )
    
    db.delete(db_action)
    db.commit()
    return {"ok": True}

def _recalculate_overdue_status(action: Action):
    """
    Vérifie et met à jour le statut de retard si l'action est terminée.
    Si l'action n'est pas terminée, le flag de retard est remis à False.
    """
    if action.final_status != "OK":
        action.was_overdue_on_completion = False
        return

    # Si l'action est terminée, on calcule le statut.
    # S'assurer qu'une date de complétion existe, sinon on ne peut rien faire.
    if not action.completion_date:
        action.was_overdue_on_completion = False
        return

    # Déterminer la date limite. La priorité est la date de fin prévue.
    deadline = action.predicted_end_date if action.predicted_end_date else action.planned_date
    
    # S'il n'y a pas de deadline, l'action ne peut pas être en retard.
    if not deadline:
        action.was_overdue_on_completion = False
        return

    # La condition est stricte : la date de complétion doit être > à la deadline.
    is_overdue = action.completion_date > deadline
    
    action.was_overdue_on_completion = is_overdue

@router.post("/reorder", response_model=List[ActionSchema])
async def reorder_actions(
    ordered_ids: List[int] = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Reorders actions and returns the updated list. This handles filtered lists
    by reordering all actions to maintain integrity.
    """
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Operation not authorized")

    try:
        # Get all current actions, ordered by their number
        all_actions = db.query(Action).order_by(Action.number).all()
        all_action_ids = [action.id for action in all_actions]

        # Find the index of the first item from the user's ordered list
        # This will be our anchor point for insertion
        anchor_id = ordered_ids[0]
        try:
            insert_index = all_action_ids.index(anchor_id)
        except ValueError:
            # If the anchor is not in the list (e.g., new item), append at the end
            insert_index = len(all_action_ids)

        # Create a new list of IDs, removing the ones that are being reordered
        remaining_ids = [id for id in all_action_ids if id not in ordered_ids]

        # Insert the user-ordered list at the anchor point
        # This creates the final, complete, and correctly ordered list of all action IDs
        final_ordered_ids = remaining_ids[:insert_index] + ordered_ids + remaining_ids[insert_index:]
        
        # Now, re-index all actions based on the final complete order
        # Using a two-phase update to avoid UNIQUE constraint violations.
        
        # Phase 1: Assign temporary negative numbers
        for index, action_id in enumerate(final_ordered_ids):
            db.query(Action).filter(Action.id == action_id).update(
                {"number": -(index + 1000)}, synchronize_session=False
            )
        db.flush()

        # Phase 2: Assign final correct numbers
        for index, action_id in enumerate(final_ordered_ids):
            db.query(Action).filter(Action.id == action_id).update(
                {"number": index + 1}, synchronize_session=False
            )
        
        db.commit()

        # Return the newly ordered list of all actions
        updated_actions = db.query(Action).order_by(Action.number).all()
        return updated_actions
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

@router.post("/{action_id}/calculate-end-date", response_model=dict)
async def predict_end_date(
    action_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Calculate the predicted end date for an action based on planned date, duration, and pilot's schedule
    """
    db_action = db.query(Action).filter(Action.id == action_id).first()
    if not db_action:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Action with ID {action_id} not found"
        )
    
    if not db_action.planned_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Planned date is required to calculate end date"
        )
    
    if not db_action.estimated_duration:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Estimated duration is required to calculate end date"
        )
    
    end_date = calculate_end_date(
        db_action.planned_date,
        db_action.estimated_duration,
        db_action.assigned_to,
        db
    )
    
    # Update the action with the calculated end date
    db_action.predicted_end_date = end_date
    db.commit()
    
    return {"predicted_end_date": end_date}

def calculate_end_date(planned_date, duration, assigned_to, db):
    """
    Helper function to calculate end date based on pilot's work calendar
    Cette version utilise à la fois les horaires hebdomadaires et les exceptions de calendrier
    """
    print(f"\n[DEBUG CALCUL DATE] Début du calcul de date de fin : date prévue = {planned_date}, durée = {duration} heures, assigné à = {assigned_to}")
    
    if not planned_date or not duration:
        print(f"[DEBUG CALCUL DATE] Données manquantes : date prévue = {planned_date}, durée = {duration}")
        return None
    
    if not assigned_to:
        # Si pas de pilote assigné, utiliser un calcul simple (1 jour = 8h de travail)
        end_date = planned_date + timedelta(days=math.ceil(duration / 8))
        print(f"[DEBUG CALCUL DATE] Pas de pilote assigné, calcul simple : {planned_date} + {math.ceil(duration / 8)} jours = {end_date}")
        return end_date
    
    # Vérifier d'abord s'il existe des horaires dans WorkSchedule
    work_schedules = db.query(WorkSchedule).filter(WorkSchedule.user_id == assigned_to).all()
    print(f"[DEBUG CALCUL DATE] Horaires trouvés pour l'utilisateur {assigned_to}: {len(work_schedules)} enregistrements")
    
    # Utiliser les horaires trouvés dans la base de données
    
    # Si aucun horaire n'est trouvé, créer un planning standard basé sur le rôle de l'utilisateur
    if not work_schedules:
        # Récupérer l'utilisateur pour connaître son rôle
        user = db.query(User).filter(User.id == assigned_to).first()
        print(f"[DEBUG CALCUL DATE] Aucun horaire trouvé dans WorkSchedule pour l'utilisateur {assigned_to}, création d'un planning standard")
        
        work_schedules = []
        
        # Utiliser un planning standard pour tous les utilisateurs: 8h par jour, 5 jours par semaine
        for day in range(7):  # 0=Lundi, 6=Dimanche
            # Par défaut, on travaille du lundi au vendredi (0-4)
            is_working = day < 5
            hours = 8.0 if is_working else 0.0
            
            work_schedules.append(WorkSchedule(
                user_id=assigned_to,
                day_of_week=day,
                is_working_day=is_working,
                working_hours=hours
            ))
            
        print(f"[DEBUG CALCUL DATE] Planning standard créé: {len(work_schedules)} jours configurés")
        print(f"[DEBUG CALCUL DATE] Planning standard: 8h/jour du lundi au vendredi, 0h weekend")
    
    # Créer un dictionnaire des heures travaillées par jour de la semaine
    weekly_hours = {}
    
    # Si aucun horaire n'est défini, utiliser une semaine de travail standard
    if not work_schedules:
        print(f"[DEBUG CALCUL DATE] Aucun horaire défini, utilisation des valeurs par défaut")
        # Par défaut : 8 heures par jour du lundi au vendredi, 0 le weekend
        for day in range(7):
            weekly_hours[day] = 8.0 if day < 5 else 0.0
    else:
        print(f"[DEBUG CALCUL DATE] Utilisation des horaires personnalisés")
        # Utiliser les horaires définis
        for schedule in work_schedules:
            # Appliquer règle stricte: si ce n'est pas un jour travaillé, c'est 0 heures
            hours = schedule.working_hours if schedule.is_working_day else 0.0
            weekly_hours[schedule.day_of_week] = hours
            print(f"[DEBUG CALCUL DATE] Jour {schedule.day_of_week}: {weekly_hours[schedule.day_of_week]} heures, jour travaillé: {schedule.is_working_day}")
    
    # Récupérer les exceptions de calendrier (jours fériés, congés, etc.)
    # Chercher dans un intervalle raisonnable (100 jours à partir de la date planifiée)
    end_search_date = planned_date + timedelta(days=100)
    print(f"[DEBUG CALCUL DATE] Recherche d'exceptions entre {planned_date} et {end_search_date}")
    
    # Récupérer les exceptions pour l'utilisateur assigné
    exceptions = db.query(CalendarException).filter(
        CalendarException.user_id == assigned_to,
        CalendarException.exception_date >= planned_date,
        CalendarException.exception_date <= end_search_date
    ).all()
    print(f"[DEBUG CALCUL DATE] {len(exceptions)} exceptions trouvées pour l'utilisateur {assigned_to}")
    
    # Créer un dictionnaire des exceptions par date (format string pour les clés)
    exception_hours = {}
    for ex in exceptions:
        exception_date_str = ex.exception_date.isoformat()
        exception_hours[exception_date_str] = ex.working_hours
        print(f"[DEBUG CALCUL DATE] Exception le {ex.exception_date} ({exception_date_str}): {ex.working_hours} heures, type: {ex.exception_type}")
    
    # Calculer la date de fin
    remaining_hours = duration
    current_date = planned_date
    print(f"[DEBUG CALCUL DATE] Début du calcul itératif: {remaining_hours} heures restantes")
    
    # Pour débogage, limiter le nombre d'itérations à 100 jours max pour éviter une boucle infinie
    max_iterations = 100
    iteration_count = 0
    
    # Boucler jusqu'à ce que toutes les heures soient allouées
    while remaining_hours > 0 and iteration_count < max_iterations:
        iteration_count += 1
        
        # Vérifier si la date actuelle est une exception (comparer les formats de date en string)
        current_date_str = current_date.isoformat()
        if current_date_str in exception_hours:
            # Utiliser les heures définies dans l'exception
            hours_today = exception_hours[current_date_str]
            print(f"[DEBUG CALCUL DATE] {current_date} est une exception, heures = {hours_today}")
        else:
            # Vérifier si nous avons manqué une exception à cause d'un problème de format
            print(f"[DEBUG CALCUL DATE] Vérification de la date {current_date} ({current_date_str})")
            print(f"[DEBUG CALCUL DATE] Exceptions disponibles: {list(exception_hours.keys())}")
            # Sinon, utiliser l'horaire hebdomadaire standard
            weekday = current_date.weekday()  # 0=Lundi, 6=Dimanche
            hours_today = weekly_hours.get(weekday, 0.0)
            print(f"[DEBUG CALCUL DATE] {current_date} est un jour normal (jour {weekday}), heures = {hours_today}")
        
        # Si des heures sont travaillées ce jour, déduire du temps restant
        if hours_today > 0:
            # Calculer combien d'heures peuvent être travaillées aujourd'hui
            hours_worked = min(hours_today, remaining_hours)
            remaining_hours -= hours_worked
            print(f"[DEBUG CALCUL DATE] Jour {current_date}: {hours_worked} heures allouées, {remaining_hours} heures restantes")
            
            # Si toutes les heures sont épuisées, c'est la date de fin
            if remaining_hours <= 0:
                print(f"[DEBUG CALCUL DATE] Toutes les heures sont allouées, date de fin = {current_date}")
                break
        else:
            print(f"[DEBUG CALCUL DATE] Jour {current_date}: jour non travaillé, aucune heure allouée")
        
        # Passer au jour suivant
        current_date += timedelta(days=1)
    
    if iteration_count >= max_iterations:
        print(f"[DEBUG CALCUL DATE] ATTENTION: Limite d'itérations atteinte. Calcul arrêté après {max_iterations} jours.")
    
    print(f"[DEBUG CALCUL DATE] Fin du calcul: date de début = {planned_date}, date de fin = {current_date}")
    return current_date


@router.get("/{action_id}/photos", response_model=List[Photo])
async def get_action_photos(
    action_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Get all photos for a specific action
    """
    try:
        # Vérifier que l'action existe
        action = db.query(Action).filter(Action.id == action_id).first()
        if not action:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Action not found")
        
        # Récupérer toutes les photos pour cette action
        photos = db.query(ActionPhoto).filter(ActionPhoto.action_id == action_id).all()
        
        # Solution professionnelle : utiliser notre configuration centralisée pour les URLs
        # Cela garantit que les URLs seront cohérentes dans toute l'application
        
        for photo in photos:
            # Utiliser la fonction get_absolute_url pour générer des URLs absolues correctes
            photo.url = get_absolute_url(photo.file_path)
            photo.thumbnail_url = get_absolute_url(photo.thumbnail_path)
            
            # Extraire le nom de fichier original pour le frontend
            if '/' in photo.filename:
                photo.original_filename = photo.filename.split('/')[-1]
            elif '\\' in photo.filename:
                photo.original_filename = photo.filename.split('\\')[-1]
            else:
                photo.original_filename = photo.filename
        
        return photos
    except Exception as e:
        print(f"Error retrieving photos: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Une erreur est survenue lors de la récupération des photos: {str(e)}"
        )


@router.post("/{action_id}/photos", response_model=List[Photo], status_code=status.HTTP_201_CREATED)
async def upload_action_photos(
    action_id: int,
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Upload one or more photos for a specific action
    """
    print("\n" + "="*80)
    print(f"[UPLOAD PHOTOS] Début de l'upload de photos pour l'action {action_id}")
    print(f"[UPLOAD PHOTOS] Nombre de fichiers reçus: {len(files)}")
    print(f"[UPLOAD PHOTOS] Utilisateur: {current_user.username} (ID: {current_user.id})")
    
    # Vérifier que l'action existe
    action = db.query(Action).filter(Action.id == action_id).first()
    if not action:
        print(f"[UPLOAD PHOTOS] ERREUR: Action {action_id} introuvable")
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Action not found")
    
    print(f"[UPLOAD PHOTOS] Action trouvée: {action.id} - {action.title}")
    
    # Définir les chemins de base (simplifiés au maximum)
    uploads_dir = "uploads"  # Chemin relatif de base
    photos_dir = os.path.join(uploads_dir, "photos", str(action_id))  # Chemin relatif pour les photos
    thumbs_dir = os.path.join(uploads_dir, "thumbs", str(action_id))  # Chemin relatif pour les miniatures
    
    # Chemins absolus pour le système de fichiers
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    abs_photos_dir = os.path.join(base_dir, photos_dir)
    abs_thumbs_dir = os.path.join(base_dir, thumbs_dir)
    
    print(f"[UPLOAD PHOTOS] Structure des chemins:")
    print(f"  - Base dir: {base_dir}")
    print(f"  - Chemin relatif photos: {photos_dir}")
    print(f"  - Chemin relatif miniatures: {thumbs_dir}")
    print(f"  - Chemin absolu photos: {abs_photos_dir}")
    print(f"  - Chemin absolu miniatures: {abs_thumbs_dir}")
    
    # Créer les répertoires s'ils n'existent pas
    try:
        os.makedirs(abs_photos_dir, exist_ok=True)
        os.makedirs(abs_thumbs_dir, exist_ok=True)
        print(f"[UPLOAD PHOTOS] Répertoires créés avec succès:")
        print(f"  - Photos: {abs_photos_dir} (existe: {os.path.exists(abs_photos_dir)})")
        print(f"  - Miniatures: {abs_thumbs_dir} (existe: {os.path.exists(abs_thumbs_dir)})")
    except Exception as e:
        print(f"[UPLOAD PHOTOS] ERREUR lors de la création des répertoires: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur lors de la création des répertoires: {str(e)}"
        )
    
    # Obtenir les photos existantes pour cette action
    existing_photos = db.query(ActionPhoto).filter(ActionPhoto.action_id == action_id).all()
    print(f"[UPLOAD PHOTOS] Nombre de photos existantes pour cette action: {len(existing_photos)}")
    
    uploaded_photos = []
    
    # Traiter chaque fichier
    for file_index, file in enumerate(files, 1):
        try:
            print(f"\n[UPLOAD PHOTOS] [{file_index}/{len(files)}] Traitement du fichier: {file.filename}")
            print(f"[UPLOAD PHOTOS] Type MIME: {file.content_type}, Taille: {file.size if hasattr(file, 'size') else 'inconnue'} octets")
            
            # Vérifier que le fichier est une image
            content_type = file.content_type
            if not content_type.startswith('image/'):
                print(f"[UPLOAD PHOTOS] IGNORÉ: Type de fichier non supporté: {content_type}")
                continue
            
            print(f"[UPLOAD PHOTOS] Type de fichier valide: {content_type}")
            
            # Lire le contenu du fichier
            print(f"[UPLOAD PHOTOS] Lecture du contenu du fichier...")
            file_content = await file.read()
            print(f"[UPLOAD PHOTOS] Contenu lu: {len(file_content)} octets")
            
            # Générer un hash du contenu du fichier pour détecter les doublons
            print(f"[UPLOAD PHOTOS] Génération du hash SHA-256...")
            file_hash = hashlib.sha256(file_content).hexdigest()
            print(f"[UPLOAD PHOTOS] Hash généré: {file_hash[:10]}...{file_hash[-10:]}")
                
            # Générer un nom de fichier unique basé sur un UUID
            print(f"[UPLOAD PHOTOS] Génération d'un nom de fichier unique...")
            original_filename = file.filename
            file_extension = os.path.splitext(original_filename)[1].lower()
            if not file_extension:
                # Déterminer l'extension en fonction du type MIME
                if file.content_type == 'image/jpeg':
                    file_extension = '.jpg'
                elif file.content_type == 'image/png':
                    file_extension = '.png'
                elif file.content_type == 'image/gif':
                    file_extension = '.gif'
                else:
                    file_extension = '.bin'  # Binaire générique
                        
            unique_filename = str(uuid.uuid5(uuid.NAMESPACE_OID, file_hash)) + file_extension
            print(f"[UPLOAD PHOTOS] Nom de fichier généré: {unique_filename}")
            print(f"[UPLOAD PHOTOS] Extension détectée: {file_extension}")
                
            # Vérifier si la photo existe déjà (par son hash)
            print(f"[UPLOAD PHOTOS] Vérification des doublons par hash...")
            existing_photo = None
            for photo in existing_photos:
                if photo.file_hash == file_hash:
                    existing_photo = photo
                    break
                
            if existing_photo:
                print(f"[UPLOAD PHOTOS] DOUBLON DETECTÉ: Photo déjà existante avec le même hash")
                print(f"[UPLOAD PHOTOS] Détails du doublon: ID={existing_photo.id}, chemin={existing_photo.file_path}")
                uploaded_photos.append(existing_photo)
                continue
                
            print(f"[UPLOAD PHOTOS] Nouvelle photo (non présente dans la base de données)")
                    
            # Chemin pour enregistrer le fichier original
            photo_path = os.path.join(abs_photos_dir, unique_filename)
            print(f"[UPLOAD PHOTOS] Chemin de stockage de l'image originale: {photo_path}")
                    
            # Enregistrer le fichier original
            try:
                print(f"[UPLOAD PHOTOS] Enregistrement du fichier original...")
                with open(photo_path, "wb") as buffer:
                    buffer.write(file_content)
                
                # Vérifier que le fichier a bien été créé
                if os.path.exists(photo_path):
                    file_size = os.path.getsize(photo_path)
                    print(f"[UPLOAD PHOTOS] Fichier original enregistré avec succès: {file_size} octets")

                    # --- AJOUT: Compression de l'image après sauvegarde ---
                    compress_image(photo_path)
                    # ----------------------------------------------------
                    
                else:
                    print(f"[UPLOAD PHOTOS] ERREUR: Le fichier n'a pas été créé!")
                    raise Exception("Le fichier n'a pas été créé après écriture")
                    
            except Exception as write_err:
                print(f"[UPLOAD PHOTOS] ERREUR lors de l'écriture du fichier original: {str(write_err)}")
                print(f"[UPLOAD PHOTOS] Détails: {type(write_err).__name__}")
                print(f"[UPLOAD PHOTOS] Passage au fichier suivant...")
                continue
                
            # Chemin pour enregistrer la miniature
            thumb_path = os.path.join(abs_thumbs_dir, unique_filename)
            print(f"[UPLOAD PHOTOS] Chemin de stockage de la miniature: {thumb_path}")
            
            # Générer une miniature
            try:
                print(f"[UPLOAD PHOTOS] Génération de la miniature...")
                # Utiliser Pillow pour créer une miniature
                from PIL import Image
                from io import BytesIO
                
                # Ouvrir l'image et créer une miniature
                print(f"[UPLOAD PHOTOS] Ouverture de l'image avec PIL...")
                img = Image.open(BytesIO(file_content))
                print(f"[UPLOAD PHOTOS] Image ouverte: {img.format}, {img.size[0]}x{img.size[1]}, mode {img.mode}")
                
                print(f"[UPLOAD PHOTOS] Redimensionnement à 200x200 pixels maximum...")
                img.thumbnail((200, 200))
                print(f"[UPLOAD PHOTOS] Miniature générée: {img.size[0]}x{img.size[1]}")
                
                print(f"[UPLOAD PHOTOS] Enregistrement de la miniature...")
                img.save(thumb_path)
                
                # Vérifier que la miniature a bien été créée
                if os.path.exists(thumb_path):
                    thumb_size = os.path.getsize(thumb_path)
                    print(f"[UPLOAD PHOTOS] Miniature enregistrée avec succès: {thumb_size} octets")
                else:
                    print(f"[UPLOAD PHOTOS] AVERTISSEMENT: La miniature n'a pas été créée!")
            except Exception as e:
                print(f"[UPLOAD PHOTOS] ERREUR lors de la génération de la miniature: {str(e)}")
                print(f"[UPLOAD PHOTOS] FALLBACK: Utilisation de l'image originale comme miniature")
                # En cas d'erreur, copier simplement le fichier original
                shutil.copy2(photo_path, thumb_path)
                print(f"[UPLOAD PHOTOS] Fichier original copié comme miniature")
            
            # Normaliser les chemins pour utiliser uniquement des séparateurs '/' (compatible web)
            photos_dir_norm = photos_dir.replace('\\', '/').replace('\\', '/')
            thumbs_dir_norm = thumbs_dir.replace('\\', '/').replace('\\', '/')
            
            # Chemins relatifs pour le stockage en BDD (toujours avec / même sous Windows)
            photo_url_path = f"{photos_dir_norm}/{unique_filename}"  # ex: uploads/photos/1/abc123.jpg
            thumb_url_path = f"{thumbs_dir_norm}/{unique_filename}"  # ex: uploads/thumbs/1/abc123.jpg
            
            print(f"[UPLOAD PHOTOS] Chemins relatifs pour la BDD:")
            print(f"  - Image originale: {photo_url_path}")
            print(f"  - Miniature: {thumb_url_path}")
            
            # URLs complètes
            file_url = f"http://localhost:8000/{photo_url_path}"
            thumb_url = f"http://localhost:8000/{thumb_url_path}"
            print(f"[UPLOAD PHOTOS] URLs complètes:")
            print(f"  - Image originale: {file_url}")
            print(f"  - Miniature: {thumb_url}")
            
            # SOLUTION TEMPORAIRE POUR LE FRONTEND
            # Créer une copie du fichier avec le nom original pour que le frontend puisse y accéder
            try:
                # Extraire le nom de fichier original sans les chemins
                original_filename = os.path.basename(file.filename)
                # Supprimer les caractères spéciaux qui pourraient poser problème dans les noms de fichiers
                safe_original_filename = original_filename.replace(" ", "_").replace("'", "")
                
                # Chemins pour les copies avec le nom original
                original_name_file_path = os.path.join(abs_photos_dir, safe_original_filename)
                original_name_thumb_path = os.path.join(abs_thumbs_dir, safe_original_filename)
                
                # Créer des copies des fichiers avec le nom original
                shutil.copy2(photo_path, original_name_file_path)
                shutil.copy2(thumb_path, original_name_thumb_path)
                
                print(f"[UPLOAD PHOTOS] Copies créées pour compatibilité frontend:")
                print(f"  - Image originale: {original_name_file_path}")
                print(f"  - Miniature: {original_name_thumb_path}")
            except Exception as copy_err:
                print(f"[UPLOAD PHOTOS] AVERTISSEMENT: Impossible de créer les copies pour le frontend: {str(copy_err)}")
            
            # Créer l'entrée dans la base de données
            print(f"[UPLOAD PHOTOS] Création de l'entrée en base de données...")
            db_photo = ActionPhoto(
                action_id=action_id,
                file_path=photo_url_path,
                thumbnail_path=thumb_url_path,
                filename=file.filename,
                file_size=len(file_content),
                mime_type=content_type,
                file_hash=file_hash,
                uploaded_by=current_user.id
            )
            
            try:
                db.add(db_photo)
                db.commit()
                db.refresh(db_photo)
                print(f"[UPLOAD PHOTOS] Entrée créée en BDD avec succès (ID: {db_photo.id})")
                
                # Ajouter l'objet photo directement (Pydantic fera la conversion)
                uploaded_photos.append(db_photo)
                print(f"[UPLOAD PHOTOS] Photo ajoutée à la liste des résultats")
            except Exception as db_err:
                print(f"[UPLOAD PHOTOS] ERREUR lors de l'enregistrement en BDD: {str(db_err)}")
                db.rollback()
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Erreur lors de l'enregistrement en base de données: {str(db_err)}"
                )
        
        except Exception as e:
            print(f"[UPLOAD PHOTOS] ERREUR lors du traitement du fichier {file.filename}: {str(e)}")
            print(f"[UPLOAD PHOTOS] Détails: {type(e).__name__}")
            print(f"[UPLOAD PHOTOS] Passage au fichier suivant...")
            continue
    
    # Mettre à jour le compteur de photos pour l'action
    try:
        photo_count = db.query(ActionPhoto).filter(ActionPhoto.action_id == action_id).count()
        print(f"\n[UPLOAD PHOTOS] Mise à jour du compteur de photos pour l'action {action_id}: {photo_count} photos")
        action.photo_count = photo_count
        db.commit()
        print(f"[UPLOAD PHOTOS] Compteur mis à jour avec succès")
    except Exception as count_err:
        print(f"[UPLOAD PHOTOS] ERREUR lors de la mise à jour du compteur: {str(count_err)}")
    
    print(f"\n[UPLOAD PHOTOS] Upload terminé - {len(uploaded_photos)} photo(s) traitée(s) avec succès")
    print("="*80 + "\n")
    
    # Les photos sont déjà converties en dictionnaire, donc pas besoin de rafraîchir
    # Le code suivant générait l'erreur car uploaded_photos contient des dictionnaires, pas des objets ActionPhoto
    # for photo in uploaded_photos:
    #     if not photo.id:
    #         db.refresh(photo)
    
    return uploaded_photos


@router.delete("/{action_id}/photos/{photo_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_action_photo(
    action_id: int,
    photo_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Delete a specific photo from an action
    """
    # Vérifier que l'action existe
    action = db.query(Action).filter(Action.id == action_id).first()
    if not action:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Action not found")
    
    # Vérifier que la photo existe et appartient à cette action
    photo = db.query(ActionPhoto).filter(
        ActionPhoto.id == photo_id,
        ActionPhoto.action_id == action_id
    ).first()
    
    if not photo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Photo not found for this action")
    
    # Supprimer le fichier physique
    try:
        if os.path.exists(photo.file_path):
            os.remove(photo.file_path)
    except Exception as e:
        # Log l'erreur mais continuer pour supprimer l'entrée de la base de données
        print(f"Error deleting photo file: {e}")
    
    # Supprimer l'entrée de la base de données
    db.delete(photo)
    
    # Mettre à jour le compteur de photos pour l'action
    action.photo_count -= 1
    if action.photo_count < 0:
        action.photo_count = 0
    
    db.commit()
    
    return None
