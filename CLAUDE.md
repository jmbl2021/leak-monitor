# CLAUDE.md - Leak Monitor

This file provides guidance to Claude Code when working with the leak-monitor project.

## Project Overview

**Leak Monitor** is a ransomware victim tracking and intelligence system that monitors breach disclosure data and correlates it with SEC 8-K cybersecurity incident filings.

**Owner:** Jay (GitHub: jmbl2021)
**Repository:** Private (leak-monitor)
**Parent Project:** homelab (jmbl2021/homelab)
**Status:** Active Development - Phase 5 Complete

## Architecture

### Stack

**Backend:**
- FastAPI (async Python web framework)
- PostgreSQL (data persistence)
- SQLAlchemy (ORM with async support)
- Pydantic (data validation)

**Frontend:**
- React 18 + Vite
- Tailwind CSS
- React Router
- Axios (API client)

**Infrastructure:**
- Docker Compose (backend + frontend + postgres)
- Nginx (frontend static serving + API proxy)
- Nginx Proxy Manager (reverse proxy)
- AdGuard DNS (homelab DNS)

### Data Flow

```
RansomLook.io API
    ↓
Backend Polling Service
    ↓
PostgreSQL Database
    ↓ (API)
React Frontend
```

### Network Configuration

- **Domain:** leak-monitor.localdomain
- **NPM Target:** 172.16.0.177:8001
- **Backend Port:** 8001 (localhost)
- **Frontend Port:** 3005 (localhost)
- **Database Port:** 5432 (internal)
- **Networks:**
  - `leak-monitor_default` (internal)
  - `homelab` (external - for NPM connectivity)

**CRITICAL:** Backend container MUST be on both networks for NPM to reach it. See Testing section.

## Directory Structure

```
leak-monitor/
├── CLAUDE.md                  # This file - Project context
├── README.md                  # Project overview
├── docker-compose.yml         # Container orchestration
├── .env                       # Secrets (NOT in git)
├── .env.example               # Template
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py            # FastAPI entry point
│   │   ├── models/
│   │   │   ├── __init__.py    # MUST export all models/enums
│   │   │   ├── orm.py         # SQLAlchemy models
│   │   │   └── schemas.py     # Pydantic schemas
│   │   ├── api/
│   │   │   ├── __init__.py
│   │   │   ├── victims.py     # Victim CRUD + lifecycle
│   │   │   ├── monitors.py    # Monitor management
│   │   │   └── analysis.py    # AI classification, 8-K
│   │   └── core/
│   │       ├── __init__.py
│   │       ├── database.py    # Database operations
│   │       └── config.py      # Settings
│   └── tests/
│       └── run_tests.sh
├── frontend/
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── index.css
│       ├── api/
│       │   ├── client.js      # Axios instance
│       │   ├── victims.js     # Victim API methods
│       │   ├── monitors.js    # Monitor API methods
│       │   └── analysis.js    # Analysis API methods
│       ├── components/
│       │   └── VictimModal.jsx  # Victim detail/edit modal
│       └── pages/
│           ├── Dashboard.jsx
│           ├── Victims.jsx
│           ├── Monitors.jsx
│           └── Analysis.jsx
├── db/
│   ├── init.sql               # Database schema
│   └── migrations/
│       └── 001_add_lifecycle_status.sql
└── docs/
    └── sessions/              # Session documentation (pushed to homelab repo)
```

## Development Phases

### Phase 5: Data Management & UI Enhancements (COMPLETE ✅)

**Completed:** December 24, 2025
**AAR:** `homelab/docs/sessions/session-leak-monitor-phase5-AAR-2025-12-24.md`

**Key Achievements:**
1. ✅ Lifecycle status management (active/flagged/deleted)
2. ✅ VictimModal component for all victim interactions
3. ✅ Soft delete and flagging system
4. ✅ Bulk operations (delete, AI classify)
5. ✅ Group selection dropdown with visual feedback

**Critical Patterns Established:**
- Lifecycle status separation from review status
- SQLAlchemy enum export requirements (models/__init__.py)
- Docker multi-network configuration (leak-monitor_default + homelab)
- React modal component pattern
- Bulk operations pattern (backend + frontend)

## Data Model

### Core Enums

```python
class ReviewStatus(str, Enum):
    PENDING = "pending"      # Not yet reviewed
    REVIEWED = "reviewed"    # Has been classified

class LifecycleStatus(str, Enum):
    ACTIVE = "active"        # Normal visible record
    FLAGGED = "flagged"      # Marked as junk/false positive
    DELETED = "deleted"      # Soft deleted (recoverable)

class CompanyType(str, Enum):
    PUBLIC = "public"
    PRIVATE = "private"
    GOVERNMENT = "government"
    UNKNOWN = "unknown"
```

### Database Tables

**monitors:**
- Tracks ransomware group monitoring tasks
- Polls RansomLook.io API on schedule
- Auto-expires after configurable days

**victims:**
- Individual victim records from ransomware groups
- Enriched with company classification, SEC data
- Supports lifecycle management (active/flagged/deleted)
- Review workflow (pending → reviewed)

