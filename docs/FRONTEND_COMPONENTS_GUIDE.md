# Frontend Components Guide

## Overview

The GMAO frontend is built with vanilla JavaScript using a component-based architecture. Each component is responsible for a specific part of the application functionality, providing reusable and maintainable code.

## Core Architecture

### Component Structure
```javascript
class ComponentName {
    constructor(options = {}) {
        this.options = options;
        this.element = null;
        this.data = null;
    }

    async init() {
        // Component initialization
        await this.loadData();
        this.render();
        this.bindEvents();
    }

    async loadData() {
        // Load required data from API
    }

    render() {
        // Create and populate DOM elements
    }

    bindEvents() {
        // Attach event listeners
    }

    destroy() {
        // Cleanup when component is removed
    }
}
```

---

## Core Services

### ApiService (`/js/api.js`)

Centralized service for all backend communication. Handles authentication headers, error handling, and response parsing.

#### Key Features
- Automatic authentication header injection
- Centralized error handling
- Type validation for requests
- Support for both JSON and FormData

#### Usage Examples

```javascript
// Basic action retrieval
const actions = await apiService.getActions();

// Filtered search
const filteredActions = await apiService.getActions({
    priority: 1,
    assigned_to: 5,
    search: 'heating'
});

// Create new action
const newAction = await apiService.createAction({
    title: 'Fix heating system',
    location_id: 1,
    priority: 1
});

// Field-specific updates (for Excel-like editing)
await apiService.updateActionField(actionId, 'priority', '1');
```

#### Error Handling
```javascript
try {
    const result = await apiService.createAction(data);
} catch (error) {
    if (error.message.includes('validation')) {
        // Handle validation errors
        showValidationError(error.message);
    } else {
        // Handle other errors
        showGenericError('Operation failed');
    }
}
```

### AuthManager (`/js/auth.js`)

Manages user authentication, session storage, and authorization checks.

#### Features
- JWT token management
- Automatic token refresh
- Role-based access control
- Session persistence

#### Usage Examples

```javascript
// Login
try {
    await authManager.login('username', 'password');
    // Redirect to dashboard
    window.location.href = '/dashboard.html';
} catch (error) {
    showError('Invalid credentials');
}

// Check authentication status
if (!authManager.isAuthenticated()) {
    window.location.href = '/index.html';
}

// Role-based access
const currentUser = authManager.getCurrentUser();
if (currentUser.role === 'admin') {
    // Show admin features
}

// Logout
authManager.logout();
```

---

## UI Components

### ActionsList (`/js/components/ActionsList.js`)

Excel-like interface for managing maintenance actions with advanced features like inline editing, sorting, and drag-and-drop reordering.

#### Features
- **Inline Editing**: Click any cell to edit directly
- **Drag & Drop**: Reorder actions by dragging rows
- **Sorting**: Click column headers to sort
- **Filtering**: Real-time filtering by multiple criteria
- **Context Menus**: Right-click for additional actions
- **Bulk Operations**: Select multiple rows for batch operations
- **Keyboard Navigation**: Full keyboard support

#### Initialization
```javascript
const actionsList = new ActionsList({
    container: '#actions-container',
    showFilters: true,
    enableDragDrop: true,
    enableContextMenu: true
});

await actionsList.init();
```

#### Configuration Options
```javascript
const options = {
    container: '#actions-table',           // Container selector
    showFilters: true,                     // Show filter row
    enableDragDrop: true,                  // Enable row reordering
    enableContextMenu: true,               // Enable right-click menus
    editableFields: ['title', 'priority'], // Restrict editable fields
    pageSize: 50,                          // Number of rows per page
    columns: [                             // Custom column configuration
        { field: 'number', width: '80px', sortable: true },
        { field: 'title', width: '200px', editable: true },
        // ...
    ]
};
```

#### Custom Events
```javascript
// Listen for action updates
actionsList.addEventListener('actionUpdated', (event) => {
    const { action, field, oldValue, newValue } = event.detail;
    console.log(`Action ${action.id} ${field} changed from ${oldValue} to ${newValue}`);
});

// Listen for reordering
actionsList.addEventListener('actionsReordered', (event) => {
    const { newOrder } = event.detail;
    console.log('Actions reordered:', newOrder);
});
```

#### Methods
```javascript
// Refresh data
await actionsList.refresh();

// Apply filters
actionsList.applyFilters({
    priority: 1,
    status: 'NON'
});

// Select actions programmatically
actionsList.selectActions([1, 2, 3]);

// Export to CSV
actionsList.exportToCSV('actions.csv');
```

### ActionForm (`/js/components/ActionForm.js`)

Modal form component for creating and editing maintenance actions with validation and auto-completion.

#### Features
- **Form Validation**: Real-time validation with error messages
- **Auto-completion**: Location and user name completion
- **Date Calculations**: Automatic end date calculation
- **Photo Integration**: Embedded photo upload
- **Responsive Design**: Works on all screen sizes

