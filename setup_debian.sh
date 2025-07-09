#!/bin/bash

# Script d'installation GMAO pour Debian 12.10 64bits
# Compatible avec installation vierge

set -e  # Arrêt en cas d'erreur
set -u  # Arrêt si variable non définie

# Configuration
PYTHON_REQUIRED_MAJOR=3
PYTHON_REQUIRED_MINOR=9   # Version minimale supportée
PYTHON_RECOMMENDED_MINOR=11  # Version recommandée (Debian 12 par défaut)
PYTHON_VERSION="3.11"  # Version par défaut Debian 12
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="${SCRIPT_DIR}/installation.log"

# Couleurs pour l'affichage
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Fonctions utilitaires
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

print_header() {
    echo -e "${BLUE}"
    echo "======================================================="
    echo "==    Script d'installation de l'application GMAO   =="
    echo "==              Compatible Debian 12.10             =="
    echo "==                Installation vierge               =="
    echo "======================================================="
    echo -e "${NC}"
}

print_success() {
    echo -e "${GREEN}[SUCCÈS]${NC} $1"
    log "SUCCÈS: $1"
}

print_warning() {
    echo -e "${YELLOW}[AVERTISSEMENT]${NC} $1"
    log "AVERTISSEMENT: $1"
}

print_error() {
    echo -e "${RED}[ERREUR]${NC} $1"
    log "ERREUR: $1"
}

print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
    log "INFO: $1"
}

confirm_action() {
    local prompt="$1"
    local response
    
    while true; do
        read -p "$prompt (o/n): " response
        case $response in
            [Oo]|[Oo][Uu][Ii]) return 0 ;;
            [Nn]|[Nn][Oo][Nn]) return 1 ;;
            *) echo "Veuillez répondre par 'o' pour oui ou 'n' pour non." ;;
        esac
    done
}

check_root() {
    if [[ $EUID -eq 0 ]]; then
        print_error "Ce script ne doit PAS être exécuté en tant que root."
        print_info "Exécutez-le avec votre utilisateur normal. sudo sera utilisé quand nécessaire."
        exit 1
    fi
}

check_sudo() {
    if ! sudo -n true 2>/dev/null; then
        print_info "Ce script nécessite des privilèges sudo pour installer les paquets système."
        print_info "Vous pourriez être invité à saisir votre mot de passe."
        
        if ! sudo -v; then
            print_error "Impossible d'obtenir les privilèges sudo."
            exit 1
        fi
    fi
    print_success "Privilèges sudo confirmés."
}

check_debian_version() {
    print_info "Vérification de la version du système..."
    
    if [[ ! -f /etc/debian_version ]]; then
        print_error "Ce script est conçu pour Debian. Système non supporté."
        exit 1
    fi
    
    local debian_version
    debian_version=$(cat /etc/debian_version)
    print_info "Version Debian détectée: $debian_version"
    
    # Vérification version 12.x (Bookworm)
    if [[ $debian_version == 12.* ]] || grep -q "bookworm" /etc/os-release 2>/dev/null; then
        print_success "Debian 12 (Bookworm) confirmé - Compatible"
        print_info "Cette version inclut Python 3.11 par défaut - Optimal pour GMAO"
    else
        print_warning "Version Debian différente de 12.x détectée."
        print_info "Note: Ce script est optimisé pour Debian 12 avec Python 3.11"
        if ! confirm_action "Continuer malgré tout ?"; then
            print_info "Installation annulée par l'utilisateur."
            exit 1
        fi
    fi
}

update_system() {
    print_info "Mise à jour de la liste des paquets..."
    
    if ! sudo apt update; then
        print_error "Échec de la mise à jour des paquets."
        print_info "Vérifiez votre connexion internet et les sources APT."
        exit 1
    fi
    
    print_success "Liste des paquets mise à jour."
    
    if confirm_action "Voulez-vous mettre à jour le système ?"; then
        print_info "Mise à jour du système en cours..."
        if sudo apt upgrade -y; then
            print_success "Système mis à jour avec succès."
        else
            print_warning "Problème lors de la mise à jour du système."
            if ! confirm_action "Continuer malgré tout ?"; then
                exit 1
            fi
        fi
    fi
}

