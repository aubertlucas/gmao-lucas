# Database Schema Reference

## Overview

The GMAO application uses SQLite as its database with SQLAlchemy ORM for Python. This document provides comprehensive documentation of all database tables, relationships, constraints, and usage patterns.

## Database Configuration

- **Engine**: SQLite
- **ORM**: SQLAlchemy
- **Location**: `/backend/gmao.db`
- **Migrations**: Handled by SQLAlchemy metadata

---

## Entity Relationship Diagram

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│    User     │         │   Action    │         │  Location   │
│             │         │             │         │             │
│ id (PK)     │◄────────┤assigned_to  │         │ id (PK)     │
│ username    │         │ location_id ├────────►│ name        │
│ email       │         │ title       │         │ description │
│ role        │         │ priority    │         │ is_active   │
│ password    │         │ ...         │         │             │
└─────────────┘         └─────────────┘         └─────────────┘
       │                        │
       │                        │
       ▼                        ▼
┌─────────────┐         ┌─────────────┐
│WorkSchedule │         │ActionPhoto  │
│             │         │             │
│ user_id (FK)│         │ action_id   │
│ day_of_week │         │ filename    │
│ working_hrs │         │ file_path   │
│             │         │ thumbnail   │
└─────────────┘         └─────────────┘
       │
       ▼
┌─────────────┐
│CalendarExc. │
│             │
│ user_id (FK)│
│ except_date │
│ except_type │
│ description │
└─────────────┘
```

---

## Table Definitions

### User Table

Stores user accounts with role-based access control.

```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'observer',
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### Fields

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | Integer | Primary Key, Auto-increment | Unique user identifier |
| `username` | String(50) | Unique, Not Null | User login name |
| `email` | String(100) | Unique, Not Null | User email address |
| `password_hash` | String(255) | Not Null | Bcrypt hashed password |
| `role` | Enum | Default: 'observer' | User role (admin, manager, pilot, observer) |
| `is_active` | Boolean | Default: True | Account status |
| `created_at` | DateTime | Default: Now | Account creation timestamp |

#### User Roles

- **admin**: Full system access, user management, system configuration
- **manager**: Action management, reports, configuration access
- **pilot**: Assigned action management, photo uploads, status updates
- **observer**: Read-only access to actions and dashboard

#### Relationships

- **One-to-Many**: User → Actions (as assigned user)
- **One-to-Many**: User → ActionPhotos (as uploader)
- **One-to-Many**: User → WorkSchedules
- **One-to-Many**: User → CalendarExceptions

#### Example Usage

```python
# Create new user
user = User(
    username="john_pilot",
    email="john@company.com",
    password_hash=get_password_hash("secure_password"),
    role="pilot"
)

# Query users by role
pilots = session.query(User).filter(User.role == "pilot").all()
```

### Action Table

Core table storing maintenance actions and tasks.

```sql
CREATE TABLE actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number INTEGER UNIQUE NOT NULL,
    title VARCHAR(200),
    location_id INTEGER REFERENCES locations(id),
    description TEXT,
    comments TEXT,
    assigned_to INTEGER REFERENCES users(id),
    resource_needs TEXT,
    budget_initial FLOAT,
    actual_cost FLOAT,
    priority INTEGER DEFAULT 2,
    estimated_duration FLOAT,
    planned_date DATE,
    check_status VARCHAR(10) DEFAULT 'NON',
    predicted_end_date DATE,
    final_status VARCHAR(10) DEFAULT 'NON',
    completion_date DATE,
    was_overdue_on_completion BOOLEAN DEFAULT FALSE,
    photo_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### Fields

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | Integer | Primary Key | Internal identifier |
| `number` | Integer | Unique, Not Null | User-visible action number |
| `title` | String(200) | | Action title/summary |
| `location_id` | Integer | Foreign Key | Reference to location |
| `description` | Text | | Detailed description |
| `comments` | Text | | Additional comments |
| `assigned_to` | Integer | Foreign Key | Assigned user ID |
| `resource_needs` | Text | | Required resources |
| `budget_initial` | Float | | Initial budget estimate |
| `actual_cost` | Float | | Actual cost incurred |
| `priority` | Integer | Default: 2 | Priority level (1=High, 2=Medium, 3=Low) |
| `estimated_duration` | Float | | Estimated hours to complete |
| `planned_date` | Date | | Planned start date |
| `check_status` | String(10) | Default: 'NON' | Review status (NON, OK) |
| `predicted_end_date` | Date | Calculated | Calculated completion date |
| `final_status` | String(10) | Default: 'NON' | Completion status (NON, OK) |
| `completion_date` | Date | | Actual completion date |
| `was_overdue_on_completion` | Boolean | Default: False | Whether completed late |
| `photo_count` | Integer | Default: 0 | Number of attached photos |
| `created_at` | DateTime | Default: Now | Creation timestamp |
| `updated_at` | DateTime | Auto-update | Last modification timestamp |

#### Status Values

**Check Status:**
- `NON`: Not reviewed/checked
- `OK`: Reviewed and approved

**Final Status:**
- `NON`: Not completed
- `OK`: Completed

**Priority Levels:**
- `1`: High priority (urgent)
- `2`: Medium priority (normal)
- `3`: Low priority (when time allows)

#### Business Rules

1. **Number Assignment**: Automatically assigned incrementally
2. **End Date Calculation**: Based on planned date, duration, and assigned user's schedule
3. **Overdue Detection**: Calculated when final_status changes to 'OK'
4. **Photo Count**: Automatically updated when photos are added/removed

#### Relationships

- **Many-to-One**: Action → User (assigned_to)
- **Many-to-One**: Action → Location
- **One-to-Many**: Action → ActionPhotos

#### Example Usage

```python
# Create new action
action = Action(
    title="Fix heating system",
    location_id=1,
    description="Main heating unit not working",
    assigned_to=5,
    priority=1,
    estimated_duration=8.0,
    planned_date=date(2024, 1, 20),
    budget_initial=500.0
)

