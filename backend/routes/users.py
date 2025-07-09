from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from database import get_db
from models import User, UserRole, WorkSchedule
from utils.auth import get_current_user, get_password_hash

router = APIRouter()

# Schémas Pydantic
class UserBase(BaseModel):
    username: str
    email: str
    role: str = "observer"

class UserCreate(UserBase):
    password: str

class UserUpdate(BaseModel):
    username: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None

class ScheduleUpdate(BaseModel):
    days: Optional[float] = None
    hours: Optional[float] = None

class UserMetadataUpdate(BaseModel):
    schedule: Optional[ScheduleUpdate] = None

class UserResponse(UserBase):
    id: int
    is_active: bool
    
    class Config:
        orm_mode = True

# Routes API
@router.get("/", response_model=List[UserResponse])
async def get_users(
    role: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Récupère la liste des utilisateurs.
    Si un rôle est spécifié, filtre les utilisateurs par ce rôle.
    Accessible uniquement par les admins et managers.
    """
    # Vérifier que l'utilisateur courant est admin ou manager
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Opération non autorisée"
        )
    
    query = db.query(User)
    if role:
        query = query.filter(User.role == role)
        
    return query.all()


@router.get("/assignable", response_model=List[UserResponse])
async def get_assignable_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Récupère la liste de tous les utilisateurs actifs pouvant être assignés à des tâches.
    Cette route est accessible à tous les utilisateurs authentifiés.
    """
    # Tous les utilisateurs authentifiés peuvent accéder à cette liste
    query = db.query(User).filter(User.is_active == True)
    
    users = query.all()
    print(f"[INFO] Liste des utilisateurs assignables récupérée par {current_user.username} (ID: {current_user.id}): {len(users)} utilisateurs trouvés")
    
    return users

@router.post("/", response_model=UserResponse)
async def create_user(
    user: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Crée un nouvel utilisateur.
    Seuls les administrateurs et managers peuvent créer des utilisateurs.
    """
    # Vérifier que l'utilisateur courant est admin ou manager
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Opération non autorisée"
        )
    
    # Vérifier que le nom d'utilisateur et l'email n'existent pas déjà
    if db.query(User).filter(User.username == user.username).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Le nom d'utilisateur '{user.username}' existe déjà"
        )
    
    if db.query(User).filter(User.email == user.email).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"L'email '{user.email}' existe déjà"
        )
    
    # Créer l'utilisateur
    new_user = User(
        username=user.username,
        email=user.email,
        password_hash=get_password_hash(user.password),
        role=user.role
    )
    
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    # Créer un planning de travail par défaut pour l'utilisateur
    default_days = 5.0 if user.role != "admin" else 0.0
    default_hours = 8.0 if user.role != "admin" else 0.0
    
    # Ajouter des entrées pour chaque jour de la semaine (0-6, lundi-dimanche)
    for day in range(7):
        # Par défaut, weekend non travaillé
        is_working_day = day < 5  # Lundi-Vendredi sont travaillés
        hours = default_hours if is_working_day else 0.0
        
        work_schedule = WorkSchedule(
            user_id=new_user.id,
            day_of_week=day,
            working_hours=hours,
            is_working_day=is_working_day
        )
        db.add(work_schedule)
    
    db.commit()
    
    return new_user

@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Récupère les informations d'un utilisateur par son ID.
    Seuls les administrateurs, managers ou l'utilisateur lui-même peuvent accéder à ces informations.
    """
    # Vérifier que l'utilisateur courant est admin, manager ou lui-même
    if current_user.role not in ["admin", "manager"] and current_user.id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Opération non autorisée"
        )
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Utilisateur avec l'ID {user_id} non trouvé"
        )
    
    return user

@router.put("/{user_id}/deactivate", response_model=UserResponse)
async def deactivate_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Désactive un compte utilisateur.
    Seuls les administrateurs et managers peuvent désactiver des comptes.
    """
    # Vérifier que l'utilisateur courant est admin ou manager
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Opération non autorisée"
        )
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Utilisateur avec l'ID {user_id} non trouvé"
        )
    
    # Empêcher la désactivation du dernier administrateur
    if user.role == "admin" and db.query(User).filter(User.role == "admin", User.is_active == True).count() <= 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Impossible de désactiver le dernier administrateur"
        )
    
    user.is_active = False
    db.commit()
    db.refresh(user)
    
    return user

@router.put("/{user_id}/metadata", response_model=UserResponse)
async def update_user_metadata(
    user_id: int,
    metadata: UserMetadataUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Met à jour les métadonnées d'un utilisateur (planning, etc.)
    Seuls les administrateurs, managers ou l'utilisateur lui-même peuvent mettre à jour ces informations.
    """
    # Vérifier que l'utilisateur courant est admin, manager ou lui-même
    if current_user.role not in ["admin", "manager"] and current_user.id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Opération non autorisée"
        )
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Utilisateur avec l'ID {user_id} non trouvé"
        )
    
    # Mise à jour du planning si fourni
    if metadata.schedule:
        # Mettre à jour tous les jours de la semaine avec les mêmes valeurs
        schedules = db.query(WorkSchedule).filter(
            WorkSchedule.user_id == user_id,
            WorkSchedule.is_working_day == True
        ).all()
        
        for schedule in schedules:
            if metadata.schedule.days is not None:
                # Pas d'action car days n'est pas stocké par jour
                pass
                
            if metadata.schedule.hours is not None:
                schedule.working_hours = metadata.schedule.hours
        
        db.commit()
    
    return user

@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Supprime définitivement un utilisateur.
    Seuls les administrateurs peuvent supprimer des utilisateurs.
    """
    # Vérifier que l'utilisateur courant est admin
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Seuls les administrateurs peuvent supprimer des utilisateurs"
        )
    
    # Vérifier qu'on ne tente pas de supprimer le dernier admin
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Utilisateur avec l'ID {user_id} non trouvé"
        )
    
    if user.role == "admin" and db.query(User).filter(User.role == "admin", User.is_active == True).count() <= 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Impossible de supprimer le dernier administrateur"
        )
    
    # Supprimer les plannings associés à l'utilisateur
    db.query(WorkSchedule).filter(WorkSchedule.user_id == user_id).delete()
    
    # Supprimer l'utilisateur
    db.delete(user)
    db.commit()
    
    print(f"[INFO] Utilisateur {user.username} (ID: {user_id}) supprimé par l'admin {current_user.username}")
    return None
