# GMAO Usage Examples Guide

## Quick Start Examples

### Authentication

```javascript
// Login user
await authManager.login('admin', 'password');

// Check if authenticated
if (authManager.isAuthenticated()) {
    // User is logged in, proceed
}

// Get current user info
const user = authManager.getCurrentUser();
console.log('Logged in as:', user.username, 'Role:', user.role);
```

### Action Management

```javascript
// Create new action
const newAction = await apiService.createAction({
    title: 'Fix heating system',
    location_id: 1,
    description: 'Heating not working in main building',
    assigned_to: 5,
    priority: 1,
    estimated_duration: 8.0,
    planned_date: '2024-01-20',
    budget_initial: 500.0
});

// Get all actions with filters
const actions = await apiService.getActions({
    priority: 1,           // High priority only
    status: 'NON',         // Not completed
    assigned_to: 5,        // Assigned to specific user
    search: 'heating'      // Search term
});

// Update single field (Excel-like editing)
await apiService.updateActionField(actionId, 'priority', '1');

// Mark action as completed
await apiService.updateActionField(actionId, 'final_status', 'OK');
```

### Photo Management

```javascript
// Initialize photo manager for an action
const photoManager = new PhotoManager(actionId);
await photoManager.init();

// Upload photos with progress tracking
photoManager.addEventListener('uploadProgress', (event) => {
    const { percentage } = event.detail;
    console.log(`Upload progress: ${percentage}%`);
});

// Handle file selection
const fileInput = document.getElementById('photos');
fileInput.addEventListener('change', (event) => {
    photoManager.handleFileSelection(event.target.files);
});

// Get photos for an action
const photos = await apiService.getActionPhotos(actionId);
```

### Dashboard Data

```javascript
// Get dashboard statistics
const stats = await apiService.getDashboardStats();

// Filter stats by pilot
const pilotStats = await apiService.getDashboardStats(pilotId);

// Display key metrics
console.log(`Total Actions: ${stats.total_actions}`);
console.log(`Completed: ${stats.completed_actions}`);
console.log(`Performance: ${stats.performance_percentage}%`);
```

### User Management

```javascript
// Get all users
const users = await apiService.getUsers();

// Get users by role
const pilots = await apiService.getUsers('pilot');

// Create new user
const newUser = await apiService.createUser({
    username: 'new_pilot',
    email: 'pilot@company.com',
    password: 'secure_password',
    role: 'pilot'
});

// Reset user password (admin only)
await apiService.resetUserPassword(userId, 'new_password');
```

### Configuration Management

```javascript
// Get all locations
const locations = await apiService.getLocations();

// Create new location
await apiService.createLocation({
    name: 'New Building',
    description: 'Additional work site',
    is_active: true
});

// Get complete system configuration
const config = await apiService.getConfiguration();
```

## Component Initialization Examples

### Actions List (Excel-like interface)

```javascript
const actionsList = new ActionsList({
    container: '#actions-container',
    showFilters: true,
    enableDragDrop: true,
    enableContextMenu: true
});

await actionsList.init();

// Listen for updates
actionsList.addEventListener('actionUpdated', (event) => {
    const { action, field, newValue } = event.detail;
    console.log(`Action ${action.id} ${field} updated to ${newValue}`);
});
```

### Dashboard

```javascript
const dashboard = new Dashboard({
    container: '#dashboard-container',
    refreshInterval: 30000,  // 30 seconds
    charts: ['performance', 'priority', 'location'],
    enableFilters: true
});

await dashboard.init();

// Apply custom filters
dashboard.applyFilters({
    priority: [1, 2],
    location: ['Forge', 'Luxe']
});
```

### Calendar Management

```javascript
const calendarManager = new CalendarManager({
    userId: currentUser.id,
    container: '#calendar-container',
    enableExceptions: true
});

await calendarManager.init();

// Add vacation exception
await calendarManager.addException({
    date: '2024-12-25',
    type: 'HOLIDAY',
    description: 'Christmas Day',
    working_hours: 0
});
```

## Error Handling Examples

```javascript
// Comprehensive error handling
try {
    const result = await apiService.createAction(actionData);
    showSuccess('Action created successfully');
} catch (error) {
    if (error.status === 401) {
        // Authentication error
        authManager.logout();
        window.location.href = '/login.html';
    } else if (error.status === 422) {
        // Validation error
        showValidationErrors(error.details);
    } else {
        // Generic error
        showError('Operation failed: ' + error.message);
    }
}
```

## Complete Workflow Examples

### Creating and Managing a Maintenance Action

```javascript
async function createMaintenanceAction() {
    try {
        // 1. Create the action
        const action = await apiService.createAction({
            title: 'Emergency repair',
            location_id: 1,
            description: 'Critical system failure',
            priority: 1,
            assigned_to: 2,
            estimated_duration: 8.0,
            planned_date: '2024-01-20'
        });

        // 2. Upload photos
        const photoManager = new PhotoManager(action.id);
        await photoManager.init();
        
        // 3. Calculate end date
        await apiService.calculateEndDate(action.id);

        // 4. Refresh action list
        if (window.actionsList) {
            await window.actionsList.refresh();
        }

        return action;
    } catch (error) {
        console.error('Failed to create action:', error);
        throw error;
    }
}
```

### Setting Up User Work Schedule

```javascript
async function setupUserSchedule(userId) {
    const schedule = {
        1: { hours: 8, start: '08:00', end: '17:00' }, // Monday
        2: { hours: 8, start: '08:00', end: '17:00' }, // Tuesday
        3: { hours: 8, start: '08:00', end: '17:00' }, // Wednesday
        4: { hours: 8, start: '08:00', end: '17:00' }, // Thursday
        5: { hours: 8, start: '08:00', end: '17:00' }, // Friday
        6: { hours: 0, start: '', end: '' },           // Saturday
        0: { hours: 0, start: '', end: '' }            // Sunday
    };

    await apiService.updateUserCalendar(userId, schedule);
}
```

This guide provides practical examples for common GMAO operations and workflows.