# Query high priority actions
urgent_actions = session.query(Action).filter(
    Action.priority == 1,
    Action.final_status == 'NON'
).all()

# Calculate overdue actions
today = date.today()
overdue = session.query(Action).filter(
    Action.predicted_end_date < today,
    Action.final_status == 'NON'
).all()
```

### Location Table

Stores work locations and sites.

```sql
CREATE TABLE locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### Fields

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | Integer | Primary Key | Location identifier |
| `name` | String(100) | Unique, Not Null | Location name |
| `description` | Text | | Location description |
| `is_active` | Boolean | Default: True | Whether location is active |
| `created_at` | DateTime | Default: Now | Creation timestamp |

#### Default Locations

The system initializes with these default locations:
- Luxe
- Forge
- Ancien Luxe
- Parking

#### Relationships

- **One-to-Many**: Location → Actions

#### Example Usage

```python
# Create new location
location = Location(
    name="Building A",
    description="Main office building",
    is_active=True
)

# Get active locations
active_locations = session.query(Location).filter(
    Location.is_active == True
).all()
```

### ActionPhoto Table

Stores metadata for photos attached to actions.

```sql
CREATE TABLE action_photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action_id INTEGER REFERENCES actions(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    thumbnail_path VARCHAR(500),
    file_size INTEGER,
    mime_type VARCHAR(50),
    file_hash VARCHAR(255),
    upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    uploaded_by INTEGER REFERENCES users(id)
);
```

#### Fields

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | Integer | Primary Key | Photo identifier |
| `action_id` | Integer | Foreign Key, Cascade Delete | Associated action |
| `filename` | String(255) | Not Null | Original filename |
| `file_path` | String(500) | Not Null | Server file path |
| `thumbnail_path` | String(500) | | Thumbnail file path |
| `file_size` | Integer | | File size in bytes |
| `mime_type` | String(50) | | MIME type (image/jpeg, etc.) |
| `file_hash` | String(255) | | SHA-256 hash for duplicate detection |
| `upload_date` | DateTime | Default: Now | Upload timestamp |
| `uploaded_by` | Integer | Foreign Key | Uploader user ID |

#### File Organization

Photos are organized in the filesystem as:
```
/uploads
  /photos
    /{action_id}
      /image1.jpg
      /image2.png
  /thumbs
    /{action_id}
      /image1.jpg
      /image2.png
```

#### Features

- **Automatic Compression**: Images are compressed before storage
- **Duplicate Detection**: SHA-256 hashing prevents duplicates
- **Thumbnail Generation**: Automatic thumbnail creation
- **Cascade Deletion**: Photos deleted when action is deleted

#### Relationships

- **Many-to-One**: ActionPhoto → Action
- **Many-to-One**: ActionPhoto → User (uploader)

#### Example Usage