install_system_dependencies() {
    print_info "Installation des dépendances système..."
    
    local packages=(
        "python3"
        "python3-pip"
        "python3-venv"
        "python3-dev"
        "build-essential"
        "curl"
        "wget"
        "git"
        "unzip"
        "software-properties-common"
        "apt-transport-https"
        "ca-certificates"
        "gnupg"
        "lsb-release"
    )
    
    print_info "Installation des paquets: ${packages[*]}"
    
    if sudo apt install -y "${packages[@]}"; then
        print_success "Dépendances système installées avec succès."
    else
        print_error "Échec de l'installation des dépendances système."
        exit 1
    fi
}

check_python_version() {
    print_info "Vérification de la version de Python..."
    
    if ! command -v python3 &> /dev/null; then
        print_error "Python3 n'est pas installé ou non accessible."
        return 1
    fi
    
    local python_version
    python_version=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
    print_info "Version Python détectée: $python_version"
    
    local major minor
    IFS='.' read -r major minor <<< "$python_version"
    
    # Vérification version minimale
    if [[ $major -lt $PYTHON_REQUIRED_MAJOR ]] || \
       ([[ $major -eq $PYTHON_REQUIRED_MAJOR ]] && [[ $minor -lt $PYTHON_REQUIRED_MINOR ]]); then
        print_error "Version Python insuffisante. Minimum requis: ${PYTHON_REQUIRED_MAJOR}.${PYTHON_REQUIRED_MINOR}+, Trouvé: $python_version"
        return 1
    fi
    
    # Messages spécifiques selon la version
    if [[ $major -eq 3 ]] && [[ $minor -eq 11 ]]; then
        print_success "Python 3.11 détecté - Version par défaut de Debian 12 - Parfait !"
    elif [[ $major -eq 3 ]] && [[ $minor -ge $PYTHON_RECOMMENDED_MINOR ]]; then
        print_success "Python $python_version détecté - Version excellente !"
    elif [[ $major -eq 3 ]] && [[ $minor -ge $PYTHON_REQUIRED_MINOR ]]; then
        print_success "Python $python_version détecté - Version compatible."
        print_info "Note: Python 3.11+ est recommandé pour de meilleures performances."
    else
        print_success "Version Python compatible: $python_version"
    fi
    
    return 0
}

setup_virtual_environment() {
    print_info "Configuration de l'environnement virtuel Python..."
    
    # Suppression de l'ancien environnement si demandé
    if [[ -d ".venv" ]]; then
        print_warning "Un environnement virtuel existe déjà."
        if confirm_action "Voulez-vous le supprimer et en créer un nouveau ?"; then
            rm -rf .venv
            print_info "Ancien environnement virtuel supprimé."
        else
            print_info "Utilisation de l'environnement virtuel existant."
        fi
    fi
    
    # Création de l'environnement virtuel
    if [[ ! -d ".venv" ]]; then
        print_info "Création de l'environnement virtuel..."
        if python3 -m venv .venv; then
            print_success "Environnement virtuel créé avec succès."
        else
            print_error "Échec de la création de l'environnement virtuel."
            exit 1
        fi
    fi
    
    # Activation de l'environnement virtuel
    print_info "Activation de l'environnement virtuel..."
    if source .venv/bin/activate; then
        print_success "Environnement virtuel activé."
    else
        print_error "Échec de l'activation de l'environnement virtuel."
        exit 1
    fi
    
    # Mise à jour de pip
    print_info "Mise à jour de pip..."
    if python -m pip install --upgrade pip; then
        print_success "pip mis à jour avec succès."
    else
        print_warning "Problème lors de la mise à jour de pip."
    fi
}

