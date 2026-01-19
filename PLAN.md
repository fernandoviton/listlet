# Multi-List Support - Implementation Plan

## Current State

- **API**: Supports multiple lists via route `/api/tasks/{listName}` → loads `{listName}.json` from blob storage
- **Frontend**: Reads list name from `?list=` URL param, falls back to `CONFIG.DEFAULT_LIST_NAME`
- **Storage**: Multiple `{listName}.json` files in blob container

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| URL format | `?list=xyz` query param | Simple, works with static hosting, extensible |
| No `?list=` param | Use default list from config | Backward compatible, easy testing |
| List creation | Auto-create on first access | No manual blob uploads needed (Phase 2) |
| List IDs | Any string via `?list=` | Home page generates random IDs, users can also use friendly names |
| Auth | Future phase | Currently public by URL (security through obscurity for random IDs) |

---

## Phase 1: URL Parameter Support ✅ COMPLETE (Jan 2026)

### URL Format
```
https://example.com/index.html?list=grocery     → loads "grocery" list
https://example.com/index.html?list=x7k2m9p3    → loads random ID list
https://example.com/index.html                  → uses DEFAULT_LIST_NAME from config
```

### Implementation Summary

- `getListName()` function parses `?list=` param, falls back to `CONFIG.DEFAULT_LIST_NAME`
- Page title updates to `{listName} - Task List`
- Header displays list name in parentheses
- Config changed: `LIST_NAME` → `DEFAULT_LIST_NAME`

### Files Modified
- [index.html](index.html) - URL parsing via `getListName()`, dynamic title/header
- [config.js](config.js) - Changed `LIST_NAME` to `DEFAULT_LIST_NAME`
- [config.example.js](config.example.js) - Same

---

## Phase 2: Auto-Create Lists ✅ COMPLETE (Jan 2026)

### Current Behavior
- GET on non-existent list returns 404
- Must manually upload JSON to blob storage

### New Behavior
- Client detects 404 → PUTs empty list `[]` → uses empty list
- Enables instant list creation: just visit `?list=anything`

### Implementation Summary
- Client-side approach: `fetchTasks()` handles 404 by creating the list
- API remains RESTful (GET has no side effects)
- Client knows when a list is brand new (could show welcome message in future)

### Files Modified
- [index.html](index.html) - `fetchTasks()` handles 404 → PUT `[]`

---

## Phase 3: Refactor to Router Architecture ✅ COMPLETE (Jan 2026)

### Purpose
Separate routing logic from the task list UI to prepare for multiple pages (home, tasks, future templates).

### New Structure
```
client/
├── index.html              # Router (redirects to /home/ or /tasks/)
├── config.js               # API URL and default list name
├── shared/                 # Shared utilities
│   ├── api.js              # Fetch/save logic
│   ├── utils.js            # escapeHtml, generateListId, getListName
│   └── common.css          # Base styles
├── home/                   # Landing page
│   └── index.html          # Create new list, go to existing
└── tasks/                  # Task list feature
    ├── index.html          # Task list page
    ├── tasks.js            # UI logic
    ├── tasks.css           # Task-specific styles
    ├── task-store.js       # State management
    └── task-mutations.js   # Pure mutation functions
```

### URL Flow
```
/                    → redirects to /home/
/?list=xyz           → redirects to /tasks/?list=xyz
/home/               → landing page (create new list)
/tasks/?list=xyz     → task list
```

### Implementation Summary
- Feature-based folder organization (tasks/, home/, shared/)
- Router in root index.html handles redirects
- Home page has "Create New List" button (generates random ID)
- Shared utilities extracted (api.js, utils.js, common.css)
- Client files moved to `client/` folder (parallel to `azure-function/`)

---

## Phase 4: Home Page Enhancements (Future)

### Current State (from Phase 3)
- ✅ "Create New List" button → generates random ID, redirects to `/tasks/?list={id}`
- ✅ "Go to existing list" form → enter list name, go to it

### Future Enhancements
- **Recent Lists** → stored in localStorage, displayed as quick links
- **List management** → rename, delete, share options

---

## Phase 5: Meal Board Template (Future)

> **📋 Detailed Plan**: [PLAN-MEALBOARD.md](PLAN-MEALBOARD.md)

### Purpose
A specialized view for weekly meal planning with:
- Week-centric calendar view
- Quick meal selection from a `meals.json` database
- Auto-generated prep tasks (when meal metadata specifies)
- On-demand shopping list generation from aggregated ingredients

### Files
- `tasks.html` - Task list UI (current)
- `meals.html` - Meal board UI (new)
- `meals.json` - Meal definitions database (new)

### URL Format
```
index.html?list=xyz                    → default (tasks.html)
index.html?list=xyz&template=meals     → meal board
meals.html?list=xyz                    → direct link to meal board
```

