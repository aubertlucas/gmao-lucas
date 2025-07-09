from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Dict, Any
from datetime import datetime

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import get_db
from models import CalendarException
from fastapi.responses import HTMLResponse

router = APIRouter(
    prefix="/db-viewer",
    tags=["db-viewer"],
    responses={404: {"description": "Not found"}},
)

async def get_all_calendar_exceptions(db: Session) -> List[Dict[str, Any]]:
    """
    Récupère toutes les exceptions de calendrier dans la base de données
    """
    exceptions = db.query(CalendarException).all()
    
    # Conversion en dictionnaire pour le rendu HTML
    result = []
    for exc in exceptions:
        result.append({
            "id": exc.id,
            "user_id": exc.user_id,
            "exception_date": exc.exception_date.strftime("%Y-%m-%d"),
            "type": exc.exception_type.value,
            "description": exc.description or ""
        })
    
    return result

@router.get("/exceptions", response_class=HTMLResponse)
async def db_viewer_exceptions(db: Session = Depends(get_db)):
    """
    Affiche toutes les exceptions de calendrier dans une interface HTML
    """
    exceptions = await get_all_calendar_exceptions(db)
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>DB Viewer - Calendar Exceptions</title>
        <meta http-equiv="refresh" content="5"> <!-- Auto-refresh every 5 seconds -->
        <meta charset="UTF-8">
        <style>
            body {{ font-family: Arial; padding: 20px; }}
            table {{ border-collapse: collapse; width: 100%; }}
            th, td {{ border: 1px solid #ddd; padding: 8px; text-align: left; }}
            tr:nth-child(even) {{ background-color: #f2f2f2; }}
            th {{ background-color: #4CAF50; color: white; }}
            .header {{ display: flex; justify-content: space-between; align-items: center; }}
            .refresh-info {{ font-size: 0.8em; color: #666; }}
        </style>
    </head>
    <body>
        <div class="header">
            <h2>Calendar Exceptions</h2>
            <span class="refresh-info">Actualisation automatique toutes les 5 secondes</span>
        </div>
        
        <p>Nombre total d'exceptions: {len(exceptions)}</p>
        
        <table>
            <tr>
                <th>ID</th>
                <th>User ID</th>
                <th>Date</th>
                <th>Type</th>
                <th>Description</th>
            </tr>
            {"".join([f"<tr><td>{e['id']}</td><td>{e['user_id']}</td><td>{e['exception_date']}</td><td>{e['type']}</td><td>{e['description']}</td></tr>" for e in exceptions])}
        </table>
        <p class="refresh-info">Dernière mise à jour: {datetime.now().strftime("%H:%M:%S")}</p>
    </body>
    </html>
    """
    return html_content
