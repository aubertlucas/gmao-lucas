from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from datetime import datetime, date, timedelta
from typing import List, Optional
import json

from database import get_db
from models import User, Action, WorkSchedule, CalendarException, CalendarExceptionType
from utils.auth import get_current_user

router = APIRouter(prefix="/api/planning", tags=["planning"])

def get_week_dates(week_start: date):
    """Retourne les 7 dates de la semaine (lundi à dimanche)"""
    dates = []
    current = week_start
    for i in range(7):
        dates.append(current + timedelta(days=i))
    return dates

def get_monday_of_week(target_date: date):
    """Retourne le lundi de la semaine contenant la date donnée"""
    days_since_monday = target_date.weekday()
    return target_date - timedelta(days=days_since_monday)

def calculate_action_end_date(action, schedule_by_day, db):
    """
    Calcule la date de fin réelle d'une action en tenant compte des horaires et absences
    """
    if not action.estimated_duration or action.estimated_duration <= 0:
        return action.planned_date
    
    # Si l'action est terminée avec une date de fin, utiliser cette date
    if action.final_status == "OK" and action.completion_date:
        return action.completion_date
    
    remaining_hours = action.estimated_duration
    current_date = action.planned_date
    
    # Récupérer toutes les exceptions de l'utilisateur
    exceptions = db.query(CalendarException).filter(
        CalendarException.user_id == action.assigned_to,
        CalendarException.exception_date >= action.planned_date
    ).all()
    exceptions_dict = {exc.exception_date: exc for exc in exceptions}
    
    # Simuler la répartition jusqu'à épuisement
    while remaining_hours > 0:
        day_of_week = current_date.weekday()
        
        # Heures disponibles ce jour
        work_schedule = schedule_by_day.get(day_of_week)
        available_hours = work_schedule.working_hours if work_schedule and work_schedule.is_working_day else 0
        
        # Vérifier les exceptions
        exception = exceptions_dict.get(current_date)
        if exception:
            available_hours = exception.working_hours
        
        if available_hours > 0:
            hours_today = min(remaining_hours, available_hours)
            remaining_hours -= hours_today
        
        if remaining_hours <= 0:
            return current_date
        
        current_date += timedelta(days=1)
        
        # Éviter les boucles infinies (limite à 365 jours)
        if (current_date - action.planned_date).days > 365:
            return current_date
    
    return current_date