## Key Technical Patterns

### 1. SQLAlchemy Enum Export Pattern

**CRITICAL:** When adding new enums or models:

```python
# Step 1: Define in orm.py or schemas.py
class NewEnum(str, Enum):
    VALUE1 = "value1"
    VALUE2 = "value2"

# Step 2: Export from models/__init__.py
from .orm import Base, VictimORM, NewEnum
from .schemas import VictimCreate, NewSchema

__all__ = [
    # ORM
    "NewEnum",      # ADD HERE
    # Schemas
    "NewSchema",    # ADD HERE
    # ... existing exports
]
```

**Why:** ImportError if not exported. Container will fail to start.

### 2. Lifecycle Status Pattern

Used for soft delete + flagging on any data table:

```sql
-- PostgreSQL
CREATE TYPE lifecycle_status AS ENUM ('active', 'flagged', 'deleted');
ALTER TABLE {table} ADD COLUMN lifecycle_status lifecycle_status NOT NULL DEFAULT 'active';
ALTER TABLE {table} ADD COLUMN flag_reason VARCHAR(255);
CREATE INDEX idx_{table}_lifecycle_status ON {table}(lifecycle_status);
```

```python
# SQLAlchemy
lifecycle_status = Column(
    SQLEnum(
        LifecycleStatus,
        name="lifecycle_status",
        create_type=False,
        values_callable=lambda x: [e.value for e in x]  # REQUIRED
    ),
    nullable=False,
    default=LifecycleStatus.ACTIVE
)
```

**Default Query Behavior:** Filter `WHERE lifecycle_status = 'active'`
**Show Hidden:** Add `include_hidden=true` query parameter

### 3. React Modal Component Pattern

All entity detail/edit interactions use a modal pattern:

```javascript
function EntityModal({ entity, onClose, onUpdate }) {
  const [isEditMode, setIsEditMode] = useState(false);
  const [formData, setFormData] = useState({ ...entity });
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    try {
      await api.update(entity.id, formData);
      onUpdate();  // Reload parent data
    } catch (err) {
      alert('Save failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Header, Body, Actions */}
      </div>
    </div>
  );
}
```

**Key Features:**
- Edit mode toggle
- Loading states
- Confirmation dialogs for destructive actions
- Backdrop click to close

### 4. Bulk Operations Pattern

```python
# Backend
@router.post("/bulk-delete")
async def bulk_delete_items(
    item_ids: List[UUID],
    db: AsyncSession = Depends(get_db)
):
    count = await bulk_delete_victims(db, item_ids)
    return {"deleted_count": count}

async def bulk_delete_victims(session: AsyncSession, ids: list[UUID]) -> int:
    stmt = (
        update(VictimORM)
        .where(VictimORM.id.in_(ids))
        .values(lifecycle_status=LifecycleStatus.DELETED)
    )
    result = await session.execute(stmt)
    await session.commit()
    return result.rowcount
```

```javascript
// Frontend
const handleBulkDelete = async () => {
  if (selectedIds.length === 0) return;
  if (!confirm(`Delete ${selectedIds.length} items?`)) return;

  try {
    setLoading(true);
    await api.bulkDelete(selectedIds);
    setSelectedIds([]);
    loadItems();
  } catch (err) {
    alert('Bulk delete failed: ' + err.message);
  } finally {
    setLoading(false);
  }
};
```

## Common Development Tasks

### 1. Adding a New API Endpoint

```python
# backend/app/api/victims.py
@router.post("/{victim_id}/new-action", status_code=status.HTTP_200_OK)
async def new_action(
    victim_id: UUID,
    request: RequestSchema,  # Pydantic model
    db: AsyncSession = Depends(get_db)
):
    # Implement logic
    return {"success": True}
```

```javascript
// frontend/src/api/victims.js
export const victimsApi = {
  // ... existing methods
  newAction: async (id, data) => {
    const response = await api.post(`/victims/${id}/new-action`, data);
    return response.data;
  },
};
```

### 2. Adding a New Database Column

```sql
-- db/migrations/00X_description.sql
ALTER TABLE victims ADD COLUMN new_field VARCHAR(255);
CREATE INDEX idx_victims_new_field ON victims(new_field);
```

```python
# backend/app/models/orm.py
class VictimORM(Base):
    # ... existing columns
    new_field = Column(String(255), nullable=True)
```

```python
# backend/app/models/schemas.py
class Victim(BaseModel):
    # ... existing fields
    new_field: Optional[str] = None
```

### 3. Rebuilding After Code Changes

```bash
# Backend only
cd /home/jay/Documents/leak-monitor
docker compose build backend
docker compose up -d backend
docker compose logs -f backend

# Frontend only
docker compose build frontend
docker compose restart frontend
docker compose logs -f frontend

# Full rebuild
docker compose down
docker compose build
docker compose up -d
docker compose logs -f
```

### 4. Database Migrations

**Fresh Deployment:**
- Edit `db/init.sql` directly
- Remove volume: `docker volume rm leak-monitor_leak_pgdata`
- Restart: `docker compose up -d`

