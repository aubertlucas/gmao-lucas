from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date, datetime, timedelta

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import get_db
from models import User, WorkSchedule, CalendarException, CalendarExceptionType, Action
from schemas import (
    WorkSchedule as WorkScheduleSchema,
    WorkScheduleCreate,
    WorkScheduleUpdate,
    CalendarException as CalendarExceptionSchema,
    CalendarExceptionCreate,
    CalendarExceptionUpdate
)
from utils.auth import get_current_active_user, check_admin_role

router = APIRouter(
    prefix="/calendar",
    tags=["calendar"],
    responses={404: {"description": "Not found"}},
)

# ---- Routes pour les horaires hebdomadaires ----

@router.get("/users/{user_id}/schedule", response_model=List[WorkScheduleSchema])
async def get_user_schedule(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Récupérer l'horaire hebdomadaire d'un utilisateur
    """
    # Vérifier que l'utilisateur existe
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Utilisateur avec ID {user_id} non trouvé"
        )
    
    # Vérifier les permissions (seul l'utilisateur lui-même ou un admin peut voir)
    if current_user.id != user_id and current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Vous n'êtes pas autorisé à voir cet horaire"
        )
    
    # Récupérer l'horaire
    schedules = db.query(WorkSchedule).filter(WorkSchedule.user_id == user_id).all()
    
    # Si aucun horaire n'existe, créer un horaire par défaut (5 jours, 8h/jour)
    if not schedules:
        schedules = []
        for day in range(7):  # 0=Lundi, 6=Dimanche
            is_working_day = day < 5  # Lundi-Vendredi sont des jours travaillés
            hours = 8.0 if is_working_day else 0.0
            
            schedule = WorkSchedule(
                user_id=user_id,
                day_of_week=day,
                working_hours=hours,
                is_working_day=is_working_day
            )
            db.add(schedule)
            schedules.append(schedule)
        
        db.commit()
        for schedule in schedules:
            db.refresh(schedule)
    
    return schedules

@router.put("/users/{user_id}/schedule", response_model=List[WorkScheduleSchema])
async def update_user_schedule(
    user_id: int,
    schedule_data: List[WorkScheduleCreate],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)  # Utilisateur authentifié
):
    """
    Mettre à jour l'horaire hebdomadaire d'un utilisateur
    """
    # Vérifier que l'utilisateur existe
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Utilisateur avec ID {user_id} non trouvé"
        )
    
    # Vérifier les horaires existants avant suppression
    existing = db.query(WorkSchedule).filter(WorkSchedule.user_id == user_id).all()
    print(f"\n[DEBUG CALENDRIER] Horaires existants avant mise à jour: {len(existing)} entrées pour l'utilisateur {user_id}")
    
    # Supprimer les horaires existants
    db.query(WorkSchedule).filter(WorkSchedule.user_id == user_id).delete()
    db.flush()  # Flush pour s'assurer que la suppression est appliquée avant les nouvelles insertions
    
    # Créer les nouveaux horaires
    new_schedules = []
    print(f"[DEBUG CALENDRIER] Création de {len(schedule_data)} nouveaux horaires")
    
    for schedule in schedule_data:
        # S'assurer que le user_id est correct
        if schedule.user_id != user_id:
            schedule.user_id = user_id
        
        # Afficher les données pour le débogage
        print(f"[DEBUG CALENDRIER] Ajout horaire: jour {schedule.day_of_week}, travaillé={schedule.is_working_day}, heures={schedule.working_hours}")
            
        db_schedule = WorkSchedule(**schedule.dict())
        db.add(db_schedule)
        new_schedules.append(db_schedule)
        
    # Flush avant commit pour détecter d'éventuels problèmes
    db.flush()
    
    # Commit et refresh
    db.commit()
    for schedule in new_schedules:
        db.refresh(schedule)
    
    # Vérifier que les données sont bien enregistrées
    verification = db.query(WorkSchedule).filter(WorkSchedule.user_id == user_id).all()
    print(f"[DEBUG CALENDRIER] Vérification après commit: {len(verification)} horaires trouvés")
    for sched in verification:
        print(f"[DEBUG CALENDRIER] Vérifié: jour {sched.day_of_week}, travaillé={sched.is_working_day}, heures={sched.working_hours}")
    
    return new_schedules

# Fonction auxiliaire pour recalculer les dates de fin des actions
def recalculate_action_end_dates(user_id, exception_date, db):
    """
    Recalcule les dates de fin des actions affectées par une exception de calendrier
    """
    from routes.actions import calculate_end_date
    
    print(f"\n[DEBUG RECALCUL] Recherche des actions affectées par l'exception du {exception_date} pour l'utilisateur {user_id}")
    
    # Trouver toutes les actions assignées à cet utilisateur qui pourraient être affectées
    # D'abord, récupérer toutes les actions de l'utilisateur qui ont une date prévue
    try:
        # On sécurise la requête pour éviter les erreurs avec les dates None
        candidate_actions = db.query(Action).filter(
            Action.assigned_to == user_id,
            Action.planned_date.isnot(None)
        ).all()
        
        # Filtrer manuellement les actions affectées
        affected_actions = []
        for action in candidate_actions:
            # Certaines actions peuvent ne pas avoir de date de fin prévue
            if action.planned_date and action.predicted_end_date:
                # Vérifier si l'action chevauche la date d'exception
                if action.planned_date <= exception_date and action.predicted_end_date >= exception_date:
                    affected_actions.append(action)
    except Exception as e:
        print(f"[ERREUR RECALCUL] Erreur lors de la recherche des actions affectées: {str(e)}")
        affected_actions = []
    
    print(f"[DEBUG RECALCUL] {len(affected_actions)} actions affectées trouvées")
    
    # Recalculer la date de fin pour chaque action affectée
    for action in affected_actions:
        print(f"[DEBUG RECALCUL] Action {action.id}: {action.title}")
        print(f"[DEBUG RECALCUL] Date prévue: {action.planned_date}, Durée: {action.estimated_duration} heures")
        print(f"[DEBUG RECALCUL] Ancienne date de fin: {action.predicted_end_date}")
        
        # Recalculer la date de fin
        new_end_date = calculate_end_date(
            action.planned_date,
            action.estimated_duration,
            action.assigned_to,
            db
        )
        
        # Mettre à jour l'action avec la nouvelle date de fin
        action.predicted_end_date = new_end_date
        print(f"[DEBUG RECALCUL] Nouvelle date de fin: {new_end_date}")
    
    # Sauvegarder les modifications
    if affected_actions:
        db.commit()
        print(f"[DEBUG RECALCUL] {len(affected_actions)} actions mises à jour")

# ---- Routes pour les exceptions de calendrier ----

@router.get("/users/{user_id}/exceptions/check", response_model=Optional[CalendarExceptionSchema])
async def check_user_exception_on_date(
    user_id: int,
    date: date,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Vérifie si un utilisateur a une exception pour une date spécifique.
    Retourne l'exception si elle existe, sinon null.
    """
    exception = db.query(CalendarException).filter(
        CalendarException.user_id == user_id,
        CalendarException.exception_date == date
    ).first()
    
    return exception

@router.get("/users/{user_id}/exceptions", response_model=List[CalendarExceptionSchema])
async def get_user_calendar_exceptions(
    user_id: int,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Récupérer les exceptions de calendrier d'un utilisateur
    """
    # Vérifier que l'utilisateur existe
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Utilisateur avec ID {user_id} non trouvé"
        )
    
    # Vérifier les permissions
    if current_user.id != user_id and current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Vous n'êtes pas autorisé à voir ces exceptions"
        )
    
    # Construire la requête
    query = db.query(CalendarException).filter(CalendarException.user_id == user_id)
    
    # Filtrer par dates si spécifiées
    if start_date:
        query = query.filter(CalendarException.exception_date >= start_date)
    if end_date:
        query = query.filter(CalendarException.exception_date <= end_date)
    
    # Trier par date
    query = query.order_by(CalendarException.exception_date)
    
    exceptions = query.all()
    return exceptions

@router.post("/users/{user_id}/exceptions", response_model=CalendarExceptionSchema, status_code=status.HTTP_201_CREATED)
async def add_calendar_exception(
    user_id: int,
    exception_data: CalendarExceptionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)  # Tout utilisateur authentifié
):
    """
    Ajouter une exception au calendrier d'un utilisateur
    """
    # Vérifier que l'utilisateur existe
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Utilisateur avec ID {user_id} non trouvé"
        )
    
    # Vérifier les permissions (utilisateur modifie son propre calendrier ou admin)
    if current_user.id != user_id and current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Vous n'êtes pas autorisé à modifier ce calendrier"
        )
    
    # S'assurer que le user_id est correct
    if exception_data.user_id != user_id:
        exception_data.user_id = user_id
    
    # Vérifier si une exception existe déjà pour cette date
    existing_exception = db.query(CalendarException).filter(
        CalendarException.user_id == user_id,
        CalendarException.exception_date == exception_data.exception_date
    ).first()
    
    if existing_exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Une exception existe déjà pour l'utilisateur {user_id} à la date {exception_data.exception_date}"
        )
    
    # Créer l'exception
    db_exception = CalendarException(**exception_data.dict())
    db.add(db_exception)
    db.commit()
    db.refresh(db_exception)
    
    # Recalculer automatiquement les dates de fin des actions affectées
    print(f"\n[INFO] Recalcul des dates de fin après ajout d'une exception le {db_exception.exception_date}")
    recalculate_action_end_dates(user_id, db_exception.exception_date, db)
    
    return db_exception

@router.put("/users/{user_id}/exceptions/{exception_id}", response_model=CalendarExceptionSchema)
async def update_calendar_exception(
    user_id: int,
    exception_id: int,
    exception_data: CalendarExceptionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)  # Tout utilisateur authentifié
):
    """
    Mettre à jour une exception de calendrier
    """
    # Vérifier que l'exception existe et appartient à l'utilisateur
    db_exception = db.query(CalendarException).filter(
        CalendarException.id == exception_id,
        CalendarException.user_id == user_id
    ).first()
    
    if not db_exception:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Exception avec ID {exception_id} non trouvée pour l'utilisateur {user_id}"
        )
    
    # Vérifier les permissions (utilisateur modifie son propre calendrier ou admin)
    if current_user.id != user_id and current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Vous n'êtes pas autorisé à modifier ce calendrier"
        )
    
    # Enregistrer l'ancienne date pour vérifier si elle a changé
    old_date = db_exception.exception_date
    
    # Mettre à jour les champs
    update_data = exception_data.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_exception, key, value)
    
    db.commit()
    db.refresh(db_exception)
    
    # Recalculer automatiquement les dates de fin des actions affectées
    dates_to_check = [old_date]
    if 'exception_date' in update_data and old_date != db_exception.exception_date:
        dates_to_check.append(db_exception.exception_date)
    
    print(f"\n[INFO] Recalcul des dates de fin après modification d'une exception")
    for date_to_check in dates_to_check:
        recalculate_action_end_dates(user_id, date_to_check, db)
    
    return db_exception

@router.delete("/users/{user_id}/exceptions/{exception_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_calendar_exception(
    user_id: int,
    exception_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)  # Tout utilisateur authentifié
):
    """
    Supprimer une exception de calendrier
    """
    # Vérifier que l'exception existe et appartient à l'utilisateur
    db_exception = db.query(CalendarException).filter(
        CalendarException.id == exception_id,
        CalendarException.user_id == user_id
    ).first()
    
    if not db_exception:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Exception avec ID {exception_id} non trouvée pour l'utilisateur {user_id}"
        )
    
    # Vérifier les permissions (utilisateur modifie son propre calendrier ou admin)
    if current_user.id != user_id and current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Vous n'êtes pas autorisé à modifier ce calendrier"
        )
    
    # Enregistrer la date de l'exception avant suppression pour recalculer les actions
    exception_date = db_exception.exception_date
    
    # Supprimer l'exception
    db.delete(db_exception)
    db.commit()
    
    # Recalculer automatiquement les dates de fin des actions affectées
    print(f"\n[INFO] Recalcul des dates de fin après suppression d'une exception le {exception_date}")
    recalculate_action_end_dates(user_id, exception_date, db)
    
    return None