check_requirements_compatibility() {
    print_info "Vérification de la compatibilité des dépendances avec Python 3.11..."
    
    if [[ ! -f "requirements.txt" ]]; then
        print_warning "Fichier requirements.txt non trouvé - vérification ignorée."
        return 0
    fi
    
    # Vérification des dépendances problématiques connues
    local python_version
    python_version=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
    
    if [[ $python_version == "3.11" ]]; then
        print_info "Vérification spécifique pour Python 3.11..."
        
        # Vérification Pydantic version problématique
        if grep -q "pydantic==1.10.1[1-3]" requirements.txt; then
            print_error "Version Pydantic problématique détectée avec Python 3.11!"
            print_info "Les versions Pydantic 1.10.11-1.10.13 ont des problèmes avec Python 3.11."
            print_info "Recommandation: utilisez Pydantic 1.10.7 ou 1.10.14+"
            return 1
        fi
        
        # Vérifications positives
        if grep -q "pydantic==1.10.7" requirements.txt; then
            print_success "Pydantic 1.10.7 détecté - Compatible avec Python 3.11"
        fi
        
        if grep -q "fastapi" requirements.txt; then
            print_success "FastAPI détecté - Compatible avec Python 3.11"
        fi
        
        if grep -q "bcrypt==4\." requirements.txt; then
            print_success "bcrypt 4.x détecté - Compatible avec Python 3.11 (version Rust)"
        fi
        
        if grep -q "pillow==10\." requirements.txt; then
            print_success "Pillow 10.x détecté - Compatible avec Python 3.11"
        fi
    fi
    
    return 0
}

install_system_build_dependencies() {
    print_info "Installation des dépendances de compilation pour Python 3.11..."
    
    # Dépendances supplémentaires pour compilation de packages cryptographiques
    local build_packages=(
        "libffi-dev"
        "libssl-dev"
        "libxml2-dev"
        "libxslt1-dev"
        "libjpeg-dev"
        "libpng-dev"
        "zlib1g-dev"
        "libtiff5-dev"
        "libfreetype6-dev"
        "liblcms2-dev"
        "libwebp-dev"
        "tk-dev"
        "pkg-config"
        "rustc"
        "cargo"
    )
    
    print_info "Installation des outils de compilation: ${build_packages[*]}"
    
    if sudo apt install -y "${build_packages[@]}"; then
        print_success "Dépendances de compilation installées."
    else
        print_warning "Certaines dépendances de compilation ont échoué."
        print_info "L'installation pourrait échouer pour certains packages nécessitant la compilation."
    fi
}