### Key Features
1. **Meal Assignment**: Pick meals from database, assign to days
2. **Prep Tasks**: Auto-created when meal has prep metadata
3. **Shopping List**: Button to generate aggregated shopping list; toggles to View/Remove when list exists

### Implementation
- Separate HTML file (`meals.html`)
- Uses same API and data format as tasks
- Router handles optional `&template=` param
- See [PLAN-MEALBOARD.md](PLAN-MEALBOARD.md) for full details

---

## Phase 6: Authentication (Future)

### Goals
- Protect lists so only authorized users can view/edit
- Support sharing with specific people or making lists public

### Options to Consider

#### Option A: Azure AD B2C / Entra ID
- **Pros**: Enterprise-grade, integrates with Azure Functions, supports social logins
- **Cons**: Complex setup, may be overkill for simple app
- **Use when**: Need organizational accounts or enterprise features

#### Option B: Simple Token-Based
- **Pros**: Simple to implement, no external dependencies
- **Cons**: Less secure, manual token management
- **Implementation**:
  - Each list has an optional `editToken` and `viewToken`
  - Store in list metadata or separate blob
  - Pass token in header or query param: `?list=xyz&token=abc123`
  - API validates token before allowing access

#### Option C: Azure Static Web Apps Auth
- **Pros**: Built-in auth providers (GitHub, Twitter, etc.), easy setup
- **Cons**: Requires migrating to Azure Static Web Apps
- **Use when**: Want simple social login without complexity

#### Option D: Passwordless / Magic Links
- **Pros**: Great UX, no passwords to remember
- **Cons**: Requires email service setup
- **Implementation**:
  - User enters email to create/access list
  - Send magic link with temporary token
  - Token grants access for session

### Recommended Approach for This App
**Option B (Simple Token-Based)** for MVP:
1. When creating a list, generate an `editToken`
2. Store: `{listName}-meta.json` with `{ editToken: "xxx", created: "...", public: false }`
3. Read-only access: Allow GET without token if `public: true`
4. Edit access: Require `Authorization: Bearer {editToken}` header

Later, can layer on Option C or D for better UX.

### Data Model Changes
```json
// {listName}-meta.json (new file per list)
{
  "created": "2026-01-18T...",
  "editToken": "abc123def456",
  "public": false,
  "owner": "optional-email@example.com"
}
```

### API Changes
- New endpoint: `POST /api/lists` - Create list with token, return token to user
- Modify: `GET /api/tasks/{listName}` - Check public flag or require token
- Modify: `PUT /api/tasks/{listName}` - Always require edit token

---

## Implementation Order

### Completed
- ✅ Phase 1: URL parameter support
- ✅ Phase 2: Auto-create lists on 404
- ✅ Phase 3: Router architecture + home page + folder reorganization

### Next (Phase 5)
- Build meal board template (see PLAN-MEALBOARD.md)

### Later (Phase 6)
- Implement basic auth (tokens)

---

## Security Considerations

- **List enumeration**: No API to list all lists (prevents discovery)
- **Random IDs**: Home page generates sufficiently random IDs (8+ chars, alphanumeric)
- **Rate limiting**: Consider Azure Function rate limits for abuse prevention
- **Input validation**: Sanitize list names (alphanumeric, hyphens, max 64 chars)
- **Reserved character**: `~` is reserved for system-generated sub-lists (e.g., `mylist~shopping`)
- **Token storage**: Edit tokens should be shown once, stored by user (like API keys)

---

## Testing Checklist

### Phase 1-2 ✅
- [x] `/?list=grocery` → loads/creates "grocery" list
- [x] `/?list=x7k2m9p3` → loads/creates random ID list
- [x] Adding tasks saves to correct list
- [x] Different browser tabs can have different lists open
- [x] Page title shows list name
- [x] List name displayed in header

### Phase 3 ✅
- [x] `/` (no param) → redirects to `/home/`
- [x] `/?list=xyz` → redirects to `/tasks/?list=xyz`
- [x] `/tasks/?list=xyz` → loads task list correctly
- [x] `/home/` → shows create button and direct access form
- [x] Create button → generates random ID, redirects correctly

### Phase 4 (Future)
- [ ] Recent lists stored in localStorage
- [ ] Recent lists displayed on home page

### Phase 5
- [ ] `meals.html?list=xyz` → loads meal board view
- [ ] `index.html?list=xyz&template=meals` → redirects to meal board
- [ ] Meal board uses same API/data format as tasks

### Phase 6
- [ ] Create list returns edit token
- [ ] PUT without token → 401
- [ ] GET on public list → works without token
- [ ] GET on private list without token → 401
