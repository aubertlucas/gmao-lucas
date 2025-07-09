from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Request
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List
import os
import shutil
from uuid import uuid4
from datetime import datetime
import imghdr
import logging

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import get_db
from models import Action, ActionPhoto, User
from schemas import Photo, PhotoCreate
from utils.auth import get_current_active_user

# Define project root and uploads directory for absolute paths
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UPLOADS_DIR = os.path.join(PROJECT_ROOT, "uploads")

router = APIRouter(
    prefix="/photos",
    tags=["photos"],
    responses={404: {"description": "Not found"}},
)

# Configure uploads folder
os.makedirs(UPLOADS_DIR, exist_ok=True)

@router.get("/action/{action_id}", response_model=List[Photo])
async def get_action_photos(
    action_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Get all photos for a specific action
    """
    # Check if action exists
    action = db.query(Action).filter(Action.id == action_id).first()
    if not action:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Action with ID {action_id} not found"
        )
    
    # Get photos
    photos = db.query(ActionPhoto).filter(ActionPhoto.action_id == action_id).all()
    return photos

@router.post("/upload", response_model=Photo, status_code=status.HTTP_201_CREATED)
async def upload_photo(
    action_id: int = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Upload a photo for an action
    """
    # Check if action exists
    action = db.query(Action).filter(Action.id == action_id).first()
    if not action:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Action with ID {action_id} not found"
        )
    
    # Check file type
    content_type = file.content_type
    if not content_type.startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only image files are allowed"
        )
    
    # Generate unique filename
    extension = os.path.splitext(file.filename)[1] if "." in file.filename else ".jpg"
    unique_filename = f"{action_id}_{uuid4().hex}{extension}"
    file_path = os.path.join(UPLOADS_DIR, unique_filename)
    
    # Save file
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    # Get file size
    file_size = os.path.getsize(file_path)
    
    # Create photo record
    photo_data = {
        "action_id": action_id,
        "filename": file.filename,
        "file_path": os.path.join("uploads", "photos", unique_filename),
        "file_size": file_size,
        "mime_type": content_type,
        "uploaded_by": current_user.id
    }
    
    photo = ActionPhoto(**photo_data)
    db.add(photo)
    
    # Update photo count on action
    action.photo_count = action.photo_count + 1
    
    db.commit()
    db.refresh(photo)
    
    return photo

@router.get("/{photo_id}", response_model=Photo)
async def get_photo(
    photo_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Get photo details by ID
    """
    photo = db.query(ActionPhoto).filter(ActionPhoto.id == photo_id).first()
    if not photo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Photo with ID {photo_id} not found"
        )
    
    return photo

@router.get("/{photo_id}/view")
async def view_photo(
    photo_id: int,
    thumbnail: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    View photo file by ID
    """
    photo = db.query(ActionPhoto).filter(ActionPhoto.id == photo_id).first()
    if not photo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Photo with ID {photo_id} not found"
        )
    
    # Get absolute file path
    file_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), photo.file_path)
    
    # Check if file exists
    if not os.path.isfile(file_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Photo file not found"
        )
    
    # In a more advanced implementation, you would resize for thumbnails
    # For this example, we're just returning the file directly
    
    return FileResponse(file_path, media_type=photo.mime_type)

@router.delete("/{photo_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_photo(
    photo_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Delete a photo
    """
    # Get photo
    photo = db.query(ActionPhoto).filter(ActionPhoto.id == photo_id).first()
    if not photo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Photo with ID {photo_id} not found"
        )
    
    # Get absolute file path
    file_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), photo.file_path)
    
    # Delete file if it exists
    if os.path.isfile(file_path):
        os.remove(file_path)
    
    # Get action to update photo count
    action = db.query(Action).filter(Action.id == photo.action_id).first()
    if action:
        action.photo_count = max(0, action.photo_count - 1)
    
    # Delete photo record
    db.delete(photo)
    db.commit()
    
    return {"status": "success"}

@router.get("/media/{file_path:path}")
async def serve_media_file(file_path: str, request: Request):
    """
    Serves a media file from the uploads directory. This route respects CORS dynamically.
    """
    # Security: Prevent path traversal attacks
    safe_base_path = os.path.realpath(UPLOADS_DIR)
    requested_path = os.path.realpath(os.path.join(safe_base_path, file_path))

    if not requested_path.startswith(safe_base_path):
        raise HTTPException(status_code=403, detail="Accès non autorisé au fichier")

    if not os.path.isfile(requested_path):
        raise HTTPException(status_code=404, detail="Fichier non trouvé")

    response = FileResponse(requested_path)

    logging.info(f"--- SERVING MEDIA FILE: {file_path} ---")
    origin = request.headers.get('origin')
    logging.info(f"Request origin header: {origin}")

    # Manually and dynamically add the CORS header for allowed origins
    allowed_origins = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://frsasrvgmao:3000",
    ]
    
    if origin in allowed_origins:
        logging.info(f"Origin '{origin}' is in the allowed list. Adding CORS header.")
        response.headers["Access-Control-Allow-Origin"] = origin
    else:
        logging.info(f"Origin '{origin}' is NOT in the allowed list. No CORS header added.")
        
    logging.info(f"Final response headers: {response.headers}")
    return response