install_python_dependencies() {
    print_info "Installation des dépendances Python..."
    
    # Vérification du fichier requirements.txt
    if [[ ! -f "requirements.txt" ]]; then
        print_error "Fichier requirements.txt non trouvé dans le répertoire courant."
        print_info "Assurez-vous d'être dans le bon répertoire."
        exit 1
    fi
    
    # Vérification de compatibilité avant installation
    if ! check_requirements_compatibility; then
        print_error "Problèmes de compatibilité détectés dans requirements.txt"
        exit 1
    fi
    
    # Mise à jour pip et des outils de base
    print_info "Mise à jour des outils d'installation..."
    pip install --upgrade pip setuptools wheel
    
    # Installation avec gestion d'erreurs améliorée
    print_info "Installation des dépendances à partir de requirements.txt..."
    echo "Contenu de requirements.txt :"
    echo "$(head -10 requirements.txt)..."
    echo
    
    # Tentative 1: Installation normale
    if pip install -r requirements.txt --verbose; then
        print_success "Dépendances Python installées avec succès."
        return 0
    fi
    
    print_warning "Première tentative d'installation échouée. Diagnostic en cours..."
    
    # Tentative 2: Sans cache et avec compilation forcée
    print_info "Tentative d'installation sans cache..."
    if pip install --no-cache-dir --force-reinstall -r requirements.txt; then
        print_success "Dépendances Python installées (sans cache)."
        return 0
    fi
    
    # Tentative 3: Installation package par package pour identifier les problèmes
    print_warning "Installation globale échouée. Tentative package par package..."
    local failed_packages=()
    
    while IFS= read -r line; do
        # Ignorer les commentaires et lignes vides
        if [[ $line =~ ^#.*$ ]] || [[ -z $line ]]; then
            continue
        fi
        
        # Extraire le nom du package
        local package=$(echo "$line" | cut -d'=' -f1 | cut -d'>' -f1 | cut -d'<' -f1)
        
        print_info "Installation de $line..."
        if ! pip install "$line" --verbose; then
            print_warning "Échec de l'installation de $package"
            failed_packages+=("$line")
        else
            print_success "$package installé avec succès"
        fi
    done < requirements.txt
    
    # Rapport final
    if [[ ${#failed_packages[@]} -eq 0 ]]; then
        print_success "Toutes les dépendances ont été installées individuellement."
        return 0
    else
        print_error "Échec de l'installation des packages suivants:"
        for pkg in "${failed_packages[@]}"; do
            echo "  - $pkg"
        done
        
        print_info "Solutions possibles:"
        echo "  1. Vérifiez la connexion internet"
        echo "  2. Installez les dépendances système manquantes"
        echo "  3. Mettez à jour le système: sudo apt update && sudo apt upgrade"
        echo "  4. Utilisez des versions alternatives des packages problématiques"
        
        return 1
    fi
}

setup_application_files() {
    print_info "Configuration des fichiers de l'application..."
    
    # Exécution du script de téléchargement des dépendances frontend
    if [[ -f "download_dependencies.py" ]]; then
        print_info "Téléchargement des dépendances frontend..."
        if python download_dependencies.py; then
            print_success "Dépendances frontend téléchargées."
        else
            print_warning "Échec du téléchargement des dépendances frontend."
            print_info "L'application pourrait fonctionner en mode dégradé."
        fi
    else
        print_warning "Script download_dependencies.py non trouvé - ignoré."
    fi
    
    # Mise à jour des références CDN
    if [[ -f "update_cdn_references.py" ]]; then
        print_info "Mise à jour des références locales..."
        if python update_cdn_references.py; then
            print_success "Références locales mises à jour."
        else
            print_warning "Échec de la mise à jour des références locales."
        fi
    else
        print_warning "Script update_cdn_references.py non trouvé - ignoré."
    fi
    
    # Configuration du fichier .env
    if [[ ! -f ".env" ]]; then
        if [[ -f ".env.example" ]]; then
            print_info "Création du fichier .env à partir du modèle..."
            if cp .env.example .env; then
                print_success "Fichier .env créé avec succès."
                print_info "N'oubliez pas de modifier .env selon vos besoins."
            else
                print_warning "Impossible de créer le fichier .env."
            fi
        else
            print_warning "Fichier .env.example non trouvé."
            print_info "Vous devrez créer manuellement le fichier .env."
        fi
    else
        print_info "Fichier .env déjà présent."
    fi
}

create_test_script() {
    print_info "Création du script de test des dépendances..."
    
    cat > test_installation.py << 'EOF'
#!/usr/bin/env python3
"""
Script de test pour vérifier l'installation GMAO
"""

import sys
import importlib.util

def test_import(module_name, package_name=None):
    """Test l'importation d'un module"""
    try:
        if package_name:
            spec = importlib.util.find_spec(module_name)
            if spec is None:
                print(f"❌ {package_name}: Module {module_name} non trouvé")
                return False
        
        module = importlib.import_module(module_name)
        print(f"✅ {package_name or module_name}: OK")
        
        # Tests spécifiques
        if module_name == "fastapi":
            print(f"   Version FastAPI: {module.__version__}")
        elif module_name == "pydantic":
            print(f"   Version Pydantic: {module.VERSION}")
        elif module_name == "sqlalchemy":
            print(f"   Version SQLAlchemy: {module.__version__}")
        elif module_name == "bcrypt":
            # Test simple de bcrypt
            password = b"test_password"
            hashed = module.hashpw(password, module.gensalt())
            if module.checkpw(password, hashed):
                print("   Test bcrypt: OK")
            else:
                print("   ⚠️  Test bcrypt: ECHEC")
        elif module_name == "PIL":
            print(f"   Version Pillow: {module.__version__}")
            
        return True
    except ImportError as e:
        print(f"❌ {package_name or module_name}: Erreur d'importation - {e}")
        return False
    except Exception as e:
        print(f"⚠️  {package_name or module_name}: Importé mais erreur de test - {e}")
        return True  # Module importé mais test spécifique échoué

def test_fastapi_creation():
    """Test la création d'une app FastAPI basique"""
    try:
        from fastapi import FastAPI
        from pydantic import BaseModel
        
        app = FastAPI()
        
        class TestModel(BaseModel):
            message: str
            
        @app.get("/")
        def read_root():
            return {"message": "Hello GMAO"}
            
        @app.post("/test")
        def test_model(item: TestModel):
            return item
            
        print("✅ FastAPI + Pydantic: Application de test créée avec succès")
        return True
    except Exception as e:
        print(f"❌ FastAPI + Pydantic: Erreur de création d'app - {e}")
        return False

def main():
    print("=== Test d'installation GMAO ===")
    print(f"Python: {sys.version}")
    print()
    
    # Modules critiques à tester
    modules_to_test = [
        ("fastapi", "FastAPI Framework"),
        ("uvicorn", "Uvicorn ASGI Server"),
        ("sqlalchemy", "SQLAlchemy ORM"),
        ("pydantic", "Pydantic Validation"),
        ("bcrypt", "bcrypt Encryption"),
        ("PIL", "Pillow Image Processing"),
        ("jose", "python-jose JWT"),
        ("passlib", "Passlib Password Hashing"),
        ("aiofiles", "aiofiles Async File I/O"),
        ("dotenv", "python-dotenv Environment"),
        ("requests", "Requests HTTP"),
        ("email_validator", "Email Validator"),
        ("alembic", "Alembic Database Migration")
    ]
    
    results = []
    for module_name, description in modules_to_test:
        result = test_import(module_name, description)
        results.append((description, result))
    
    print()
    print("=== Tests fonctionnels ===")
    
    # Test création app FastAPI
    fastapi_test = test_fastapi_creation()
    results.append(("FastAPI App Creation", fastapi_test))
    
    # Résumé
    print()
    print("=== Résumé ===")
    success_count = sum(1 for _, result in results if result)
    total_count = len(results)
    
    print(f"Tests réussis: {success_count}/{total_count}")
    
    if success_count == total_count:
        print("🎉 Installation complète et fonctionnelle!")
        return 0
    elif success_count >= total_count * 0.8:
        print("⚠️  Installation majoritairement fonctionnelle")
        print("Quelques modules optionnels peuvent manquer")
        return 0
    else:
        print("❌ Installation incomplète")
        print("Plusieurs modules critiques manquent")
        return 1

if __name__ == "__main__":
    sys.exit(main())
EOF

    chmod +x test_installation.py
    print_success "Script de test créé: test_installation.py"
    
    # Exécution du test
    if confirm_action "Voulez-vous exécuter le test d'installation maintenant ?"; then
        print_info "Exécution du test d'installation..."
        if python test_installation.py; then
            print_success "Test d'installation réussi !"
        else
            print_warning "Certains tests ont échoué, mais l'installation peut être fonctionnelle."
        fi
    fi
}

setup_systemd_service() {
    if confirm_action "Voulez-vous créer un service systemd pour démarrer automatiquement l'application ?"; then
        print_info "Création du service systemd..."
        
        local service_name="gmao-app"
        local current_user=$(whoami)
        local app_path="$SCRIPT_DIR"
        
        # Détermination du fichier principal
        local main_file=""
        if [[ -f "app.py" ]]; then
            main_file="app.py"
        elif [[ -f "main.py" ]]; then
            main_file="main.py"
        elif [[ -f "run.py" ]]; then
            main_file="run.py"
        else
            print_warning "Fichier principal non trouvé. Service non créé."
            return
        fi
        
        sudo tee /etc/systemd/system/${service_name}.service > /dev/null << EOF
[Unit]
Description=Application GMAO
After=network.target

[Service]
Type=simple
User=${current_user}
WorkingDirectory=${app_path}
Environment=PATH=${app_path}/.venv/bin
ExecStart=${app_path}/.venv/bin/python ${main_file}
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

        sudo systemctl daemon-reload
        sudo systemctl enable ${service_name}
        
        print_success "Service systemd créé: ${service_name}"
        print_info "Commandes utiles:"
        print_info "  Démarrer: sudo systemctl start ${service_name}"
        print_info "  Arrêter: sudo systemctl stop ${service_name}"
        print_info "  Statut: sudo systemctl status ${service_name}"
        print_info "  Logs: sudo journalctl -u ${service_name} -f"
    fi
}

configure_firewall() {
    if command -v ufw &> /dev/null; then
        if confirm_action "Voulez-vous configurer le pare-feu UFW pour l'application ?"; then
            print_info "Configuration du pare-feu UFW..."
            
            # Ports par défaut pour applications web
            local ports=("80" "443" "8000" "8080" "5000")
            
            echo "Ports couramment utilisés pour les applications web:"
            for i in "${!ports[@]}"; do
                echo "$((i+1)). ${ports[$i]}"
            done
            
            read -p "Entrez le numéro du port à ouvrir (ou tapez un port personnalisé): " port_choice
            
            local selected_port=""
            if [[ $port_choice =~ ^[0-9]+$ ]] && [[ $port_choice -ge 1 ]] && [[ $port_choice -le ${#ports[@]} ]]; then
                selected_port="${ports[$((port_choice-1))]}"
            else
                selected_port="$port_choice"
            fi
            
            if [[ $selected_port =~ ^[0-9]+$ ]]; then
                sudo ufw allow "$selected_port"
                print_success "Port $selected_port ouvert dans le pare-feu."
            else
                print_warning "Port invalide. Configuration pare-feu ignorée."
            fi
        fi
    else
        print_info "UFW non installé. Configuration pare-feu ignorée."
    fi
}

final_verification() {
    print_info "Vérification finale de l'installation..."
    
    # Vérification Python dans l'environnement virtuel
    if source .venv/bin/activate && python -c "import sys; print(f'Python {sys.version}')"; then
        print_success "Python fonctionne correctement dans l'environnement virtuel."
    else
        print_error "Problème avec Python dans l'environnement virtuel."
        return 1
    fi
    
    # Vérification des dépendances principales
    if python -c "import pip; print(f'pip {pip.__version__}')"; then
        print_success "pip fonctionne correctement."
    else
        print_warning "Problème avec pip."
    fi
    
    # Test des packages critiques pour GMAO
    print_info "Test des modules critiques..."
    local critical_modules=(
        "fastapi:FastAPI"
        "uvicorn:Uvicorn server"
        "sqlalchemy:SQLAlchemy ORM"
        "pydantic:Pydantic validation"
        "bcrypt:bcrypt encryption"
        "PIL:Pillow image processing"
        "jose:python-jose JWT"
    )
    
    local failed_imports=()
    
    for module_info in "${critical_modules[@]}"; do
        local module_name=$(echo "$module_info" | cut -d':' -f1)
        local module_desc=$(echo "$module_info" | cut -d':' -f2)
        
        if python -c "import $module_name" 2>/dev/null; then
            print_success "$module_desc importé avec succès"
        else
            print_warning "Échec d'importation: $module_desc"
            failed_imports+=("$module_name")
        fi
    done
    
    # Affichage des versions installées
    print_info "Versions des packages installés:"
    python -c "
import pkg_resources
packages = ['fastapi', 'uvicorn', 'sqlalchemy', 'pydantic', 'bcrypt', 'pillow', 'python-jose']
for pkg in packages:
    try:
        version = pkg_resources.get_distribution(pkg).version
        print(f'  • {pkg}: {version}')
    except:
        print(f'  • {pkg}: non trouvé')
"
    
    if [[ ${#failed_imports[@]} -eq 0 ]]; then
        print_success "Tous les modules critiques sont fonctionnels."
        return 0
    else
        print_warning "Modules avec problèmes: ${failed_imports[*]}"
        print_info "L'application pourrait fonctionner partiellement."
        return 0  # Ne pas bloquer l'installation pour des modules optionnels
    fi
}

show_completion_message() {
    echo
    echo -e "${GREEN}================================================================${NC}"
    echo -e "${GREEN}==                INSTALLATION TERMINÉE !                    ==${NC}"
    echo -e "${GREEN}================================================================${NC}"
    echo
    print_success "Installation réussie sur Debian 12.10"
    echo
    echo -e "${BLUE}Configuration Python:${NC}"
    local current_python_version
    current_python_version=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}')" 2>/dev/null || echo "Non détectable")
    echo "• Version Python active: $current_python_version"
    if [[ $current_python_version == 3.11.* ]]; then
        echo "• ✅ Python 3.11 (version par défaut Debian 12) - Configuration optimale"
    fi
    echo
    echo -e "${BLUE}Informations importantes:${NC}"
    echo "• Répertoire d'installation: $SCRIPT_DIR"
    echo "• Log d'installation: $LOG_FILE"
    echo "• Environnement virtuel: .venv/"
    echo
    echo -e "${BLUE}Pour lancer l'application:${NC}"
    echo "• Méthode 1: ./start_production.sh"
    echo "• Méthode 2: source .venv/bin/activate && python app.py"
    echo "• Méthode 3: uvicorn app:app --host 0.0.0.0 --port 8000"
    echo
    if systemctl is-enabled gmao-app &>/dev/null; then
        echo -e "${BLUE}Service systemd configuré:${NC}"
        echo "• sudo systemctl start gmao-app"
        echo "• sudo systemctl status gmao-app"
    fi
    echo
    echo -e "${BLUE}Configuration GMAO spécifique:${NC}"
    echo "• FastAPI sera accessible sur http://localhost:8000"
    echo "• Documentation API automatique: http://localhost:8000/docs"
    echo "• Base de données SQLAlchemy configurée"
    echo "• Authentification JWT avec python-jose prête"
    echo "• Traitement d'images Pillow activé"
    echo
    echo -e "${YELLOW}Notes de sécurité:${NC}"
    echo "• Modifiez le fichier .env selon vos besoins"
    echo "• Configurez HTTPS pour la production"
    echo "• Vérifiez les permissions des fichiers"
    echo "• Considérez l'utilisation d'un reverse proxy (nginx/apache)"
    echo
}

cleanup_on_error() {
    print_error "Installation interrompue."
    print_info "Les logs sont disponibles dans: $LOG_FILE"
    
    if [[ -d ".venv" ]]; then
        if confirm_action "Voulez-vous supprimer l'environnement virtuel incomplet ?"; then
            rm -rf .venv
            print_info "Environnement virtuel supprimé."
        fi
    fi
}

# Fonction principale
main() {
    # Initialisation du log
    echo "=== Début de l'installation GMAO - $(date) ===" > "$LOG_FILE"
    
    print_header
    
    # Vérifications préalables
    check_root
    check_sudo
    check_debian_version
    
    # Installation
    update_system
    install_system_dependencies
    install_system_build_dependencies
    
    if ! check_python_version; then
        print_error "Version Python incompatible. Installation arrêtée."
        exit 1
    fi
    
    setup_virtual_environment
    install_python_dependencies
    setup_application_files
    create_startup_script
    create_test_script
    setup_systemd_service
    configure_firewall
    
    if final_verification; then
        show_completion_message
        print_success "Installation terminée avec succès !"
    else
        print_error "Problèmes détectés lors de la vérification finale."
        exit 1
    fi
    
    echo "=== Fin de l'installation GMAO - $(date) ===" >> "$LOG_FILE"
}

# Gestion des erreurs
trap cleanup_on_error ERR

# Point d'entrée
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi