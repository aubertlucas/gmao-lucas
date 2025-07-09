from PIL import Image
import os

def compress_image(image_path: str, quality: int = 85):
    """
    Compresse une image JPEG/PNG.
    
    Args:
        image_path (str): Le chemin vers l'image à compresser.
        quality (int): La qualité de compression pour les JPEGs (1-95).
    """
    try:
        if not os.path.exists(image_path):
            print(f"[COMPRESSION] Erreur: Fichier non trouvé - {image_path}")
            return

        original_size = os.path.getsize(image_path)
        
        with Image.open(image_path) as img:
            # Conserver le format original
            img_format = img.format

            print(f"[COMPRESSION] Début pour: {os.path.basename(image_path)} ({original_size / 1024:.2f} KB)")
            
            # Appliquer la compression
            if img.mode in ("RGBA", "P"):
                 # Pour les images avec transparence, on les convertit en RGB
                img = img.convert("RGB")

            img.save(image_path, format='JPEG', quality=quality, optimize=True)

        compressed_size = os.path.getsize(image_path)
        reduction_percent = (1 - compressed_size / original_size) * 100

        print(f"[COMPRESSION] Terminé. Nouvelle taille: {compressed_size / 1024:.2f} KB. "
              f"Réduction de {reduction_percent:.2f}%.")

    except Exception as e:
        print(f"[COMPRESSION] Erreur lors de la compression de {image_path}: {e}") 