```python
# Create photo record
photo = ActionPhoto(
    action_id=123,
    filename="repair_image.jpg",
    file_path="/uploads/photos/123/repair_image.jpg",
    thumbnail_path="/uploads/thumbs/123/repair_image.jpg",
    file_size=1024576,
    mime_type="image/jpeg",
    file_hash="sha256_hash_here",
    uploaded_by=5
)

# Get photos for action
photos = session.query(ActionPhoto).filter(
    ActionPhoto.action_id == 123
).all()
```

### WorkSchedule Table

Stores user work schedules by day of week.

```sql
CREATE TABLE work_schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    day_of_week INTEGER NOT NULL,
    working_hours FLOAT DEFAULT 8.0,
    is_working_day BOOLEAN DEFAULT TRUE,
    UNIQUE(user_id, day_of_week)
);
```

#### Fields

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | Integer | Primary Key | Schedule identifier |
| `user_id` | Integer | Foreign Key | User reference |
| `day_of_week` | Integer | Not Null | Day (0=Monday, 6=Sunday) |
| `working_hours` | Float | Default: 8.0 | Hours worked on this day |
| `is_working_day` | Boolean | Default: True | Whether user works this day |

#### Day of Week Values

- `0`: Monday
- `1`: Tuesday
- `2`: Wednesday
- `3`: Thursday
- `4`: Friday
- `5`: Saturday
- `6`: Sunday

#### Business Rules

- Each user can have only one schedule entry per day of week
- Default working hours: 8.0 per day
- Used for calculating predicted end dates

#### Relationships

- **Many-to-One**: WorkSchedule → User

#### Example Usage

```python
# Create work schedule for user
schedule = WorkSchedule(
    user_id=5,
    day_of_week=0,  # Monday
    working_hours=8.0,
    is_working_day=True
)

# Get user's weekly schedule
user_schedule = session.query(WorkSchedule).filter(
    WorkSchedule.user_id == 5
).order_by(WorkSchedule.day_of_week).all()
```

### CalendarException Table

Stores calendar exceptions (holidays, vacations, etc.).

```sql
CREATE TABLE calendar_exceptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    exception_date DATE NOT NULL,
    exception_type VARCHAR(20) NOT NULL,
    description VARCHAR(255),
    working_hours FLOAT DEFAULT 0.0,
    UNIQUE(user_id, exception_date)
);
```

#### Fields

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | Integer | Primary Key | Exception identifier |
| `user_id` | Integer | Foreign Key | User reference |
| `exception_date` | Date | Not Null | Exception date |
| `exception_type` | Enum | Not Null | Type of exception |
| `description` | String(255) | | Exception description |
| `working_hours` | Float | Default: 0.0 | Hours worked (for partial days) |

#### Exception Types

- `HOLIDAY`: Public holiday
- `VACATION`: Personal vacation
- `SICK`: Sick leave
- `TRAINING`: Training/conference
- `OTHER`: Other type of exception

#### Business Rules

- Each user can have only one exception per date
- Used in end date calculations to skip non-working days
- Can specify partial working hours for half-days

#### Relationships

- **Many-to-One**: CalendarException → User

#### Example Usage

```python
# Create holiday exception
exception = CalendarException(
    user_id=5,
    exception_date=date(2024, 12, 25),
    exception_type=CalendarExceptionType.HOLIDAY,
    description="Christmas Day",
    working_hours=0.0
)

# Get user exceptions for date range
exceptions = session.query(CalendarException).filter(
    CalendarException.user_id == 5,
    CalendarException.exception_date.between(
        date(2024, 1, 1), 
        date(2024, 12, 31)
    )
).all()
```

---

## Database Indexes

### Recommended Indexes

```sql
-- Performance indexes
CREATE INDEX idx_actions_assigned_to ON actions(assigned_to);
CREATE INDEX idx_actions_location_id ON actions(location_id);
CREATE INDEX idx_actions_priority ON actions(priority);
CREATE INDEX idx_actions_final_status ON actions(final_status);
CREATE INDEX idx_actions_planned_date ON actions(planned_date);
CREATE INDEX idx_actions_predicted_end_date ON actions(predicted_end_date);

CREATE INDEX idx_action_photos_action_id ON action_photos(action_id);
CREATE INDEX idx_action_photos_file_hash ON action_photos(file_hash);

CREATE INDEX idx_work_schedules_user_id ON work_schedules(user_id);
CREATE INDEX idx_calendar_exceptions_user_date ON calendar_exceptions(user_id, exception_date);

CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
```

---

## Common Queries

### Dashboard Statistics

