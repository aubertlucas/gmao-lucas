/**
 * PhotoManager Component
 * Handles photo uploads and management for actions
 */
class PhotoManager {
    constructor() {
        this.authManager = new AuthManager();
        this.apiService = new ApiService();
        this.currentActionId = null;
        this.currentActionData = null; // Pour stocker toutes les données de l'action
        this.photos = [];
        this.modal = null;
    }
    
    /**
     * Show the photo manager modal
     * @param {number} actionId - Action ID to manage photos for
     */
    async show(actionId) {
        this.currentActionId = actionId;

        try {
            // Récupérer les détails complets de l'action
            this.currentActionData = await this.apiService.getAction(actionId);

            if (!this.currentActionData) {
                showToast("Impossible de charger les détails de l'action.", 'error');
                return;
            }
            
            this.createModal();
            this.loadPhotos();

        } catch (error) {
            console.error("Erreur lors du chargement de l'action pour le gestionnaire de photos:", error);
            showToast("Erreur lors de l'ouverture du gestionnaire de photos.", 'error');
        }
    }
    
    /**
     * Create the modal dialog
     */
    createModal() {
        // Remove existing modal if any
        const existingModal = document.getElementById('photoModal');
        if (existingModal) {
            existingModal.remove();
        }
        
        const modalHTML = `
            <div class="modal fade" id="photoModal" tabindex="-1">
                <div class="modal-dialog modal-xl">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">
                                Gestion des Photos - Action n°${this.currentActionData.number} (ID: ${this.currentActionData.id})
                            </h5>
                            <button type="button" class="btn-close" 
                                    data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="row">
                                <div class="col-md-12 mb-3">
                                    <div class="upload-zone border-dashed p-4 text-center" 
                                         id="uploadZone">
                                        <i class="bi bi-cloud-upload fs-1 text-muted"></i>
                                        <p class="mt-2">Glissez-déposez vos photos ici ou 
                                           <button class="btn btn-link p-0" id="selectPhotosBtn">cliquez pour sélectionner</button>
                                        </p>
                                        <input type="file" id="photoInput" multiple 
                                               accept="image/*" style="display: none;">
                                    </div>
                                </div>
                            </div>
                            
                            <div id="uploadProgress" class="progress mb-3" style="display: none;">
                                <div class="progress-bar progress-bar-striped progress-bar-animated" 
                                     role="progressbar" style="width: 0%"></div>
                            </div>
                            
                            <h6 class="mb-3">Photos existantes</h6>
                            <div id="photoGrid" class="row"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        this.modal = new bootstrap.Modal(document.getElementById('photoModal'));
        this.modal.show();
        
        this.setupDragAndDrop();
    }
    
    /**
     * Setup drag and drop functionality
     */
    setupDragAndDrop() {
        const uploadZone = document.getElementById('uploadZone');
        const photoInput = document.getElementById('photoInput');
        const selectPhotosBtn = document.getElementById('selectPhotosBtn');
        
        if (uploadZone && photoInput) {
            // Click to select
            selectPhotosBtn.addEventListener('click', (e) => {
                e.preventDefault();
                photoInput.click();
            });
            
            // Drag over
            uploadZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                uploadZone.classList.add('drag-over');
            });
            
            // Drag leave
            uploadZone.addEventListener('dragleave', (e) => {
                e.preventDefault();
                uploadZone.classList.remove('drag-over');
            });
            
            // Drop
            uploadZone.addEventListener('drop', (e) => {
                e.preventDefault();
                uploadZone.classList.remove('drag-over');
                this.handleFiles(e.dataTransfer.files);
            });
            
            // File input change
            photoInput.addEventListener('change', (e) => {
                this.handleFiles(e.target.files);
            });
        }
    }
    
    /**
     * Load photos for the current action
     */
    async loadPhotos() {
        try {
            this.photos = await this.apiService.getActionPhotos(this.currentActionId);
            this.renderPhotos();
        } catch (error) {
            console.error('Error loading photos:', error);
            showToast('Erreur lors du chargement des photos', 'error');
        }
    }
    
    /**
     * Render photos in the grid
     */
    renderPhotos() {
        const photoGrid = document.getElementById('photoGrid');
        
        if (this.photos.length === 0) {
            photoGrid.innerHTML = `
                <div class="col-12 text-center text-muted py-5">
                    <i class="bi bi-image fs-1 d-block mb-2"></i>
                    <span>Aucune photo pour cette action</span>
                </div>
            `;
            return;
        }
        
        const html = this.photos.map(photo => `
            <div class="col-md-3 mb-3">
                <div class="card h-100">
                    <div class="position-relative photo-card">
                        <img src="${photo.thumbnail_url || `http://frsasrvgmao:8000/uploads/thumbs/${this.currentActionId}/${photo.filename}`}?t=${Date.now()}" 
                             class="card-img-top" style="height: 150px; object-fit: cover;"
                             onclick="window.photoManager.showFullSize(${photo.id})">
                        <div class="photo-overlay">
                            <button class="btn btn-sm btn-light rounded-circle"
                                    onclick="window.photoManager.showFullSize(${photo.id})"
                                    title="Voir en grand">
                                <i class="bi bi-fullscreen"></i>
                            </button>
                        </div>
                    </div>
                    <div class="card-body p-2">
                        <small class="text-muted d-block text-truncate" title="${photo.filename}">
                            ${photo.filename}
                        </small>
                        <small class="text-muted">
                            ${this.formatFileSize(photo.file_size)}
                        </small>
                        <button class="btn btn-sm btn-outline-danger float-end" 
                                onclick="window.photoManager.deletePhoto(${photo.id})">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
        
        photoGrid.innerHTML = html;
    }
    
