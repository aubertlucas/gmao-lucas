from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional

import sys
import os
import json
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import get_db
from models import User, Location, Action, CalendarException, WorkSchedule, WorkCalendar, ActionPhoto
from schemas import Location as LocationSchema, LocationCreate, Configuration
from utils.auth import get_current_active_user, check_admin_role

router = APIRouter(
    prefix="/config",
    tags=["configuration"],
    responses={404: {"description": "Not found"}},
)

@router.get("/all", response_model=Configuration)
async def get_all_configuration(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Get the complete system configuration
    """
    # Get locations
    locations = db.query(Location).filter(Location.is_active == True).all()
    lieux = [location.name for location in locations]
    
    # Get pilots (users with pilot role)
    pilots = db.query(User).filter(User.role == "pilot").all()
    pilotes = [pilot.username for pilot in pilots]
    
    # Generate schedules (in a real app, would get from work_calendars table)
    schedules = {}
    for pilot in pilots:
        # Utiliser un planning standard pour tous les utilisateurs
        # L'horaire spécifique sera géré via l'UI ou l'API de configuration
        days = 5
        hours = 8
        schedules[pilot.username] = {"days": days, "hours": hours}
    
    # Get photos folder from configuration file or use default
    photos_folder = "uploads/photos"
    config_file = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "config.json")
    
    try:
        if os.path.exists(config_file):
            with open(config_file, 'r') as f:
                saved_config = json.loads(f.read())
                if "photosFolder" in saved_config and saved_config["photosFolder"]:
                    photos_folder = saved_config["photosFolder"]
    except Exception as e:
        print(f"Error reading config file: {e}")
    
    # Return configuration
    return {
        "photosFolder": photos_folder,
        "lieux": lieux,
        "pilotes": pilotes,
        "schedules": schedules
    }

@router.post("/save", response_model=Configuration)
async def save_configuration(
    config: Configuration,
    db: Session = Depends(get_db),
    current_user: User = Depends(check_admin_role)  # Only admins can save configuration
):
    """
    Save the complete system configuration
    """
    # Handle locations
    # First, mark all as inactive
    db.query(Location).update({"is_active": False})
    
    # Then add or update each location
    for lieu in config.lieux:
        location = db.query(Location).filter(Location.name == lieu).first()
        if location:
            location.is_active = True
        else:
            new_location = Location(name=lieu, is_active=True)
            db.add(new_location)
    
    # Handle pilots - this would be more complex in a real app
    # Just demonstrating the concept here
    
    # Save photos folder configuration to config.json
    config_file = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "config.json")
    
    try:
        # Create an object with current config
        config_data = {
            "photosFolder": config.photosFolder
        }
        
        # Write to config file
        with open(config_file, 'w') as f:
            f.write(json.dumps(config_data, indent=4))
            
        # Ensure the photos directory exists
        photos_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), config.photosFolder)
        if not os.path.exists(photos_dir):
            os.makedirs(photos_dir, exist_ok=True)
            
        # Create thumbs directory if it doesn't exist
        thumbs_dir = os.path.join(os.path.dirname(photos_dir), "thumbs")
        if not os.path.exists(thumbs_dir):
            os.makedirs(thumbs_dir, exist_ok=True)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur lors de la sauvegarde de la configuration: {str(e)}"
        )
    
    # Commit changes
    db.commit()
    
    return config

@router.get("/locations", response_model=List[LocationSchema])
async def get_locations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Get all active locations
    """
    locations = db.query(Location).filter(Location.is_active == True).all()
    return locations

@router.post("/locations", response_model=LocationSchema, status_code=status.HTTP_201_CREATED)
async def create_location(
    location: LocationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(check_admin_role)  # Only admins can create locations
):
    """
    Create a new location
    """
    # Check if location already exists
    existing = db.query(Location).filter(Location.name == location.name).first()
    if existing:
        # If it exists but is inactive, just reactivate it
        if not existing.is_active:
            existing.is_active = True
            db.commit()
            db.refresh(existing)
            return existing
        
        # Otherwise, it's a duplicate
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Location '{location.name}' already exists"
        )
    
    # Create new location
    db_location = Location(**location.dict())
    db.add(db_location)
    db.commit()
    db.refresh(db_location)
    return db_location


@router.post("/reset-application-data", status_code=status.HTTP_200_OK)
async def reset_application_data(
    db: Session = Depends(get_db),
    current_user: User = Depends(check_admin_role)  # Seuls les admins peuvent réinitialiser les données
):
    """
    Réinitialise toutes les données de l'application sauf les utilisateurs et mots de passe
    """
    try:
        print("[INFO] Début de la réinitialisation des données de l'application")
        
        # Supprimer toutes les photos d'actions
        photos_count = db.query(ActionPhoto).delete()
        print(f"[INFO] {photos_count} photos d'actions supprimées")
        
        # Supprimer toutes les actions
        actions_count = db.query(Action).delete()
        print(f"[INFO] {actions_count} actions supprimées")
        
        # Supprimer toutes les exceptions de calendrier
        exceptions_count = db.query(CalendarException).delete()
        print(f"[INFO] {exceptions_count} exceptions de calendrier supprimées")
        
        # Supprimer tous les horaires de travail (nouveau modèle)
        schedules_count = db.query(WorkSchedule).delete()
        print(f"[INFO] {schedules_count} horaires de travail supprimés (WorkSchedule)")
        
        # Supprimer tous les anciens calendriers de travail
        calendars_count = db.query(WorkCalendar).delete()
        print(f"[INFO] {calendars_count} calendriers de travail supprimés (WorkCalendar)")
        
        # Désactiver tous les lieux
        db.query(Location).update({"is_active": False})
        print("[INFO] Tous les lieux désactivés")
        
        # Activer les lieux par défaut
        default_locations = ["Luxe", "Forge", "Ancien Luxe", "Parking"]
        for location_name in default_locations:
            location = db.query(Location).filter(Location.name == location_name).first()
            if location:
                location.is_active = True
            else:
                new_location = Location(name=location_name, is_active=True)
                db.add(new_location)
        
        # Valider les changements
        db.commit()
        
        return {"message": "Toutes les données de l'application ont été réinitialisées avec succès (utilisateurs et mots de passe conservés)"}
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur lors de la réinitialisation des données: {str(e)}"
        )