#### Usage
```javascript
// Create new action
const actionForm = new ActionForm({
    mode: 'create',
    onSave: (action) => {
        // Handle successful save
        actionsList.refresh();
    },
    onCancel: () => {
        // Handle cancellation
    }
});

actionForm.show();

// Edit existing action
const editForm = new ActionForm({
    mode: 'edit',
    actionId: 123,
    onSave: (action) => {
        // Handle update
    }
});

await editForm.loadAction(123);
editForm.show();
```

#### Validation Configuration
```javascript
const validationRules = {
    title: {
        required: true,
        maxLength: 200,
        message: 'Title is required and must be less than 200 characters'
    },
    planned_date: {
        required: true,
        type: 'date',
        futureDate: true,
        message: 'Planned date must be in the future'
    },
    estimated_duration: {
        type: 'number',
        min: 0.5,
        max: 40,
        message: 'Duration must be between 0.5 and 40 hours'
    }
};
```

### PhotoManager (`/js/components/PhotoManager.js`)

Advanced photo upload and management component with compression, preview, and gallery features.

#### Features
- **Drag & Drop**: Drag files from file explorer
- **Image Compression**: Automatic compression before upload
- **Duplicate Detection**: Prevents duplicate uploads
- **Progress Tracking**: Upload progress indicators
- **Gallery View**: Grid layout with lightbox
- **Thumbnail Generation**: Automatic thumbnail creation

#### Initialization
```javascript
const photoManager = new PhotoManager(actionId, {
    maxFileSize: 10 * 1024 * 1024,    // 10MB
    compressionQuality: 0.8,           // 80% quality
    maxWidth: 1920,                    // Resize large images
    enableDragDrop: true,
    showThumbnails: true
});

await photoManager.init();
```

#### Usage Examples
```javascript
// Enable drag and drop on specific element
photoManager.enableDragDrop('#upload-zone');

// Handle file selection
document.getElementById('file-input').addEventListener('change', (event) => {
    photoManager.handleFileSelection(event.target.files);
});

// Programmatic upload
const files = [file1, file2, file3];
await photoManager.uploadFiles(files);

// Gallery management
photoManager.showGallery();
photoManager.deletePhoto(photoId);
```

#### Events
```javascript
// Upload progress
photoManager.addEventListener('uploadProgress', (event) => {
    const { loaded, total, percentage } = event.detail;
    updateProgressBar(percentage);
});

// Upload completion
photoManager.addEventListener('uploadComplete', (event) => {
    const { photos } = event.detail;
    console.log(`Uploaded ${photos.length} photos`);
});

// Photo deleted
photoManager.addEventListener('photoDeleted', (event) => {
    const { photoId } = event.detail;
    refreshPhotoCount();
});
```

### CalendarManager (`/js/components/CalendarManager.js`)

Comprehensive calendar component for managing work schedules, exceptions, and date calculations.

#### Features
- **Weekly Schedules**: Configure work hours per day
- **Exception Management**: Holidays, vacations, sick days
- **Date Calculations**: Automatic end date calculation
- **Visual Calendar**: Interactive calendar interface
- **Recurring Events**: Support for recurring exceptions

#### Initialization
```javascript
const calendarManager = new CalendarManager({
    userId: currentUser.id,
    container: '#calendar-container',
    showWeeklyView: true,
    enableExceptions: true,
    workingDays: [1, 2, 3, 4, 5] // Monday to Friday
});

await calendarManager.init();
```

#### Schedule Management
```javascript
// Set weekly schedule
await calendarManager.setWeeklySchedule({
    1: { hours: 8, start: '08:00', end: '17:00' }, // Monday
    2: { hours: 8, start: '08:00', end: '17:00' }, // Tuesday
    // ...
});

// Add exception
await calendarManager.addException({
    date: '2024-12-25',
    type: 'HOLIDAY',
    description: 'Christmas Day',
    working_hours: 0
});

// Calculate working days between dates
const workingDays = await calendarManager.calculateWorkingDays(
    '2024-01-15',
    '2024-01-25'
);
```

### ConfigManager (`/js/components/ConfigManager.v2.js`)

System configuration interface for managing locations, users, and application settings.

#### Features
- **Location Management**: Add, edit, delete locations
- **User Management**: Create and manage user accounts
- **Role Assignment**: Configure user roles and permissions
- **Bulk Operations**: Import/export configurations
- **Validation**: Real-time validation of configuration data

#### Usage
```javascript
const configManager = new ConfigManager({
    container: '#config-container',
    sections: ['locations', 'users', 'settings'],
    enableBulkOperations: true
});

await configManager.init();
```

