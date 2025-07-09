#!/bin/bash

# Script de démarrage pour l'application GMAO en mode production
# Version Linux/Debian

set -e  # Arrêt en cas d'erreur

# Couleurs pour l'affichage
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Fonctions utilitaires
print_error() {
    echo -e "${RED}[ERREUR]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCÈS]${NC} $1"
}

print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[AVERTISSEMENT]${NC} $1"
}

print_header() {
    echo -e "${CYAN}"
    echo "======================================================="
    echo "==       Démarrage GMAO - Mode Production           =="
    echo "======================================================="
    echo -e "${NC}"
}

# Se placer dans le répertoire du script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

print_header

# Vérification de l'environnement virtuel
if [[ ! -d ".venv" ]]; then
    print_error "L'environnement virtuel .venv n'a pas été trouvé."
    echo
    print_info "Veuillez d'abord lancer setup_debian.sh pour installer l'application."
    echo
    echo "Commandes d'installation :"
    echo "  chmod +x setup_debian.sh"
    echo "  ./setup_debian.sh"
    echo
    read -p "Appuyez sur Entrée pour continuer..."
    exit 1
fi

# Vérification de l'activation script
if [[ ! -f ".venv/bin/activate" ]]; then
    print_error "Script d'activation de l'environnement virtuel non trouvé."
    print_info "L'environnement virtuel semble corrompu."
    echo
    print_info "Solutions :"
    echo "  1. Supprimer .venv : rm -rf .venv"
    echo "  2. Relancer l'installation : ./setup_debian.sh"
    echo
    read -p "Appuyez sur Entrée pour continuer..."
    exit 1
fi

print_info "Activation de l'environnement virtuel..."

# Activation de l'environnement virtuel
if source .venv/bin/activate; then
    print_success "Environnement virtuel activé."
else
    print_error "Échec de l'activation de l'environnement virtuel."
    exit 1
fi

echo

# Vérification que Python fonctionne dans l'environnement
if ! python --version &>/dev/null; then
    print_error "Python n'est pas accessible dans l'environnement virtuel."
    exit 1
fi

# Vérification du fichier start_production.py
if [[ ! -f "start_production.py" ]]; then
    print_warning "Le fichier start_production.py n'a pas été trouvé."
    echo
    print_info "Recherche de fichiers de démarrage alternatifs..."
    
    # Recherche de fichiers alternatifs
    if [[ -f "app.py" ]]; then
        print_info "Fichier app.py trouvé. Tentative de démarrage avec FastAPI/Uvicorn..."
        STARTUP_FILE="app.py"
        STARTUP_MODE="fastapi"
    elif [[ -f "main.py" ]]; then
        print_info "Fichier main.py trouvé. Démarrage avec Python standard..."
        STARTUP_FILE="main.py"
        STARTUP_MODE="python"
    elif [[ -f "run.py" ]]; then
        print_info "Fichier run.py trouvé. Démarrage avec Python standard..."
        STARTUP_FILE="run.py"
        STARTUP_MODE="python"
    else
        print_error "Aucun fichier de démarrage trouvé."
        echo
        print_info "Fichiers de démarrage supportés :"
        echo "  - start_production.py (recommandé)"
        echo "  - app.py (FastAPI)"
        echo "  - main.py"
        echo "  - run.py"
        echo
        exit 1
    fi
else
    STARTUP_FILE="start_production.py"
    STARTUP_MODE="production"
fi

print_success "Lancement de l'application GMAO en mode production..."
echo

# Configuration des URLs par défaut
FRONTEND_HOST=${FRONTEND_HOST:-"localhost"}
FRONTEND_PORT=${FRONTEND_PORT:-"3000"}
BACKEND_HOST=${BACKEND_HOST:-"localhost"}
BACKEND_PORT=${BACKEND_PORT:-"8000"}

# Affichage des informations de connexion
echo -e "${CYAN}Informations de connexion :${NC}"
echo -e "  ${GREEN}Frontend${NC} : http://${FRONTEND_HOST}:${FRONTEND_PORT}"
echo -e "  ${GREEN}Backend${NC}  : http://${BACKEND_HOST}:${BACKEND_PORT}"

# URLs supplémentaires pour FastAPI
if [[ "$STARTUP_MODE" == "fastapi" ]] || [[ "$STARTUP_FILE" == "app.py" ]]; then
    echo -e "  ${BLUE}API Docs${NC} : http://${BACKEND_HOST}:${BACKEND_PORT}/docs"
    echo -e "  ${BLUE}ReDoc${NC}    : http://${BACKEND_HOST}:${BACKEND_PORT}/redoc"
fi

echo
echo -e "${YELLOW}Pour arrêter les serveurs, appuyez sur Ctrl+C dans cette fenêtre.${NC}"
echo

# Configuration des variables d'environnement
export PYTHONPATH="${SCRIPT_DIR}:${PYTHONPATH:-}"
export PYTHONDONTWRITEBYTECODE=1
export PYTHONUNBUFFERED=1

# Fonction de nettoyage à l'arrêt
cleanup() {
    echo
    print_info "Arrêt de l'application en cours..."
    
    # Tuer les processus enfants
    jobs -p | xargs -r kill 2>/dev/null || true
    
    print_success "Application arrêtée."
    exit 0
}

# Gestionnaire de signal pour un arrêt propre
trap cleanup SIGINT SIGTERM

# Démarrage selon le mode détecté
case "$STARTUP_MODE" in
    "production")
        print_info "Démarrage avec le script de production..."
        python "$STARTUP_FILE"
        ;;
    "fastapi")
        print_info "Démarrage avec Uvicorn (FastAPI)..."
        if command -v uvicorn &> /dev/null; then
            # Démarrage avec Uvicorn
            uvicorn "${STARTUP_FILE%.*}:app" \
                --host "${BACKEND_HOST}" \
                --port "${BACKEND_PORT}" \
                --reload \
                --log-level info
        else
            print_warning "Uvicorn non trouvé. Démarrage avec Python standard..."
            python "$STARTUP_FILE"
        fi
        ;;
    "python")
        print_info "Démarrage avec Python standard..."
        python "$STARTUP_FILE"
        ;;
    *)
        print_error "Mode de démarrage non reconnu : $STARTUP_MODE"
        exit 1
        ;;
esac

# Le script se termine ici normalement, mais le trap cleanup() sera appelé si Ctrl+C est pressé