/**
 * Helper utilities for GMAO application
 */

/**
 * Format a date string to locale format
 * @param {string} dateString - ISO date string
 * @returns {string} - Formatted date
 */
function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR');
}

/**
 * Format a numeric value as currency
 * @param {number} amount - Amount to format
 * @returns {string} - Formatted currency
 */
function formatCurrency(amount) {
    if (!amount && amount !== 0) return '-';
    return new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    }).format(amount);
}

/**
 * Truncate text with ellipsis if too long
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} - Truncated text
 */
function truncateText(text, maxLength) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

/**
 * Get appropriate icon for toast notification
 * @param {string} type - Notification type
 * @returns {string} - Bootstrap icon class
 */
function getToastIcon(type) {
    switch (type) {
        case 'success': return 'check-circle-fill';
        case 'error': return 'exclamation-circle-fill';
        case 'warning': return 'exclamation-triangle-fill';
        case 'info': default: return 'info-circle-fill';
    }
}

/**
 * Show toast notification
 * @param {string} message - Message to display
 * @param {string} type - Notification type: success, error, warning, info
 */
function showToast(message, type = 'info') {
    // Create toast container if it doesn't exist
    let toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toastContainer';
        toastContainer.className = 'toast-container position-fixed bottom-0 end-0 p-3';
        document.body.appendChild(toastContainer);
    }
    
    const toastId = 'toast-' + Date.now();
    
    const toastHTML = `
        <div id="${toastId}" class="toast" role="alert" aria-live="assertive" aria-atomic="true">
            <div class="toast-header">
                <i class="bi bi-${getToastIcon(type)} me-2 text-${type}"></i>
                <strong class="me-auto">Notification</strong>
                <small>${new Date().toLocaleTimeString()}</small>
                <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button>
            </div>
            <div class="toast-body">
                ${message}
            </div>
        </div>
    `;
    
    toastContainer.insertAdjacentHTML('beforeend', toastHTML);
    
    const toastElement = document.getElementById(toastId);
    const toast = new bootstrap.Toast(toastElement, { delay: 5000 });
    toast.show();
    
    // Auto-remove after hiding
    toastElement.addEventListener('hidden.bs.toast', () => {
        toastElement.remove();
    });
}

/**
 * Validate a form checking required fields
 * @param {HTMLFormElement} formElement - Form to validate
 * @returns {boolean} - Whether form is valid
 */
function validateForm(formElement) {
    const requiredFields = formElement.querySelectorAll('[required]');
    let isValid = true;
    
    requiredFields.forEach(field => {
        if (!field.value.trim()) {
            field.classList.add('is-invalid');
            isValid = false;
        } else {
            field.classList.remove('is-invalid');
        }
    });
    
    return isValid;
}

/**
 * Add days to a date
 * @param {Date} date - Starting date
 * @param {number} days - Number of days to add
 * @returns {Date} - Resulting date
 */
function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}

/**
 * Convert a date to ISO format string (YYYY-MM-DD)
 * @param {Date} date - Date to format
 * @returns {string} - ISO date string
 */
function toISODateString(date) {
    if (!date) return '';
    const d = new Date(date);
    return d.toISOString().split('T')[0];
}

/**
 * Export data to CSV
 * @param {Array} data - Array of objects to export
 * @param {string} filename - Output filename
 */
function exportToCSV(data, filename) {
    if (!data || data.length === 0) {
        showToast("Aucune donnée à exporter.", "warning");
        return;
    }

    // Use a semicolon as a separator for better Excel compatibility in Europe
    const separator = ';';
    const keys = Object.keys(data[0]);

    // Function to properly escape cell content
    const escapeCell = (cell) => {
        let cellData = cell === null || cell === undefined ? '' : String(cell);
        // If the cell contains the separator, quotes, or a newline, wrap it in double quotes.
        if (cellData.includes(separator) || cellData.includes('"') || cellData.includes('\n')) {
            // Escape existing double quotes by doubling them
            cellData = `"${cellData.replace(/"/g, '""')}"`;
        }
        return cellData;
    };

    // Build the CSV content
    const headerRow = keys.join(separator);
    const dataRows = data.map(row => 
        keys.map(key => escapeCell(row[key])).join(separator)
    );
    
    const csvContent = [headerRow, ...dataRows].join('\n');

    // Create a Blob with a BOM (Byte Order Mark) for UTF-8 to ensure Excel reads accents correctly
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename || 'export.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

/**
 * Debounce function to limit execution rate
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} - Debounced function
 */
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}

/**
 * Check if a date is in the past
 * @param {string|Date} date - Date to check
 * @returns {boolean} - Whether date is in the past
 */
function isDatePast(date) {
    if (!date) return false;
    const checkDate = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return checkDate < today;
}

/**
 * Calculate days difference between two dates
 * @param {string|Date} date1 - First date
 * @param {string|Date} date2 - Second date (defaults to today)
 * @returns {number} - Days difference
 */
function daysDifference(date1, date2 = new Date()) {
    if (!date1) return null;
    const first = new Date(date1);
    const second = new Date(date2);
    const diffTime = Math.abs(second - first);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}