@router.get("/user/{user_id}/week/{week_date}")
async def get_user_planning_week(
    user_id: int,
    week_date: str,  # Format: YYYY-MM-DD (n'importe quel jour de la semaine)
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Récupère le planning d'un utilisateur pour une semaine donnée
    """
    try:
        # Parse de la date et récupération du lundi
        target_date = datetime.strptime(week_date, "%Y-%m-%d").date()
        monday = get_monday_of_week(target_date)
        week_dates = get_week_dates(monday)
        
        # Vérification que l'utilisateur existe
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
        
        # Récupération du planning de travail de l'utilisateur
        work_schedules = db.query(WorkSchedule).filter(
            WorkSchedule.user_id == user_id
        ).all()
        
        # Création d'un dictionnaire pour accès rapide par jour de semaine
        schedule_by_day = {ws.day_of_week: ws for ws in work_schedules}
        
        # Récupération des exceptions de calendrier pour cette semaine
        exceptions = db.query(CalendarException).filter(
            and_(
                CalendarException.user_id == user_id,
                CalendarException.exception_date >= week_dates[0],
                CalendarException.exception_date <= week_dates[6]
            )
        ).all()
        
        # Dictionnaire des exceptions par date
        exceptions_by_date = {exc.exception_date: exc for exc in exceptions}
        
        # Récupération des actions qui touchent cette semaine
        # Cela inclut :
        # 1. Actions qui commencent dans la semaine
        # 2. Actions qui touchent la semaine (en cours, prévues, ET terminées dans la période)
        
        # Récupérer toutes les actions de l'utilisateur qui peuvent toucher cette semaine
        # On inclut un range plus large pour être sûr de capturer toutes les actions pertinentes
        range_start = week_dates[0] - timedelta(days=60)  # 60 jours avant pour les actions longues
        range_end = week_dates[6] + timedelta(days=7)     # 7 jours après pour les actions qui débordent
        
        all_relevant_actions = db.query(Action).filter(
            and_(
                Action.assigned_to == user_id,
                # Actions qui commencent dans la plage élargie
                Action.planned_date.between(range_start, range_end)
            )
        ).all()
        
        # Ajouter aussi les actions terminées dans cette semaine (même si elles ont commencé bien avant)
        completed_in_week = db.query(Action).filter(
            and_(
                Action.assigned_to == user_id,
                Action.final_status == "OK",
                Action.completion_date.isnot(None),
                Action.completion_date.between(week_dates[0], week_dates[6])
            )
        ).all()
        
        # Fusionner les deux listes en évitant les doublons
        all_actions_dict = {action.id: action for action in all_relevant_actions}
        for action in completed_in_week:
            if action.id not in all_actions_dict:
                all_actions_dict[action.id] = action
        
        all_relevant_actions = list(all_actions_dict.values())
        
        print(f"[PLANNING] Requête élargie: {len(all_relevant_actions)} actions trouvées entre {range_start} et {range_end}")
        print(f"[PLANNING] + {len(completed_in_week)} actions terminées dans la semaine")
        print(f"[PLANNING] = {len(all_relevant_actions)} actions au total après fusion")
        
        # Filtrer pour ne garder que celles qui touchent réellement la semaine courante
        actions = []
        for action in all_relevant_actions:
            if not action.planned_date:
                continue
                
            # Calculer quand cette action se termine réellement
            action_end_date = calculate_action_end_date(action, schedule_by_day, db)
            
            # Vérifier si l'action touche la semaine courante
            if (action.planned_date <= week_dates[6] and  # Commence avant ou pendant la semaine
                action_end_date >= week_dates[0]):        # Finit après ou pendant la semaine
                actions.append(action)
        
                 # Debug pour développement
        print(f"[PLANNING] User {user_id}, Semaine {week_dates[0]} à {week_dates[6]}:")
        print(f"  - {len(all_relevant_actions)} actions actives au total")
        print(f"  - {len(actions)} actions touchant cette semaine")
        for action in actions:
            action_end = calculate_action_end_date(action, schedule_by_day, db)
            print(f"    Action #{action.number}: {action.planned_date} -> {action_end} ({action.estimated_duration}h)")
        
        # Répartition intelligente des actions sur la semaine
        actions_by_date = {}
        
        # Fonction pour calculer la répartition d'une action sur plusieurs jours
        def distribute_action_hours(action, week_dates, schedule_by_day, exceptions_by_date):
            """
            Répartit les heures d'une action sur plusieurs jours en tenant compte des horaires et absences
            """
            if not action.estimated_duration or action.estimated_duration <= 0:
                return {}
            
            remaining_hours = action.estimated_duration
            start_date = action.planned_date
            current_date = start_date
            action_distribution = {}
            
            # Pour l'affichage, on ne garde que les jours de la semaine courante
            week_start = week_dates[0]
            week_end = week_dates[6]
            
            print(f"[REPARTITION] Action #{action.number}: {action.estimated_duration}h à partir du {start_date}")
            
            # Récupérer TOUTES les exceptions (pas seulement celles de la semaine)
            all_exceptions = db.query(CalendarException).filter(
                CalendarException.user_id == action.assigned_to,
                CalendarException.exception_date >= start_date
            ).all()
            all_exceptions_dict = {exc.exception_date: exc for exc in all_exceptions}
            
            # Calculer la répartition jusqu'à épuisement des heures
            while remaining_hours > 0:
                day_of_week = current_date.weekday()  # 0=Lundi, 6=Dimanche
                
                # Récupérer les heures disponibles pour ce jour
                work_schedule = schedule_by_day.get(day_of_week)
                available_hours = work_schedule.working_hours if work_schedule and work_schedule.is_working_day else 0
                
                # Vérifier les exceptions pour ce jour
                exception = all_exceptions_dict.get(current_date)
                if exception:
                    available_hours = exception.working_hours
                    print(f"[REPARTITION] {current_date}: Exception {exception.exception_type.value} -> {available_hours}h disponibles")
                
                if available_hours > 0:
                    # Calculer les heures à allouer ce jour
                    hours_this_day = min(remaining_hours, available_hours)
                    
                    if hours_this_day > 0:
                        action_distribution[current_date] = hours_this_day
                        remaining_hours -= hours_this_day
                        print(f"[REPARTITION] {current_date}: {hours_this_day}h allouées, reste {remaining_hours}h")
                else:
                    print(f"[REPARTITION] {current_date}: 0h disponibles (jour non travaillé ou absence totale)")
                
                # Passer au jour suivant
                current_date += timedelta(days=1)
                
                # Éviter les boucles infinies (limite à 60 jours)
                if (current_date - start_date).days > 60:
                    print(f"[REPARTITION] LIMITE ATTEINTE: Action #{action.number} non terminée après 60 jours")
                    break
            
            # Ne retourner que les jours de la semaine courante pour l'affichage
            week_distribution = {
                date: hours for date, hours in action_distribution.items()
                if week_start <= date <= week_end
            }
            
            print(f"[REPARTITION] Action #{action.number} - Distribution semaine courante: {len(week_distribution)} jours")
            for date, hours in week_distribution.items():
                print(f"  {date}: {hours}h")
            
            return week_distribution
        
        # Répartir chaque action
        for action in actions:
            distribution = distribute_action_hours(action, week_dates, schedule_by_day, exceptions_by_date)
            
            for action_date, hours in distribution.items():
                if action_date not in actions_by_date:
                    actions_by_date[action_date] = []
                
                # Créer une copie de l'action avec les heures réparties
                action_copy = {
                    'id': action.id,
                    'number': action.number,
                    'title': action.title,
                    'estimated_duration': action.estimated_duration,  # Durée totale originale
                    'distributed_hours': hours,  # Heures pour ce jour spécifique
                    'priority': action.priority,
                    'location': action.location.name if action.location else None,
                    'final_status': action.final_status,
                    'check_status': action.check_status,
                    'completion_date': action.completion_date.isoformat() if action.completion_date else None,
                    'planned_date': action.planned_date.isoformat(),
                    'is_distributed': True  # Marquer comme répartie
                }
                
                actions_by_date[action_date].append(action_copy)
        
        # Construction des données de la semaine
        week_data = []
        
        for i, current_date in enumerate(week_dates):
            day_of_week = i  # 0 = Lundi, 6 = Dimanche
            
            # Récupération du planning de travail pour ce jour
            work_schedule = schedule_by_day.get(day_of_week)
            available_hours = work_schedule.working_hours if work_schedule and work_schedule.is_working_day else 0
            
            # Récupération des exceptions pour ce jour
            exception = exceptions_by_date.get(current_date)
            absence_hours = 0
            exception_info = None
            
            if exception:
                absence_hours = available_hours - exception.working_hours
                exception_info = {
                    "type": exception.exception_type.value,
                    "description": exception.description,
                    "working_hours": exception.working_hours
                }
            
            # Calcul des heures réellement disponibles
            effective_hours = available_hours - absence_hours
            
            # Récupération des actions pour ce jour
            day_actions = actions_by_date.get(current_date, [])
            
            # Calcul des heures planifiées et par statut
            planned_hours = 0
            hours_by_status = {"completed": 0, "in_progress": 0, "pending": 0}
            
            actions_data = []
            for action in day_actions:
                # Utiliser les heures distribuées ou la durée totale selon le type
                if isinstance(action, dict) and 'distributed_hours' in action:
                    # Action répartie
                    duration = action['distributed_hours']
                    planned_hours += duration
                    
                    # Détermination du statut
                    status = "pending"
                    if action['final_status'] == "OK" and action['completion_date']:
                        status = "completed"
                    elif action['check_status'] == "OK":
                        status = "in_progress"
                    
                    hours_by_status[status] += duration
                    
                    actions_data.append({
                        "id": action['id'],
                        "number": action['number'],
                        "title": action['title'],
                        "estimated_duration": action['estimated_duration'],  # Durée totale
                        "distributed_hours": duration,  # Heures pour ce jour
                        "priority": action['priority'],
                        "status": status,
                        "location": action['location'],
                        "final_status": action['final_status'],
                        "check_status": action['check_status'],
                        "completion_date": action['completion_date'],
                        "planned_date": action['planned_date'],
                        "is_distributed": True
                    })
                else:
                    # Action ponctuelle (ancien format)
                    duration = action.estimated_duration or 0
                    planned_hours += duration
                    
                    # Détermination du statut
                    status = "pending"
                    if action.final_status == "OK" and action.completion_date:
                        status = "completed"
                    elif action.check_status == "OK":
                        status = "in_progress"
                    
                    hours_by_status[status] += duration
                    
                    actions_data.append({
                        "id": action.id,
                        "number": action.number,
                        "title": action.title,
                        "estimated_duration": duration,
                        "distributed_hours": duration,  # Même valeur pour les actions ponctuelles
                        "priority": action.priority,
                        "status": status,
                        "location": action.location.name if action.location else None,
                        "final_status": action.final_status,
                        "check_status": action.check_status,
                        "completion_date": action.completion_date.isoformat() if action.completion_date else None,
                        "planned_date": action.planned_date.isoformat(),
                        "is_distributed": False
                    })
            
            # Calcul des indicateurs
            workload_percentage = (planned_hours / effective_hours * 100) if effective_hours > 0 else 0
            is_overloaded = planned_hours > effective_hours
            
            day_data = {
                "date": current_date.isoformat(),
                "day_name": ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"][day_of_week],
                "day_of_week": day_of_week,
                "is_working_day": work_schedule.is_working_day if work_schedule else False,
                "available_hours": available_hours,
                "absence_hours": absence_hours,
                "effective_hours": effective_hours,
                "planned_hours": planned_hours,
                "workload_percentage": workload_percentage,
                "is_overloaded": is_overloaded,
                "hours_by_status": hours_by_status,
                "exception": exception_info,
                "actions": actions_data,
                "actions_count": len(actions_data)
            }
            
            week_data.append(day_data)
            
        # Post-traitement pour la surcharge intelligente
        for i in range(len(week_data) - 1):  # On s'arrête à l'avant-dernier jour
            current_day = week_data[i]
            next_day = week_data[i+1]

            if current_day.get("is_overloaded"):
                surplus = current_day["planned_hours"] - current_day["effective_hours"]
                next_day_capacity = next_day["effective_hours"] - next_day["planned_hours"]

                if surplus > 0 and surplus <= next_day_capacity:
                    # La capacité du lendemain peut absorber le surplus. On redistribue.
                    current_day["is_overloaded"] = False
                    
                    hours_to_move = surplus
                    
                    # Itérer sur une copie inversée des actions pour déplacer les dernières en premier
                    actions_to_process = list(reversed(current_day["actions"]))
                    
                    for action in actions_to_process:
                        if hours_to_move <= 0:
                            break
                        
                        movable_hours = min(hours_to_move, action["distributed_hours"])
                        
                        if movable_hours > 0:
                            # Réduire les heures sur le jour actuel
                            action["distributed_hours"] -= movable_hours
                            
                            # Créer une action de "continuation" pour le jour suivant
                            continuation_action = action.copy()
                            continuation_action["distributed_hours"] = movable_hours
                            continuation_action["is_continuation"] = True # Marqueur pour le frontend
                            
                            # Ajouter l'action au jour suivant (en fusionnant si elle existe déjà)
                            found_on_next_day = False
                            for next_day_action in next_day["actions"]:
                                if next_day_action["id"] == continuation_action["id"]:
                                    next_day_action["distributed_hours"] += movable_hours
                                    found_on_next_day = True
                                    break
                            
                            if not found_on_next_day:
                                next_day["actions"].append(continuation_action)

                            hours_to_move -= movable_hours

                    # Nettoyer les actions qui ont été entièrement déplacées
                    current_day["actions"] = [a for a in current_day["actions"] if a["distributed_hours"] > 0.01]
                    
                    # Mettre à jour les heures planifiées pour refléter la redistribution visuelle
                    current_day["planned_hours"] = sum(a["distributed_hours"] for a in current_day["actions"])
                    next_day["planned_hours"] = sum(a["distributed_hours"] for a in next_day["actions"])
                    
                    print(f"[REPARTITION_VISUELLE] Jour {current_day['date']} normalisé: {surplus:.1f}h déplacées vers {next_day['date']}")
        
        return {
            "user_id": user_id,
            "username": user.username,
            "week_start": monday.isoformat(),
            "week_end": week_dates[6].isoformat(),
            "week_number": monday.isocalendar()[1],
            "year": monday.year,
            "days": week_data,
            "week_summary": {
                "total_available_hours": sum(day["available_hours"] for day in week_data),
                "total_absence_hours": sum(day["absence_hours"] for day in week_data),
                "total_effective_hours": sum(day["effective_hours"] for day in week_data),
                "total_planned_hours": sum(day["planned_hours"] for day in week_data),
                "total_actions": sum(day["actions_count"] for day in week_data),
                "overloaded_days": sum(1 for day in week_data if day["is_overloaded"])
            }
        }
        
    except ValueError:
        raise HTTPException(status_code=400, detail="Format de date invalide. Utilisez YYYY-MM-DD")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur serveur: {str(e)}")

@router.get("/users")
async def get_planning_users(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Récupère la liste des utilisateurs pour le sélecteur de planning
    """
    users = db.query(User).filter(User.is_active == True).all()
    
    users_data = []
    for user in users:
        users_data.append({
            "id": user.id,
            "username": user.username,
            "role": user.role
        })
    
    return {"users": users_data} 
