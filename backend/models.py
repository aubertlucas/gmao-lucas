from sqlalchemy import Boolean, Column, DateTime, Enum, ForeignKey, Integer, String, Text, Float, Date, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from datetime import date, timedelta

from database import Base

class UserRole(enum.Enum):
    admin = "admin"
    manager = "manager"
    pilot = "pilot"
    observer = "observer"
    
class CalendarExceptionType(enum.Enum):
    HOLIDAY = "holiday"       # Jour férié
    VACATION = "vacation"     # Congés
    SICK = "sick"             # Maladie
    TRAINING = "training"     # Formation
    OTHER = "other"           # Autre

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False)
    email = Column(String(100), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String, default="observer")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    
    # Relationships
    actions = relationship("Action", back_populates="assigned_user", foreign_keys="Action.assigned_to")
    photos = relationship("ActionPhoto", back_populates="uploader", foreign_keys="ActionPhoto.uploaded_by")
    work_schedules = relationship("WorkSchedule", back_populates="user", cascade="all, delete-orphan")
    calendar_exceptions = relationship("CalendarException", back_populates="user", cascade="all, delete-orphan")
    
    # Pour la compatibilité avec le code existant, nous maintenons temporairement cette relation
    work_calendars = relationship("WorkCalendar", back_populates="user")

class Action(Base):
    __tablename__ = "actions"

    id = Column(Integer, primary_key=True, index=True)
    number = Column(Integer, unique=True, nullable=False)
    title = Column(String(200))
    location_id = Column(Integer, ForeignKey("locations.id"))
    description = Column(Text)
    comments = Column(Text)
    assigned_to = Column(Integer, ForeignKey("users.id"))
    resource_needs = Column(Text)
    budget_initial = Column(Float)
    actual_cost = Column(Float)
    priority = Column(Integer)  # 1=High, 2=Medium, 3=Low
    estimated_duration = Column(Float)  # In hours
    planned_date = Column(Date)
    check_status = Column(String(10), default="NON")  # NON, OK
    predicted_end_date = Column(Date)
    final_status = Column(String(10), default="NON")  # NON, OK
    completion_date = Column(Date)
    was_overdue_on_completion = Column(Boolean, default=False)  # Track si l'action était en retard lors de la complétion
    photo_count = Column(Integer, default=0)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    location = relationship("Location", back_populates="actions")
    assigned_user = relationship("User", back_populates="actions", foreign_keys=[assigned_to])
    photos = relationship("ActionPhoto", back_populates="action", cascade="all, delete-orphan")

class ActionPhoto(Base):
    __tablename__ = "action_photos"

    id = Column(Integer, primary_key=True, index=True)
    action_id = Column(Integer, ForeignKey("actions.id", ondelete="CASCADE"), nullable=False)
    filename = Column(String(255), nullable=False)
    file_path = Column(String(500), nullable=False)
    thumbnail_path = Column(String(500))  # Chemin vers la miniature
    file_size = Column(Integer)
    mime_type = Column(String(50))
    file_hash = Column(String(255))  # Hash SHA-256 du contenu du fichier pour détecter les doublons
    upload_date = Column(DateTime, server_default=func.now())
    uploaded_by = Column(Integer, ForeignKey("users.id"))
    
    # Relationships
    action = relationship("Action", back_populates="photos")
    uploader = relationship("User", back_populates="photos")
    
    def to_dict(self):
        """Convertit l'objet en dictionnaire pour la sérialisation JSON"""
        # Extraire le nom de fichier du chemin complet
        if '/' in self.filename:
            filename = self.filename.split('/')[-1]
        elif '\\' in self.filename:
            filename = self.filename.split('\\')[-1]
        else:
            filename = self.filename
            
        # Construire les URLs complètes
        base_url = "http://frsasrvgmao:8000"  # TODO: rendre configurable via settings
        file_url = f"{base_url}/uploads/photos/{self.action_id}/{filename}"
        thumb_url = f"{base_url}/uploads/thumbs/{self.action_id}/{filename}" if self.thumbnail_path else None
        
        return {
            "id": self.id,
            "action_id": self.action_id,
            "filename": filename,  # Nom du fichier sans le chemin
            "file_path": self.file_path,
            "thumbnail_path": self.thumbnail_path,
            "file_size": self.file_size,
            "mime_type": self.mime_type,
            "file_hash": self.file_hash,
            "upload_date": self.upload_date.isoformat() if self.upload_date else None,
            "uploaded_by": self.uploaded_by,
            "url": file_url,  # URL complète
            "thumbnail_url": thumb_url,  # URL complète
            "uploader": self.uploader.username if self.uploader else None  # Ajouter le nom de l'utilisateur
        }

class Location(Base):
    __tablename__ = "locations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)
    description = Column(Text)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    
    # Relationships
    actions = relationship("Action", back_populates="location")

class WorkCalendar(Base):
    __tablename__ = "work_calendars"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    day_of_week = Column(Integer)  # 0=Monday, 6=Sunday
    start_time = Column(String(5))  # Format: "08:00"
    end_time = Column(String(5))    # Format: "17:00"
    break_duration = Column(Integer, default=60)  # In minutes
    hours_per_day = Column(Float)
    is_working_day = Column(Boolean, default=True)
    
    # Relationships
    user = relationship("User", back_populates="work_calendars")

    __table_args__ = (
        # Ensure each user has only one entry per day of week
        UniqueConstraint('user_id', 'day_of_week', name='unique_user_day'),
    )
    
class WorkSchedule(Base):
    __tablename__ = "work_schedules"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    day_of_week = Column(Integer)  # 0=Lundi, 6=Dimanche
    working_hours = Column(Float, default=0.0)  # Nombre d'heures travaillées ce jour
    is_working_day = Column(Boolean, default=True)
    
    # Relations
    user = relationship("User", back_populates="work_schedules")

    __table_args__ = (
        UniqueConstraint('user_id', 'day_of_week', name='unique_user_schedule_day'),
    )
    
class CalendarException(Base):
    __tablename__ = "calendar_exceptions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    exception_date = Column(Date, nullable=False)
    exception_type = Column(Enum(CalendarExceptionType))
    description = Column(String(255))
    working_hours = Column(Float, default=0.0)  # Pour les jours partiellement travaillés
    
    # Relations
    user = relationship("User", back_populates="calendar_exceptions")

    __table_args__ = (
        UniqueConstraint('user_id', 'exception_date', name='unique_user_exception_date'),
    )
