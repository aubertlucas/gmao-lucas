from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func, case
from typing import List, Optional
from datetime import date, datetime, timedelta

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import get_db
from models import Action, Location, User
from schemas import DashboardStats, DashboardAlert
from utils.auth import get_current_active_user

router = APIRouter(
    prefix="/dashboard",
    tags=["dashboard"],
    responses={404: {"description": "Not found"}},
)

@router.get("/stats", response_model=DashboardStats)
async def get_dashboard_stats(
    assigned_to: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Get statistics for the dashboard
    """
    # Base query for filtering by user if an ID is provided
    base_query = db.query(Action)
    if assigned_to:
        base_query = base_query.filter(Action.assigned_to == assigned_to)

    # Count total actions
    total_actions = base_query.with_entities(func.count(Action.id)).scalar()
    
    # Count completed actions
    completed_actions = base_query.with_entities(func.count(Action.id)).filter(Action.final_status == "OK").scalar()
    
    # Count in progress actions
    in_progress_actions = base_query.with_entities(func.count(Action.id)).filter(
        Action.final_status == "NON",
        Action.priority != 4,  # Exclure les actions "À planifier"
        Action.check_status == "OK"  # Doit être vérifiée pour être "En cours"
    ).scalar()
    
    # Count overdue actions (planned date in the past but not completed)
    today = date.today()
    overdue_actions = base_query.with_entities(func.count(Action.id)).filter(
        Action.predicted_end_date < today,  # Utiliser la date de fin prévue comme référence
        Action.final_status == "NON",
        Action.priority != 4  # Les actions "À planifier" ne sont pas considérées comme en retard
    ).scalar()
    
    # Statistiques de performance globale
    # Actions terminées à temps
    completed_on_time = base_query.with_entities(func.count(Action.id)).filter(
        Action.final_status == "OK",
        Action.was_overdue_on_completion == False,
        Action.priority != 4
    ).scalar()
    
    # Actions terminées en retard
    completed_overdue = base_query.with_entities(func.count(Action.id)).filter(
        Action.final_status == "OK",
        Action.was_overdue_on_completion == True,
        Action.priority != 4
    ).scalar()
    
    # Actions en cours à temps (pas encore en retard)
    in_progress_on_time = base_query.with_entities(func.count(Action.id)).filter(
        Action.final_status == "NON",
        Action.predicted_end_date >= today,
        Action.priority != 4
    ).scalar()
    
    # Actions en cours en retard (déjà en retard)
    in_progress_overdue = base_query.with_entities(func.count(Action.id)).filter(
        Action.final_status == "NON",
        Action.predicted_end_date < today,
        Action.priority != 4
    ).scalar()
    
    # Calcul du pourcentage de performance
    total_tracked = (completed_on_time or 0) + (completed_overdue or 0) + (in_progress_on_time or 0) + (in_progress_overdue or 0)
    on_time_total = (completed_on_time or 0) + (in_progress_on_time or 0)
    performance_percentage = round((on_time_total / total_tracked * 100) if total_tracked > 0 else 0)
    
    # Get actions by priority
    priority_counts = base_query.with_entities(
        Action.priority,
        func.count(Action.id)
    ).group_by(Action.priority).all()
    
    actions_by_priority = {
        priority: count for priority, count in priority_counts
    }
    
    # Formater les données de priorité pour le graphique
    # 1 = Haute, 2 = Moyenne, 3 = Basse
    priority_high = actions_by_priority.get(1, 0)    # Priorité haute (1)
    priority_medium = actions_by_priority.get(2, 0)  # Priorité moyenne (2) 
    priority_low = actions_by_priority.get(3, 0)     # Priorité basse (3)
    priority_tbd = actions_by_priority.get(4, 0)     # Priorité planifier (4)
    # Traiter les anciennes valeurs (0) comme priorité basse
    priority_low += actions_by_priority.get(0, 0)
    
    # --- DEBUG: Affiche les comptes de priorité ---
    print(f"[DEBUG] Priority counts: High={priority_high}, Medium={priority_medium}, Low={priority_low}, TBD={priority_tbd}")
    
    # Calculer les coûts totaux
    cost_stats = base_query.with_entities(
        func.sum(Action.budget_initial).label('total_budget_initial'),
        func.sum(Action.actual_cost).label('total_actual_cost')
    ).first()
    
    total_budget_initial = cost_stats.total_budget_initial or 0 if cost_stats else 0
    total_actual_cost = cost_stats.total_actual_cost or 0 if cost_stats else 0
    
    # Get actions by location
    location_counts = base_query.with_entities(
        Location.name,
        func.count(Action.id)
    ).join(Location, Location.id == Action.location_id).group_by(Location.name).all()
    
    actions_by_location = {
        location: count for location, count in location_counts
    }
    
    # Get recent actions
    recent_actions_query = base_query.with_entities(Action)\
        .order_by(Action.id.desc())\
        .limit(5)\
        .all()
    
    # Convert to list of dictionaries with proper field names
    recent_actions = []
    for action in recent_actions_query:
        # Get location name if available
        location_name = None
        if action.location_id:
            location = db.query(Location).filter(Location.id == action.location_id).first()
            if location:
                location_name = location.name
        
        # Get assigned user name if available
        assigned_to_name = None
        if action.assigned_to:
            user = db.query(User).filter(User.id == action.assigned_to).first()
            if user:
                assigned_to_name = user.username
        
        recent_actions.append({
            "id": action.id,
            "number": action.number,
            "title": action.title,
            "priority": action.priority,
            "location_name": location_name,
            "assigned_to_name": assigned_to_name,
            "budget_initial": action.budget_initial,
            "actual_cost": action.actual_cost,
            "planned_date": action.planned_date,
            "final_status": action.final_status,
        })
    
    # Return stats
    return {
        "total_actions": total_actions or 0,
        "completed_actions": completed_actions or 0,
        "in_progress_actions": in_progress_actions or 0,
        "overdue_actions": overdue_actions or 0,
        "actions_by_priority": actions_by_priority,
        "actions_by_location": actions_by_location,
        "total_budget_initial": float(total_budget_initial),
        "total_actual_cost": float(total_actual_cost),
        "priority_high": priority_high,
        "priority_medium": priority_medium,
        "priority_low": priority_low,
        "priority_tbd": priority_tbd,
        "location_data": actions_by_location,
        "recent_actions": recent_actions,
        # Nouvelles statistiques de performance
        "completed_on_time": completed_on_time or 0,
        "completed_overdue": completed_overdue or 0,
        "in_progress_on_time": in_progress_on_time or 0,
        "in_progress_overdue": in_progress_overdue or 0,
        "performance_percentage": performance_percentage
    }

@router.get("/alerts", response_model=List[DashboardAlert])
async def get_dashboard_alerts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Get critical alerts for the dashboard
    """
    today = date.today()
    
    # Query actions that are due soon or overdue
    alerts_query = db.query(
        Action.id,
        Action.number,
        Action.title,
        Action.priority,
        Action.planned_date,
        case(
            # Calculate days remaining (negative for overdue)
            (Action.planned_date < today, func.julianday(Action.planned_date) - func.julianday(today)),
            else_=func.julianday(Action.planned_date) - func.julianday(today)
        ).label("days_remaining")
    ).filter(
        # Only include non-completed actions
        Action.final_status == "NON",
        # With a planned date
        Action.planned_date.isnot(None),
        # Due within 14 days or overdue
        Action.planned_date <= today + timedelta(days=14)
    ).order_by("days_remaining")
    
    # Get the results
    alerts = alerts_query.all()
    
    # Convert to the schema format
    result = []
    for alert in alerts:
        result.append({
            "id": alert.id,
            "number": alert.number,
            "title": alert.title,
            "priority": alert.priority,
            "planned_date": alert.planned_date,
            "days_remaining": int(alert.days_remaining)
        })
    
    return result


