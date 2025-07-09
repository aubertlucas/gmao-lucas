# Guide de Déploiement (Debian / Linux)

Ce guide explique comment déployer et lancer l'application GMAO sur un serveur **Debian 11 (ou plus récent)**. Le processus est largement automatisé via des scripts shell.

## 1. Prérequis

-   Un serveur sous **Debian 11 (Bullseye)** ou une distribution dérivée (comme Ubuntu).
-   Un accès `sudo` pour installer les paquets nécessaires.
-   `git` installé pour cloner le projet (`sudo apt install git`).
-   Une connexion internet est requise pour l'installation initiale.

## 2. Installation (Automatisée)

1.  **Récupérez le projet** : Connectez-vous au serveur et clonez le dépôt (ou copiez les fichiers).
    ```bash
    git clone https://github.com/aubertlucas/gmao-lucas
    cd gmao-lucas
    ```

2.  **Rendez le script exécutable** :
    ```bash
    chmod +x setup.sh
    ```

3.  **Lancez l'installation** :
    ```bash
    ./setup.sh
    ```

### Comment fonctionne `setup.sh` ?

Le script va réaliser les actions suivantes :
1.  **Mise à jour des paquets** : Exécute `sudo apt update`.
2.  **Installation de Python** : Installe `python3`, `python3-pip`, et `python3-venv` si absents.
3.  **Configuration de l'environnement** :
    -   Crée un environnement virtuel Python (`.venv`).
    -   Installe toutes les librairies Python nécessaires depuis `requirements.txt`.
    -   Crée le fichier de configuration `.env` à partir de `.env.example` s'il existe.

## 3. Lancement de l'application

Une fois l'installation terminée, vous pouvez démarrer les serveurs.

1.  **Rendez le script de lancement exécutable** :
    ```bash
    chmod +x start_production.sh
    ```
2.  **Démarrez les serveurs** :
    ```bash
    ./start_production.sh
    ```

L'application sera alors accessible localement à [http://localhost:3000](http://localhost:3000) et à distance via **`http://<IP_DU_SERVEUR>:3000`**.

-   **Identifiant par défaut** : `admin`
-   **Mot de passe par défaut** : `admin`

## 4. Configuration du Pare-feu

Sur un serveur de production, vous devez autoriser le trafic sur le port de l'application. Si vous utilisez `ufw` (Uncomplicated Firewall), la commande est :

```bash
sudo ufw allow 3000/tcp
sudo ufw enable
sudo ufw status
```

## 5. Sécurité : Configurer la Clé Secrète

Pour une utilisation en production, il est **crucial** de définir une clé secrète unique.

1.  **Générez une clé** :
    ```bash
    python3 -c "import secrets; print(secrets.token_hex(32))"
    ```
2.  **Copiez la longue chaîne de caractères** affichée.
3.  **Ouvrez le fichier `.env`** (`nano .env`).
4.  **Collez votre nouvelle clé** à la ligne `SECRET_KEY=...`.

## 6. Arrêt de l'application

Pour arrêter les serveurs, retournez au terminal où vous avez lancé `start_production.sh` et appuyez sur **`Ctrl + C`**.

*(Pour un déploiement plus robuste, considérez de faire tourner l'application en tant que service `systemd`. Voir la documentation avancée ou les tutoriels en ligne pour la mise en place).*
