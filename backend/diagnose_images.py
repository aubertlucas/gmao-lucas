"""
Script de diagnostic pour les problèmes d'affichage d'images
"""
import os
import sys
import json
from PIL import Image

def check_file_permissions(file_path):
    """Vérifier les permissions d'un fichier"""
    readable = os.access(file_path, os.R_OK)
    writable = os.access(file_path, os.W_OK)
    return {
        "path": file_path,
        "exists": os.path.exists(file_path),
        "is_file": os.path.isfile(file_path) if os.path.exists(file_path) else False,
        "readable": readable,
        "writable": writable,
        "size": os.path.getsize(file_path) if os.path.exists(file_path) else 0
    }

def main():
    """Diagnostic principal des problèmes d'images"""
    # Chemins importants
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    uploads_dir = os.path.join(backend_dir, "uploads")
    photos_dir = os.path.join(uploads_dir, "photos")
    thumbs_dir = os.path.join(uploads_dir, "thumbs")
    
    print("======= DIAGNOSTIC DES IMAGES =======")
    print(f"Dossier backend: {backend_dir}")
    print(f"Dossier uploads: {uploads_dir} (existe: {os.path.exists(uploads_dir)})")
    print(f"Dossier photos: {photos_dir} (existe: {os.path.exists(photos_dir)})")
    print(f"Dossier miniatures: {thumbs_dir} (existe: {os.path.exists(thumbs_dir)})")
    
    # Vérifier la base de données pour les chemins d'images
    print("\n--- VÉRIFICATION DES CHEMINS EN BASE DE DONNÉES ---")
    try:
        # Import ici pour éviter les erreurs d'import circulaires
        sys.path.append(backend_dir)
        from database import engine, get_db
        from models import ActionPhoto
        from sqlalchemy.orm import Session
        
        # Créer une session de base de données
        db = Session(engine)
        
        # Récupérer toutes les photos
        photos = db.query(ActionPhoto).all()
        print(f"Nombre de photos en base de données: {len(photos)}")
        
        for i, photo in enumerate(photos):
            print(f"\nPhoto #{i+1}: {photo.filename}")
            print(f"  ID: {photo.id}")
            print(f"  Action ID: {photo.action_id}")
            print(f"  Chemin du fichier: {photo.file_path}")
            print(f"  Chemin de la miniature: {photo.thumbnail_path}")
            
            # Vérifier le fichier original
            original_path = os.path.join(backend_dir, photo.file_path)
            print("\n  VÉRIFICATION DU FICHIER ORIGINAL:")
            original_check = check_file_permissions(original_path)
            for key, value in original_check.items():
                print(f"    {key}: {value}")
            
            # Vérifier le fichier de miniature
            if photo.thumbnail_path:
                thumb_path = os.path.join(backend_dir, photo.thumbnail_path)
                print("\n  VÉRIFICATION DE LA MINIATURE:")
                thumb_check = check_file_permissions(thumb_path)
                for key, value in thumb_check.items():
                    print(f"    {key}: {value}")
            else:
                print("\n  PAS DE CHEMIN DE MINIATURE DÉFINI")
                
            # Si le fichier original existe, essayer de le lire
            if os.path.exists(original_path) and os.path.isfile(original_path):
                try:
                    img = Image.open(original_path)
                    print(f"  Format d'image: {img.format}")
                    print(f"  Taille: {img.width}x{img.height}")
                    
                    # Créer une miniature et la sauvegarder pour le test
                    action_id = photo.action_id
                    thumb_dir = os.path.join(thumbs_dir, str(action_id))
                    os.makedirs(thumb_dir, exist_ok=True)
                    
                    filename = os.path.basename(original_path)
                    test_thumb_path = os.path.join(thumb_dir, filename)
                    
                    # Générer une miniature de test
                    img.thumbnail((200, 200))
                    img.save(test_thumb_path)
                    print(f"  Miniature de test créée: {test_thumb_path} (existe: {os.path.exists(test_thumb_path)})")
                    
                    # Mettre à jour le chemin dans la base de données
                    thumb_rel_path = os.path.join("uploads", "thumbs", str(action_id), filename)
                    thumb_rel_path = thumb_rel_path.replace("\\", "/")  # Normaliser pour les URL
                    
                    if photo.thumbnail_path != thumb_rel_path:
                        photo.thumbnail_path = thumb_rel_path
                        db.commit()
                        print(f"  Chemin de miniature mis à jour dans la BDD: {thumb_rel_path}")
                    
                except Exception as e:
                    print(f"  ERREUR lors du traitement de l'image: {e}")
            
        # Fermer la session
        db.close()
        
    except Exception as e:
        print(f"ERREUR lors de l'accès à la base de données: {e}")
    
    # Chercher toutes les images dans le dossier uploads
    print("\n--- RECHERCHE DE TOUS LES FICHIERS IMAGES ---")
    image_files = []
    for root, dirs, files in os.walk(uploads_dir):
        for file in files:
            if file.lower().endswith(('.jpg', '.jpeg', '.png', '.gif')):
                full_path = os.path.join(root, file)
                rel_path = os.path.relpath(full_path, backend_dir)
                image_files.append({
                    "filename": file,
                    "full_path": full_path,
                    "rel_path": rel_path,
                    "size": os.path.getsize(full_path) if os.path.exists(full_path) else 0
                })
    
    print(f"Nombre total de fichiers images trouvés: {len(image_files)}")
    for i, img in enumerate(image_files):
        print(f"\nImage #{i+1}: {img['filename']}")
        print(f"  Chemin complet: {img['full_path']}")
        print(f"  Chemin relatif: {img['rel_path']}")
        print(f"  Taille: {img['size']} octets")
    
    print("\n--- CONCLUSION ---")
    print("Si les images existent sur le disque mais ne s'affichent pas dans le navigateur,")
    print("le problème est probablement lié à l'un des éléments suivants:")
    print("1. Les chemins en base de données ne correspondent pas aux fichiers réels")
    print("2. Les fichiers n'ont pas les bonnes permissions de lecture")
    print("3. Le serveur FastAPI n'est pas configuré correctement pour servir les fichiers statiques")
    print("4. Il y a un problème de CORS lors de l'accès aux images depuis le frontend")
    
    # Générer une page HTML de test
    print("\n--- CRÉATION D'UNE PAGE HTML DE TEST ---")
    html_content = """<!DOCTYPE html>
<html>
<head>
    <title>Test d'images GMAO</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .image-test { border: 1px solid #ddd; padding: 10px; margin-bottom: 10px; }
        img { max-width: 300px; max-height: 300px; }
        .error { color: red; }
    </style>
</head>
<body>
    <h1>Test d'affichage des images GMAO</h1>
    <div id="images-container">
    """
    
    # Ajouter chaque image à la page HTML
    for i, img in enumerate(image_files):
        rel_url = img['rel_path'].replace('\\', '/')
        html_content += f"""
        <div class="image-test">
            <h3>Image #{i+1}: {img['filename']}</h3>
            <p>Chemin relatif: {rel_url}</p>
            <p>Taille: {img['size']} octets</p>
            <div>
                <h4>Test d'affichage:</h4>
                <img src="/{rel_url}" alt="{img['filename']}" 
                     onerror="this.onerror=null; this.alt='Erreur de chargement'; this.parentNode.innerHTML += '<p class=\\'error\\'>Erreur: L\\'image ne peut pas être chargée</p>';">
            </div>
        </div>
        """
    
    html_content += """
    </div>
</body>
</html>
    """
    
    # Enregistrer la page HTML
    test_html_path = os.path.join(backend_dir, "test_images.html")
    with open(test_html_path, "w") as f:
        f.write(html_content)
    
    print(f"Page HTML de test créée: {test_html_path}")
    print("Ouvrez cette page dans votre navigateur via le serveur FastAPI pour tester les images")

if __name__ == "__main__":
    main()