#### Location Management
```javascript
// Add new location
await configManager.addLocation({
    name: 'New Building',
    description: 'Main office building',
    is_active: true
});

// Edit location
await configManager.editLocation(locationId, {
    name: 'Updated Name'
});

// Delete location (with confirmation)
await configManager.deleteLocation(locationId);
```

#### User Management
```javascript
// Create new user
await configManager.createUser({
    username: 'new_pilot',
    email: 'pilot@company.com',
    role: 'pilot',
    password: 'secure_password'
});

// Update user role
await configManager.updateUserRole(userId, 'manager');

// Reset user password
await configManager.resetPassword(userId, 'new_password');
```

### Dashboard (`/js/dashboard.js`)

Real-time dashboard with statistics, charts, and KPI monitoring.

#### Features
- **Real-time Updates**: Auto-refresh statistics
- **Interactive Charts**: Click to drill down
- **KPI Cards**: Key performance indicators
- **Filtering**: Filter by pilot, location, date range
- **Export**: Export charts and data

#### Initialization
```javascript
const dashboard = new Dashboard({
    container: '#dashboard-container',
    refreshInterval: 30000, // 30 seconds
    charts: ['performance', 'priority', 'location'],
    enableFilters: true
});

await dashboard.init();
```

#### Chart Configuration
```javascript
const chartOptions = {
    performance: {
        type: 'doughnut',
        title: 'Performance Globale',
        colors: ['#28a745', '#dc3545'],
        showLegend: true
    },
    priority: {
        type: 'pie',
        title: 'Répartition par Priorité',
        colors: ['#dc3545', '#ffc107', '#28a745'],
        showPercentages: true
    },
    location: {
        type: 'bar',
        title: 'Actions par Lieu',
        orientation: 'vertical',
        showValues: true
    }
};
```

#### Data Filtering
```javascript
// Filter by pilot
dashboard.filterByPilot(pilotId);

// Date range filter
dashboard.filterByDateRange('2024-01-01', '2024-12-31');

// Custom filters
dashboard.applyFilters({
    priority: [1, 2],
    status: 'NON',
    location: ['Forge', 'Luxe']
});
```

---

## Utility Functions

### Date and Time Utilities

```javascript
// Format dates for display
function formatDate(date, format = 'DD/MM/YYYY') {
    // Implementation
}

// Calculate business days
function calculateBusinessDays(startDate, endDate, workingDays = [1,2,3,4,5]) {
    // Implementation
}

// Date validation
function isValidDate(dateString) {
    // Implementation
}
```

### UI Utilities

```javascript
// Show loading spinner
function showLoading(container) {
    // Implementation
}

// Hide loading spinner
function hideLoading(container) {
    // Implementation
}

// Show toast notification
function showToast(message, type = 'info', duration = 3000) {
    // Implementation
}

// Confirm dialog
async function confirmDialog(message, title = 'Confirmation') {
    // Implementation
}
```

### Data Formatting

```javascript
// Format currency
function formatCurrency(amount, currency = 'EUR') {
    return new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: currency
    }).format(amount);
}

// Format file size
function formatFileSize(bytes) {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
}
```

---

## Best Practices

### Component Development

1. **Use Async/Await**: For all API calls and asynchronous operations
2. **Error Handling**: Always wrap API calls in try-catch blocks
3. **Event Cleanup**: Remove event listeners in destroy() method
4. **Memory Management**: Clear references to DOM elements and data
5. **Responsive Design**: Ensure components work on all screen sizes

### Performance Optimization

1. **Lazy Loading**: Load components only when needed
2. **Virtual Scrolling**: For large data sets
3. **Debouncing**: For search and filter inputs
4. **Caching**: Cache frequently accessed data
5. **Image Optimization**: Compress and resize images

### Code Organization

```javascript
// Good: Organized component structure
class MyComponent {
    constructor(options) {
        this.validateOptions(options);
        this.initializeProperties(options);
    }

    validateOptions(options) {
        // Validate required options
    }

    initializeProperties(options) {
        // Set up component properties
    }

    async init() {
        await this.loadData();
        this.render();
        this.bindEvents();
    }

    // Public methods
    async refresh() {
        // Public API
    }

    // Private methods
    _updateDOM() {
        // Internal methods with underscore prefix
    }
}
```

### Error Handling

```javascript
// Comprehensive error handling
async function handleApiCall() {
    try {
        const result = await apiService.getActions();
        return result;
    } catch (error) {
        if (error.status === 401) {
            // Handle authentication error
            authManager.logout();
            window.location.href = '/login.html';
        } else if (error.status === 422) {
            // Handle validation error
            showValidationErrors(error.details);
        } else {
            // Handle generic error
            showError('Une erreur est survenue');
            console.error('API Error:', error);
        }
        throw error;
    }
}
```

This comprehensive guide covers all frontend components and their usage patterns in the GMAO application. Each component is designed to be reusable, maintainable, and follow modern JavaScript best practices.