    /**
     * Handle uploaded files
     * @param {FileList} files - Files to handle
     */
    async handleFiles(files) {
        if (!files || files.length === 0) return;
        
        // Show progress bar
        const progressBar = document.querySelector('#uploadProgress .progress-bar');
        document.getElementById('uploadProgress').style.display = 'flex';
        progressBar.style.width = '0%';
        
        try {
            // Filter for only image files
            const imageFiles = Array.from(files).filter(file => 
                file.type.startsWith('image/')
            );
            
            if (imageFiles.length === 0) {
                showToast('Aucun fichier image sélectionné', 'warning');
                document.getElementById('uploadProgress').style.display = 'none';
                return;
            }
            
            progressBar.style.width = '10%';
            
            // Upload photos
            const result = await this.apiService.uploadPhotos(this.currentActionId, imageFiles);
            
            progressBar.style.width = '100%';
            
            // Reload photos
            await this.loadPhotos();
            
            // Refresh the parent action list if it exists
            if (window.actionsList) {
                window.actionsList.loadActions();
            }
            
            showToast(`${imageFiles.length} photo(s) uploadée(s) avec succès`, 'success');
        } catch (error) {
            console.error('Error uploading photos:', error);
            showToast('Erreur lors de l\'upload des photos', 'error');
        } finally {
            // Hide progress after a short delay
            setTimeout(() => {
                document.getElementById('uploadProgress').style.display = 'none';
            }, 1000);
        }
    }
    
    /**
     * Show full-size photo
     * @param {number} photoId - Photo ID
     */
    showFullSize(photoId) {
        const photo = this.photos.find(p => p.id === photoId);
        if (!photo) return;
        
        // Remove any existing fullscreen viewer
        const existingViewer = document.getElementById('photoViewer');
        if (existingViewer) {
            existingViewer.remove();
        }
        
        // Create fullscreen viewer
        const viewerHTML = `
            <div id="photoViewer" class="photo-viewer">
                <div class="photo-viewer-content">
                    <div class="photo-viewer-header">
                        <span>${photo.filename}</span>
                        <button class="btn btn-sm btn-dark rounded-circle"
                                onclick="document.getElementById('photoViewer').remove()">
                            <i class="bi bi-x-lg"></i>
                        </button>
                    </div>
                    <div class="photo-viewer-body">
                        <img src="${photo.url || `http://frsasrvgmao:8000/uploads/photos/${this.currentActionId}/${photo.filename}`}?t=${Date.now()}" alt="${photo.filename}">
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', viewerHTML);
        
        // Close on escape key or click outside
        const viewer = document.getElementById('photoViewer');
        viewer.addEventListener('click', (e) => {
            if (e.target === viewer) {
                viewer.remove();
            }
        });
        
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && viewer) {
                viewer.remove();
            }
        });
    }
    
    /**
     * Delete a photo
     * @param {number} photoId - Photo ID
     */
    async deletePhoto(photoId) {
        if (!confirm('Êtes-vous sûr de vouloir supprimer cette photo ?')) {
            return;
        }
        
        try {
            await this.apiService.deletePhoto(photoId);
            
            // Remove from local array
            this.photos = this.photos.filter(p => p.id !== photoId);
            
            // Update UI
            this.renderPhotos();
            
            // Refresh the parent action list if it exists
            if (window.actionsList) {
                window.actionsList.loadActions();
            }
            
            showToast('Photo supprimée avec succès', 'success');
        } catch (error) {
            console.error('Error deleting photo:', error);
            showToast('Erreur lors de la suppression de la photo', 'error');
        }
    }
    
    /**
     * Format file size for display
     * @param {number} size - File size in bytes
     * @returns {string} - Formatted size
     */
    formatFileSize(size) {
        if (!size) return '';
        
        const units = ['B', 'KB', 'MB', 'GB'];
        let i = 0;
        let fileSize = size;
        
        while (fileSize > 1024 && i < units.length - 1) {
            fileSize /= 1024;
            i++;
        }
        
        return `${fileSize.toFixed(1)} ${units[i]}`;
    }
}

// Initialize PhotoManager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.photoManager = new PhotoManager();
});
