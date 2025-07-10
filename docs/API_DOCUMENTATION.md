# GMAO - Comprehensive API Documentation

## Table of Contents
1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Backend API Reference](#backend-api-reference)
4. [Frontend Components](#frontend-components)
5. [Database Models](#database-models)
6. [Configuration](#configuration)
7. [Examples](#examples)

## Overview

GMAO (Gestion de Maintenance Assistée par Ordinateur) is a comprehensive maintenance management application built with:

- **Backend**: FastAPI (Python) with SQLite database
- **Frontend**: Vanilla JavaScript with component-based architecture
- **Authentication**: JWT token-based authentication
- **Features**: Action management, photo uploads, dashboard analytics, user management, calendar integration

**Base URL**: `http://frsasrvgmao:8000`
**Interactive Documentation**: Available at `/docs` (Swagger UI)

---

## Authentication

### JWT Token Authentication
All API endpoints (except `/auth/login` and `/auth/register`) require authentication via JWT tokens.

#### Headers Required
```javascript
{
  "Authorization": "Bearer <jwt_token>",
  "Content-Type": "application/json"
}
```

#### User Roles
- **admin**: Full system access, user management
- **manager**: Action management, configuration access
- **pilot**: Assigned action management, photo uploads
- **observer**: Read-only access

---

## Backend API Reference

### Authentication Endpoints

#### POST `/auth/login`
Authenticate user and receive JWT token.

**Request Body:**
```json
{
  "username": "string",
  "password": "string"
}
```

**Response:**
```json
{
  "access_token": "jwt_token",
  "token_type": "bearer",
  "user": {
    "id": 1,
    "username": "admin",
    "email": "admin@example.com",
    "role": "admin",
    "is_active": true,
    "created_at": "2024-01-15T10:30:00"
  }
}
```

#### POST `/auth/register`
Register a new user (admin only).

**Request Body:**
```json
{
  "username": "string",
  "email": "string",
  "password": "string",
  "role": "observer"
}
```

#### GET `/auth/me`
Get current user information.

**Response:**
```json
{
  "id": 1,
  "username": "admin",
  "email": "admin@example.com",
  "role": "admin",
  "is_active": true,
  "created_at": "2024-01-15T10:30:00"
}
```

### Action Management

#### GET `/actions`
Retrieve maintenance actions with optional filtering.

**Query Parameters:**
- `skip` (int): Number of records to skip (pagination)
- `limit` (int): Maximum number of records to return
- `location` (string): Filter by location name
- `status` (string): Filter by status ("OK", "NON")
- `priority` (int): Filter by priority (1=High, 2=Medium, 3=Low)
- `assigned_to` (int): Filter by assigned user ID
- `search` (string): Search in title, description, comments

**Example Request:**
```
GET /actions?priority=1&assigned_to=5&limit=50
```

**Response:**
```json
[
  {
    "id": 1,
    "number": 5,
    "title": "Désherbage Manuel",
    "location_id": 1,
    "description": "Achat outil de jardinage",
    "comments": null,
    "assigned_to": 2,
    "resource_needs": null,
    "budget_initial": null,
    "actual_cost": null,
    "priority": 3,
    "estimated_duration": 9.0,
    "planned_date": "2025-05-21",
    "check_status": "OK",
    "predicted_end_date": "2025-05-21",
    "final_status": "OK",
    "completion_date": "2024-06-19",
    "was_overdue_on_completion": false,
    "photo_count": 0,
    "created_at": "2024-12-07T14:20:46.796875",
    "updated_at": "2024-12-07T14:20:46.796875",
    "location": {
      "id": 1,
      "name": "Forge",
      "description": null,
      "is_active": true,
      "created_at": "2024-12-07T14:20:46.619531"
    },
    "assigned_user": {
      "id": 2,
      "username": "Kevin Fauvel",
      "email": "kevin@example.com",
      "role": "pilot",
      "is_active": true,
      "created_at": "2024-12-07T14:20:46.691406"
    }
  }
]
```

#### POST `/actions`
Create a new maintenance action.

**Request Body:**
```json
{
  "title": "Fix heating system",
  "location_id": 1,
  "description": "Heating not working in building A",
  "assigned_to": 2,
  "priority": 1,
  "estimated_duration": 4.0,
  "planned_date": "2024-01-20",
  "budget_initial": 500.0
}
```

#### GET `/actions/{action_id}`
Get a specific action by ID.

#### PUT `/actions/{action_id}`
Update an entire action.

#### PATCH `/actions/{action_id}/field`
Update a single field in an action (for Excel-like editing).

**Request Body:**
```json
{
  "field": "priority",
  "value": "1"
}
```

#### DELETE `/actions/{action_id}`
Delete an action.

#### POST `/actions/{action_id}/calculate-end-date`
Calculate predicted end date based on pilot's work schedule.

**Response:**
```json
{
  "predicted_end_date": "2024-01-25"
}
```

#### POST `/actions/reorder`
Reorder actions for drag-and-drop functionality.

**Request Body:**
```json
[1, 3, 2, 5, 4]
```

### Photo Management

#### GET `/actions/{action_id}/photos`
Get all photos for an action.

**Response:**
```json
[
  {
    "id": 1,
    "action_id": 5,
    "filename": "image.jpg",
    "file_path": "/uploads/photos/5/image.jpg",
    "thumbnail_path": "/uploads/thumbs/5/image.jpg",
    "file_size": 1048576,
    "mime_type": "image/jpeg",
    "file_hash": "sha256_hash",
    "upload_date": "2024-01-15T10:30:00",
    "uploaded_by": 1,
    "url": "http://frsasrvgmao:8000/uploads/photos/5/image.jpg",
    "thumbnail_url": "http://frsasrvgmao:8000/uploads/thumbs/5/image.jpg",
    "uploader": "admin"
  }
]
```

#### POST `/actions/{action_id}/photos`
Upload photos for an action (multipart/form-data).

**Request:**
```
Content-Type: multipart/form-data
files: [File, File, ...]
```

**Features:**
- Automatic image compression
- Duplicate detection via SHA-256 hashing
- Thumbnail generation
- File size validation

#### DELETE `/actions/{action_id}/photos/{photo_id}`
Delete a specific photo.

### Dashboard

#### GET `/dashboard/stats`
Get comprehensive dashboard statistics.

**Query Parameters:**
- `assigned_to` (int): Filter stats by assigned user

**Response:**
```json
{
  "total_actions": 74,
  "completed_actions": 39,
  "in_progress_actions": 3,
  "overdue_actions": 0,
  "actions_by_priority": {
    "1": 15,
    "2": 25,
    "3": 34
  },
  "actions_by_location": {
    "Forge": 30,
    "Luxe": 25,
    "Ancien Luxe": 19
  },
  "total_budget_initial": 15000.0,
  "total_actual_cost": 12500.0,
  "performance_percentage": 84,
  "completed_on_time": 27,
  "completed_overdue": 15,
  "in_progress_on_time": 18,
  "in_progress_overdue": 11,
  "recent_actions": [...]
}
```

#### GET `/dashboard/alerts`
Get critical/overdue actions requiring attention.

### User Management

#### GET `/users`
Get all users.

**Query Parameters:**
- `role` (string): Filter by user role

#### GET `/users/assignable`
Get users that can be assigned to actions.

#### POST `/users`
Create a new user.

#### GET `/users/{user_id}`
Get specific user details.

#### PUT `/users/{user_id}`
Update user information.

#### DELETE `/users/{user_id}`
Delete a user.

### Configuration

#### GET `/config/locations`
Get all active locations.

#### POST `/config/locations`
Create a new location.

#### GET `/config/all`
Get complete system configuration.

#### POST `/config/save`
Save system configuration.

### Calendar Management

#### GET `/users/{user_id}/calendar`
Get user's work schedule.

#### PUT `/users/{user_id}/calendar`
Update user's work schedule.

#### GET `/calendar/users/{user_id}/exceptions/check`
Check for calendar exceptions on a specific date.

**Query Parameters:**
- `date` (string): Date in YYYY-MM-DD format

### Admin Functions

#### POST `/admin/reset-password`
Reset a user's password (admin only).

**Request Body:**
```json
{
  "user_id": 1,
  "new_password": "new_secure_password"
}
```

#### GET `/admin/storage-info`
Get system storage information.

#### POST `/admin/compress-images`
Batch compress uploaded images.

---

## Frontend Components

### Core Services

#### ApiService
Centralized service for all API communications.

**Usage:**
```javascript
// Get actions with filters
const actions = await apiService.getActions({
  priority: 1,
  assigned_to: 5,
  limit: 50
});

// Create new action
const newAction = await apiService.createAction({
  title: "Fix door",
  location_id: 1,
  priority: 1
});

// Upload photos
await apiService.uploadPhotos(actionId, fileList);
```

**Key Methods:**
- `getActions(filters)` - Retrieve actions with filtering
- `createAction(data)` - Create new action
- `updateAction(id, data)` - Update action
- `updateActionField(id, field, value)` - Update single field
- `uploadPhotos(actionId, files)` - Upload photos
- `getDashboardStats(pilotId)` - Get dashboard statistics
- `getUsers(role)` - Get users by role

#### AuthManager
Handles authentication and session management.

**Usage:**
```javascript
// Login
await authManager.login(username, password);

// Check authentication
if (authManager.isAuthenticated()) {
  // User is logged in
}

// Logout
authManager.logout();

// Get current user
const user = authManager.getCurrentUser();
```

### UI Components

#### ActionsList
Excel-like interface for managing maintenance actions.

**Features:**
- Sortable columns
- Inline editing
- Drag-and-drop reordering
- Filtering and search
- Bulk operations
- Context menus

**Usage:**
```javascript
const actionsList = new ActionsList();
await actionsList.init();
```

#### ActionForm
Modal form for creating/editing actions.

**Features:**
- Form validation
- Date calculations
- User assignment
- Photo upload integration

#### PhotoManager
Component for photo upload and management.

**Features:**
- Drag-and-drop upload
- Image preview
- Compression settings
- Duplicate detection
- Gallery view

**Usage:**
```javascript
const photoManager = new PhotoManager(actionId);
await photoManager.init();
```

#### CalendarManager
Advanced calendar component for work schedules and exceptions.

**Features:**
- Weekly schedule configuration
- Exception management
- Date calculations
- Visual calendar interface

#### ConfigManager
System configuration interface.

**Features:**
- Location management
- User management
- System settings
- Bulk operations

#### Dashboard
Real-time dashboard with statistics and charts.

**Features:**
- KPI cards
- Interactive charts
- Recent actions
- Performance metrics
- Filter by pilot

---

## Database Models

### User
Represents system users with role-based access.

**Fields:**
- `id` (Integer, Primary Key)
- `username` (String, Unique)
- `email` (String, Unique)
- `password_hash` (String)
- `role` (Enum: admin, manager, pilot, observer)
- `is_active` (Boolean)
- `created_at` (DateTime)

**Relationships:**
- `actions` - Assigned maintenance actions
- `photos` - Uploaded photos
- `work_schedules` - Weekly work schedule
- `calendar_exceptions` - Calendar exceptions

### Action
Represents maintenance actions/tasks.

**Fields:**
- `id` (Integer, Primary Key)
- `number` (Integer, Unique) - Display number
- `title` (String)
- `location_id` (Foreign Key to Location)
- `description` (Text)
- `comments` (Text)
- `assigned_to` (Foreign Key to User)
- `resource_needs` (Text)
- `budget_initial` (Float)
- `actual_cost` (Float)
- `priority` (Integer: 1=High, 2=Medium, 3=Low)
- `estimated_duration` (Float, hours)
- `planned_date` (Date)
- `check_status` (String: NON, OK)
- `predicted_end_date` (Date, calculated)
- `final_status` (String: NON, OK)
- `completion_date` (Date)
- `was_overdue_on_completion` (Boolean)
- `photo_count` (Integer)
- `created_at`, `updated_at` (DateTime)

**Relationships:**
- `location` - Associated location
- `assigned_user` - Assigned user
- `photos` - Associated photos

### Location
Represents work locations/sites.

**Fields:**
- `id` (Integer, Primary Key)
- `name` (String, Unique)
- `description` (Text)
- `is_active` (Boolean)
- `created_at` (DateTime)

### ActionPhoto
Represents uploaded photos for actions.

**Fields:**
- `id` (Integer, Primary Key)
- `action_id` (Foreign Key)
- `filename` (String)
- `file_path` (String)
- `thumbnail_path` (String)
- `file_size` (Integer)
- `mime_type` (String)
- `file_hash` (String, SHA-256)
- `upload_date` (DateTime)
- `uploaded_by` (Foreign Key to User)

### WorkSchedule
Represents user work schedules.

**Fields:**
- `id` (Integer, Primary Key)
- `user_id` (Foreign Key)
- `day_of_week` (Integer: 0=Monday, 6=Sunday)
- `working_hours` (Float)
- `is_working_day` (Boolean)

### CalendarException
Represents calendar exceptions (holidays, vacations, etc.).

**Fields:**
- `id` (Integer, Primary Key)
- `user_id` (Foreign Key)
- `exception_date` (Date)
- `exception_type` (Enum: HOLIDAY, VACATION, SICK, TRAINING, OTHER)
- `description` (String)
- `working_hours` (Float)

---

## Configuration

### Environment Setup
The application requires the following setup:

**Backend Dependencies:**
```
fastapi==0.104.1
uvicorn==0.24.0
sqlalchemy==2.0.23
pydantic==2.5.0
python-multipart==0.0.6
Pillow==10.1.0
python-jose==3.3.0
passlib==1.7.4
bcrypt==4.1.2
```

**File Structure:**
```
/backend
  /routes         # API endpoints
  /utils          # Utility functions
  /uploads        # Static file storage
    /photos       # Original photos
    /thumbs       # Thumbnails
  main.py         # FastAPI application
  models.py       # Database models
  schemas.py      # Pydantic schemas
  database.py     # Database configuration

/frontend
  /js
    /components   # UI components
    /utils        # Utility functions
  /css            # Stylesheets
  *.html          # Page templates
```

### Security Configuration
- JWT tokens with configurable expiration
- Password hashing with bcrypt
- Role-based access control
- CORS configuration for cross-origin requests

---

## Examples

### Complete Action Management Flow

```javascript
// 1. Authenticate
await authManager.login('admin', 'password');

// 2. Get current actions
const actions = await apiService.getActions({
  status: 'NON',
  priority: 1
});

// 3. Create new action
const newAction = await apiService.createAction({
  title: 'Emergency repair',
  location_id: 1,
  description: 'Critical system failure',
  priority: 1,
  assigned_to: 2,
  estimated_duration: 8.0,
  planned_date: '2024-01-20',
  budget_initial: 1000.0
});

// 4. Upload photos
const fileInput = document.getElementById('photos');
await apiService.uploadPhotos(newAction.id, fileInput.files);

// 5. Update action status
await apiService.updateActionField(newAction.id, 'check_status', 'OK');

// 6. Mark as completed
await apiService.updateActionField(newAction.id, 'final_status', 'OK');
```

### Dashboard Integration

```javascript
// Get dashboard statistics
const stats = await apiService.getDashboardStats();

// Display KPIs
document.getElementById('total-actions').textContent = stats.total_actions;
document.getElementById('completed').textContent = stats.completed_actions;
document.getElementById('performance').textContent = `${stats.performance_percentage}%`;

// Filter by pilot
const pilotStats = await apiService.getDashboardStats(pilotId);
```

### Photo Management

```javascript
// Initialize photo manager
const photoManager = new PhotoManager(actionId);
await photoManager.init();

// Handle drag-and-drop upload
photoManager.enableDragDrop('#upload-zone');

// Compress before upload
photoManager.setCompressionQuality(0.8);
```

### Calendar Integration

```javascript
// Check user availability
const exception = await apiService.checkUserException(userId, '2024-01-20');
if (exception) {
  console.log(`User not available: ${exception.description}`);
}

// Calculate end date with calendar
await apiService.calculateEndDate(actionId);
```

This documentation provides comprehensive coverage of all public APIs, functions, and components in the GMAO application. For interactive testing, visit the Swagger documentation at `/docs` when the application is running.