**Existing Deployment:**
- Create migration file in `db/migrations/`
- Apply manually:
  ```bash
  docker exec -i leak-monitor-db psql -U leak_monitor -d leak_monitor < db/migrations/00X_migration.sql
  ```

## Testing

### Integration Testing Prompt

**Location:** `homelab/prompts/test-service.md` (v2.0)

Use the test-service.md prompt for systematic integration testing after deployment or major changes.

**Quick Start:**
```bash
SERVICE=leak-monitor \
CONTAINER=leak-monitor-backend \
DOMAIN=leak-monitor.localdomain \
PORT=8001 \
SCOPE=full \
claude-test
```

**Test Phases:**
1. **Phase 0: Pre-Flight** - REGISTRY, DNS (both AdGuard servers), NPM proxy config
2. **Phase 1: Infrastructure** - Container status, logs, network membership
3. **Phase 2: Network Stack** - DNS resolution, NPM proxy connectivity
4. **Phase 3: API** - Health endpoint, dependencies, core endpoints
5. **Phase 4: Application** - Frontend rendering, database connectivity

**Key Improvements (v2.0):**
- Debt ledger pattern (track issues, stop at 2)
- NPM 502 troubleshooting section
- Docker network validation (prevents most common issue)
- Realistic time estimates (happy path vs with issues)
- Incident management model (Triage → Mitigate → Document → Continue)

### Common Test Issues

**NPM 502 Bad Gateway:**

Root cause: Container not on `homelab` network.

Fix:
```bash
docker network connect homelab leak-monitor-backend
docker network connect homelab leak-monitor-frontend
docker restart nginx-proxy-manager
```

Prevention: Add to docker-compose.yml:
```yaml
networks:
  default:
    name: leak-monitor_default
  homelab:
    external: true

services:
  backend:
    networks:
      - default
      - homelab
```

**ImportError for New Models:**

Fix: Update `backend/app/models/__init__.py`:
```python
from .orm import NewEnum
from .schemas import NewSchema

__all__ = [
    "NewEnum",
    "NewSchema",
    # ... existing
]
```

## Deployment Checklist

### Initial Deployment

- [ ] Update .env with secure passwords
- [ ] Verify REGISTRY.yaml entry in homelab repo
- [ ] Add DNS rewrites to both AdGuard servers
- [ ] Create NPM proxy host (WebSockets enabled)
- [ ] Build and start containers
- [ ] Connect containers to homelab network
- [ ] Run integration tests (test-service.md)
- [ ] Verify frontend loads in browser
- [ ] Test API endpoints via OpenAPI docs

### After Code Changes

- [ ] Pull latest code from git
- [ ] Rebuild affected containers
- [ ] Check container logs for errors
- [ ] Run quick integration tests (localhost access)
- [ ] Test via domain (NPM proxy)
- [ ] Verify no regressions in UI

## Reference Documentation

### Homelab Integration

This project is part of Jay's homelab infrastructure. Key references:

- **homelab/REGISTRY.yaml** - Port allocation, service registry
- **homelab/prompts/test-service.md** - Integration testing prompt (v2.0)
- **homelab/docs/sessions/session-leak-monitor-phase5-AAR-2025-12-24.md** - Phase 5 AAR
- **homelab/docs/technical/MCP-FRAMEWORK.md** - MCP development patterns (not used by leak-monitor but good reference)

### API Documentation

When backend is running:
- **OpenAPI Spec:** http://localhost:8001/docs
- **ReDoc:** http://localhost:8001/redoc

### External APIs

- **RansomLook.io:** https://api.ransomlook.io/docs
- **SEC EDGAR API:** https://www.sec.gov/edgar/sec-api-documentation
- **board-cybersecurity.com:** 8-K filing tracker

## Git Workflow

**ALWAYS pull before push:**
```bash
cd ~/Documents/leak-monitor
git pull --rebase
# make changes
git add .
git commit -m "type: description"
git pull --rebase
git push
```

**Commit Message Format:**
- `feat:` - New feature/capability
- `fix:` - Bug fix
- `docs:` - Documentation
- `chore:` - Maintenance
- `refactor:` - Code restructuring

## Working with Jay

- Prefers pragmatic MVP solutions over complex architectures
- Values measurable outcomes and clear documentation
- Security-conscious decisions (cybersecurity professional)
- Systematic troubleshooting approach (infrastructure → API → application)
- **Test-service.md prompt** used for consistent integration testing
- Session documentation pushed to homelab repo for knowledge retention

## Key Decisions

1. **Lifecycle status separate from review status** - Clean separation of data management vs workflow
2. **Soft delete only** - No hard delete, all data recoverable
3. **Flagged/deleted hidden by default** - Cleaner UX, show via toggle
4. **Modal components for detail views** - Consistent pattern, reduced duplication
5. **Bulk operations** - Efficient for managing test data and cleanup
6. **FastAPI async** - Better performance for I/O-bound operations
7. **PostgreSQL over SQLite** - Better enum support, production-ready
8. **Docker Compose over K8s** - Simpler for single-host deployment
