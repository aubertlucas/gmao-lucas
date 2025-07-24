"""
Module pour gérer la tolérance des retards d'actions.
Permet de lisser les retards à la journée de travail près selon le planning de chaque utilisateur.
"""

from datetime import date, timedelta
from sqlalchemy.orm import Session
from models import User, WorkSchedule, CalendarException
import json
import os

def load_delay_tolerance_config():
    """Charge la configuration de tolérance des retards"""
    try:
        config_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'config.json')
        with open(config_path, 'r', encoding='utf-8') as f:
            config = json.load(f)
        return config.get('delayToleranceSettings', {})
    except Exception:
        return {"enabled": False}

def get_user_working_hours_per_day(user_id: int, db: Session):
    """
    Calcule le nombre d'heures moyennes de travail par jour pour un utilisateur
    """
    schedules = db.query(WorkSchedule).filter(WorkSchedule.user_id == user_id).all()
    
    if not schedules:
        return 8.0  # Valeur par défaut
    
    total_hours = 0
    working_days = 0
    
    for schedule in schedules:
        if schedule.is_working_day and schedule.working_hours > 0:
            total_hours += schedule.working_hours
            working_days += 1
    
    if working_days == 0:
        return 8.0
    
    return total_hours / working_days

def calculate_tolerance_in_hours(user_id: int, db: Session):
    """
    Calcule la tolérance en heures pour un utilisateur donné.
    Équivaut à 1 journée de travail selon son planning.
    """
    config = load_delay_tolerance_config()
    
    if not config.get('enabled', False):
        return 0  # Pas de tolérance
    
    # Tolérance = 1 journée de travail (en heures)
    return get_user_working_hours_per_day(user_id, db)

def is_action_overdue_with_tolerance(completion_date: date, planned_end_date: date, user_id: int, db: Session):
    """
    Détermine si une action est en retard en tenant compte de la tolérance.
    
    Args:
        completion_date: Date de fin réelle de l'action
        planned_end_date: Date de fin prévue (calculated ou planned_date)
        user_id: ID de l'utilisateur assigné
        db: Session de base de données
    
    Returns:
        bool: True si l'action est en retard (même avec tolérance), False sinon
    """
    
    # Si pas de dates, on ne peut pas calculer
    if not completion_date or not planned_end_date:
        return False
    
    # Si terminé à temps ou en avance, pas de retard
    if completion_date <= planned_end_date:
        return False
    
    # Charger la configuration
    config = load_delay_tolerance_config()
    
    if not config.get('enabled', False):
        # Tolérance désactivée : logique classique
        return completion_date > planned_end_date
    
    # Calculer la tolérance en heures
    tolerance_hours = calculate_tolerance_in_hours(user_id, db)
    
    if tolerance_hours <= 0:
        return completion_date > planned_end_date
    
    # Calculer le délai en heures
    delay_days = (completion_date - planned_end_date).days
    delay_hours = delay_days * 24  # Conversion approximative en heures
    
    # Retard seulement si dépassement de la tolérance
    is_overdue = delay_hours > tolerance_hours
    
    # Debug pour comprendre le calcul (logs réduits)
    if completion_date > planned_end_date and delay_hours > tolerance_hours:
        print(f"[TOLERANCE] Action user {user_id}: retard {delay_hours:.1f}h > tolérance {tolerance_hours:.1f}h -> EN RETARD")
    
    return is_overdue

def get_effective_deadline_with_tolerance(planned_end_date: date, user_id: int, db: Session):
    """
    Calcule la date limite effective en tenant compte de la tolérance.
    Utile pour l'affichage et les alertes.
    """
    if not planned_end_date:
        return planned_end_date
        
    config = load_delay_tolerance_config()
    
    if not config.get('enabled', False):
        return planned_end_date
    
    tolerance_hours = calculate_tolerance_in_hours(user_id, db)
    
    if tolerance_hours <= 0:
        return planned_end_date
    
    # Convertir les heures de tolérance en jours (approximation)
    tolerance_days = tolerance_hours / 24.0
    return planned_end_date + timedelta(days=tolerance_days)

def get_tolerance_summary(user_id: int, db: Session):
    """
    Retourne un résumé de la configuration de tolérance pour un utilisateur.
    Utile pour l'affichage dans l'interface.
    """
    config = load_delay_tolerance_config()
    
    if not config.get('enabled', False):
        return {
            "enabled": False,
            "message": "Tolérance désactivée"
        }
    
    tolerance_hours = calculate_tolerance_in_hours(user_id, db)
    avg_hours = get_user_working_hours_per_day(user_id, db)
    
    return {
        "enabled": True,
        "tolerance_hours": tolerance_hours,
        "avg_working_hours": avg_hours,
        "message": f"Tolérance: {tolerance_hours:.1f}h (1 journée de travail)"
    } 
