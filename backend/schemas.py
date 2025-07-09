from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, EmailStr
from datetime import date, datetime
from models import CalendarExceptionType

# User schemas
class UserBase(BaseModel):
    username: str
    email: EmailStr
    role: str = "observer"
    is_active: bool = True

class UserCreate(UserBase):
    password: str

class UserUpdate(BaseModel):
    username: Optional[str] = None
    email: Optional[EmailStr] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None

class User(UserBase):
    id: int
    created_at: datetime

    class Config:
        orm_mode = True

# Location schemas
class LocationBase(BaseModel):
    name: str
    description: Optional[str] = None
    is_active: bool = True

class LocationCreate(LocationBase):
    pass

class LocationUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None

class Location(LocationBase):
    id: int
    created_at: datetime

    class Config:
        orm_mode = True

# Action schemas
class ActionBase(BaseModel):
    number: Optional[int] = None
    title: Optional[str] = ""
    location_id: Optional[int] = None
    description: Optional[str] = None
    comments: Optional[str] = None
    assigned_to: Optional[int] = None
    resource_needs: Optional[str] = None
    budget_initial: Optional[float] = None
    actual_cost: Optional[float] = None
    priority: Optional[int] = 2  # Default medium priority
    estimated_duration: Optional[float] = None
    planned_date: Optional[date] = None
    check_status: str = "NON"
    predicted_end_date: Optional[date] = None
    final_status: str = "NON"
    completion_date: Optional[date] = None
    was_overdue_on_completion: bool = False
    photo_count: int = 0

class ActionCreate(ActionBase):
    pass

class ActionUpdate(BaseModel):
    title: Optional[str] = None
    location_id: Optional[int] = None
    description: Optional[str] = None
    comments: Optional[str] = None
    assigned_to: Optional[int] = None
    resource_needs: Optional[str] = None
    budget_initial: Optional[float] = None
    actual_cost: Optional[float] = None
    priority: Optional[int] = None
    estimated_duration: Optional[float] = None
    planned_date: Optional[date] = None
    check_status: Optional[str] = None
    predicted_end_date: Optional[date] = None
    final_status: Optional[str] = None
    completion_date: Optional[date] = None
    was_overdue_on_completion: Optional[bool] = None

class ActionPatch(BaseModel):
    field: str
    value: str

class Action(ActionBase):
    id: int
    photo_count: int = 0
    created_at: datetime
    updated_at: datetime
    location: Optional[Location] = None
    assigned_user: Optional[User] = None

    class Config:
        orm_mode = True

# Photo schemas
class PhotoBase(BaseModel):
    action_id: int
    filename: str
    file_path: str
    thumbnail_path: Optional[str] = None  # Chemin vers la miniature
    file_size: Optional[int] = None
    mime_type: Optional[str] = None

class PhotoCreate(PhotoBase):
    uploaded_by: int

class Photo(PhotoBase):
    id: int
    upload_date: datetime
    uploader: Optional[User] = None
    url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    original_filename: Optional[str] = None

    class Config:
        orm_mode = True

# Work Calendar schemas (anciens - conservés pour compatibilité)
class WorkCalendarBase(BaseModel):
    user_id: int
    day_of_week: int
    start_time: Optional[str] = "08:00"
    end_time: Optional[str] = "17:00"
    break_duration: int = 60
    hours_per_day: float = 8.0
    is_working_day: bool = True

class WorkCalendarCreate(WorkCalendarBase):
    pass

class WorkCalendarUpdate(BaseModel):
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    break_duration: Optional[int] = None
    hours_per_day: Optional[float] = None
    is_working_day: Optional[bool] = None

class WorkCalendar(WorkCalendarBase):
    id: int

    class Config:
        orm_mode = True
        
# Nouveaux schémas pour les horaires de travail
class WorkScheduleBase(BaseModel):
    user_id: int
    day_of_week: int
    working_hours: float = 8.0
    is_working_day: bool = True

class WorkScheduleCreate(WorkScheduleBase):
    pass

class WorkScheduleUpdate(BaseModel):
    working_hours: Optional[float] = None
    is_working_day: Optional[bool] = None

class WorkSchedule(WorkScheduleBase):
    id: int

    class Config:
        orm_mode = True
        
# Schémas pour les exceptions de calendrier
class CalendarExceptionBase(BaseModel):
    user_id: int
    exception_date: date
    exception_type: CalendarExceptionType
    description: Optional[str] = None
    working_hours: float = 0.0

class CalendarExceptionCreate(CalendarExceptionBase):
    pass

class CalendarExceptionUpdate(BaseModel):
    exception_type: Optional[CalendarExceptionType] = None
    description: Optional[str] = None
    working_hours: Optional[float] = None

class CalendarException(CalendarExceptionBase):
    id: int

    class Config:
        orm_mode = True

# Authentication schemas
class Token(BaseModel):
    access_token: str
    token_type: str
    user: User

class TokenData(BaseModel):
    username: Optional[str] = None

# Configuration schemas
class PilotSchedule(BaseModel):
    days: float = 5.0
    hours: float = 8.0

class Configuration(BaseModel):
    photosFolder: str = "uploads/photos"
    lieux: List[str] = []
    pilotes: List[str] = []
    schedules: dict[str, PilotSchedule] = {}

# Dashboard schemas
class DashboardStats(BaseModel):
    total_actions: int
    completed_actions: int
    in_progress_actions: int
    overdue_actions: int
    actions_by_priority: dict
    actions_by_location: dict
    total_budget_initial: Optional[float] = 0
    total_actual_cost: Optional[float] = 0
    priority_high: Optional[int] = 0
    priority_medium: Optional[int] = 0
    priority_low: int = 0
    priority_tbd: Optional[int] = 0
    location_data: dict = {}
    recent_actions: List[dict] = []
    # Statistiques de performance
    completed_on_time: int = 0
    completed_overdue: int = 0
    in_progress_on_time: int = 0
    in_progress_overdue: int = 0
    performance_percentage: int = 0
    
class DashboardAlert(BaseModel):
    id: int
    number: int
    title: str
    priority: int
    planned_date: Optional[date]
    days_remaining: int

    class Config:
        orm_mode = True

# Admin Schemas
class StorageInfo(BaseModel):
    total_disk_space: int
    used_disk_space: int
    free_disk_space: int
    uploads_folder_size: int
    uploads_percentage_of_disk: float

class ImageCompressionPreview(BaseModel):
    original_size: int
    compressed_size: int
    compressed_image_data_url: str

class ImageCompressionPreviewRequest(BaseModel):
    file_path: str
    quality: int

class ImageCompressionResult(BaseModel):
    processed_files: int
    total_size_before: int
    total_size_after: int
    space_saved: int
    errors: List[str]