```python
# Total actions count
total_actions = session.query(Action).count()

# Completed actions
completed = session.query(Action).filter(
    Action.final_status == 'OK'
).count()

# Actions by priority
priority_stats = session.query(
    Action.priority,
    func.count(Action.id)
).group_by(Action.priority).all()

# Actions by location
location_stats = session.query(
    Location.name,
    func.count(Action.id)
).join(Action).group_by(Location.name).all()
```

### Overdue Actions

```python
from datetime import date

today = date.today()

# Currently overdue actions
overdue_actions = session.query(Action).filter(
    Action.predicted_end_date < today,
    Action.final_status == 'NON'
).all()

# Actions completed late
completed_late = session.query(Action).filter(
    Action.was_overdue_on_completion == True
).all()
```

### User Work Schedule

```python
def get_user_working_hours(user_id, date_range):
    """Calculate total working hours for user in date range"""
    
    # Get base schedule
    schedule = session.query(WorkSchedule).filter(
        WorkSchedule.user_id == user_id
    ).all()
    
    # Get exceptions
    exceptions = session.query(CalendarException).filter(
        CalendarException.user_id == user_id,
        CalendarException.exception_date.between(
            date_range[0], date_range[1]
        )
    ).all()
    
    # Calculate working hours considering exceptions
    # Implementation depends on business logic
```

### Photo Management

```python
# Get all photos for an action
action_photos = session.query(ActionPhoto).filter(
    ActionPhoto.action_id == action_id
).order_by(ActionPhoto.upload_date.desc()).all()

# Find duplicate photos by hash
duplicate_photos = session.query(ActionPhoto).filter(
    ActionPhoto.file_hash == existing_hash
).all()

# Photos by user
user_photos = session.query(ActionPhoto).filter(
    ActionPhoto.uploaded_by == user_id
).count()
```

---

## Data Validation

### Model Validators

```python
from sqlalchemy.orm import validates

class Action(Base):
    # ... field definitions ...
    
    @validates('priority')
    def validate_priority(self, key, priority):
        if priority not in [1, 2, 3]:
            raise ValueError("Priority must be 1, 2, or 3")
        return priority
    
    @validates('estimated_duration')
    def validate_duration(self, key, duration):
        if duration is not None and duration <= 0:
            raise ValueError("Duration must be positive")
        return duration
    
    @validates('planned_date')
    def validate_planned_date(self, key, planned_date):
        if planned_date and planned_date < date.today():
            raise ValueError("Planned date cannot be in the past")
        return planned_date
```

### Database Constraints

```sql
-- Add check constraints
ALTER TABLE actions ADD CONSTRAINT check_priority 
    CHECK (priority IN (1, 2, 3));

ALTER TABLE actions ADD CONSTRAINT check_estimated_duration 
    CHECK (estimated_duration > 0);

ALTER TABLE actions ADD CONSTRAINT check_budget_positive 
    CHECK (budget_initial >= 0);

ALTER TABLE work_schedules ADD CONSTRAINT check_day_of_week 
    CHECK (day_of_week BETWEEN 0 AND 6);

ALTER TABLE work_schedules ADD CONSTRAINT check_working_hours 
    CHECK (working_hours BETWEEN 0 AND 24);
```

---

## Migration and Maintenance

### Database Initialization

```python
# Create all tables
Base.metadata.create_all(bind=engine)

# Initialize with default data
def initialize_default_data(session):
    # Create admin user
    admin = User(
        username="admin",
        email="admin@example.com",
        password_hash=get_password_hash("admin"),
        role="admin"
    )
    session.add(admin)
    
    # Create default locations
    locations = [
        Location(name="Luxe", is_active=True),
        Location(name="Forge", is_active=True),
        Location(name="Ancien Luxe", is_active=True),
        Location(name="Parking", is_active=True)
    ]
    session.add_all(locations)
    
    session.commit()
```

### Backup and Restore

```bash
# Backup SQLite database
cp backend/gmao.db backup/gmao_$(date +%Y%m%d).db

# Restore from backup
cp backup/gmao_20240115.db backend/gmao.db
```

### Performance Monitoring

```python
# Query performance monitoring
import time
from sqlalchemy import event

@event.listens_for(Engine, "before_cursor_execute")
def receive_before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    context._query_start_time = time.time()

@event.listens_for(Engine, "after_cursor_execute")
def receive_after_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    total = time.time() - context._query_start_time
    if total > 0.1:  # Log slow queries
        print(f"Slow query: {total:.2f}s - {statement[:100]}...")
```

This comprehensive database schema reference provides complete documentation of all tables, relationships, and usage patterns in the GMAO application.