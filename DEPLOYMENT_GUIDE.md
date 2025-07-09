# Guide de Déploiement (Windows)

Ce guide explique comment déployer et lancer l'application GMAO sur un nouveau PC Windows. Le processus est largement automatisé.

## 1. Prérequis

-   Un PC sous **Windows 10 ou 11**.
-   Une connexion internet est nécessaire **uniquement** lors de la toute première installation pour télécharger les dépendances.

## 2. Installation (Automatisée)

1.  **Récupérez le projet** : Copiez le dossier complet de l'application sur le PC.
2.  **Lancez l'installation** : Naviguez dans le dossier et double-cliquez sur `setup.bat`.

    ```bash
    setup.bat
    ```

### Comment fonctionne le script ?

Le script va vous guider à travers plusieurs étapes :

1.  **Vérification de Python** : Il cherche une version compatible (3.10 ou plus récent).
    -   Si Python n'est pas trouvé ou si la version est trop ancienne, le script vous proposera de le télécharger et de l'installer automatiquement.
    -   Si Python est installé par le script, vous devrez **fermer la fenêtre et relancer `setup.bat`** pour continuer.

2.  **Configuration de l'environnement** :
    -   Création d'un environnement virtuel Python (`.venv`) pour isoler l'application.
    -   Installation de toutes les librairies nécessaires.
    -   Téléchargement des dépendances frontend pour un fonctionnement 100% hors ligne.
    -   Création du fichier de configuration `.env`.

## 3. Lancement de l'application

Une fois l'installation terminée, double-cliquez sur `start_production.bat` pour démarrer les serveurs.

```bash
start_production.bat
```

L'application sera alors accessible à [http://localhost:3000](http://localhost:3000).

-   **Identifiant par défaut** : `admin`
-   **Mot de passe par défaut** : `admin`

## 4. Sécurité : Configurer la Clé Secrète

Pour une utilisation en production, il est **crucial** de définir une clé secrète unique pour la sécurité des sessions utilisateur.

1.  **Générez une clé** en ouvrant une invite de commande et en exécutant :
    ```bash
    python -c "import secrets; print(secrets.token_hex(32))"
    ```
2.  **Copiez la longue chaîne de caractères** affichée.
3.  **Ouvrez le fichier `.env`** à la racine du projet.
4.  **Collez votre nouvelle clé** à la ligne `SECRET_KEY=...`.

## 5. Arrêt de l'application

Pour arrêter les serveurs, retournez à la fenêtre de l'invite de commande où vous avez lancé `start_production.bat` et appuyez sur **`Ctrl + C`**. 