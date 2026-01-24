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

### Goal
Track recently visited lists in localStorage and display on home page.

### Data Model (localStorage)
```js
// Key: 'recentLists'
// Value: Array of recent lists, most recent first (max 10)
[
  { id: "abc123", lastAccessed: 1706123456789 },
  { id: "x7k2m9p3", lastAccessed: 1706123000000 }
]
```

### Implementation

**1. Track visits (in tasks page)**
- When tasks page loads successfully, call `addToRecentLists(listName)`
- Adds/updates entry in localStorage array
- Keep max 10 entries, sorted by lastAccessed

**2. Display on home page**
- Read from localStorage on page load
- Show "Recent Lists" section below create button
- Each item is clickable link to `/tasks/?list={id}`
- Show relative time ("2 hours ago", "yesterday")
- "Clear" button to remove history

**3. Files to modify**
- `client/shared/utils.js` - add `addToRecentLists()`, `getRecentLists()`, `clearRecentLists()`
- `client/tasks/tasks.js` - call `addToRecentLists()` on successful load
- `client/home/index.html` - display recent lists section

### Testing Checklist
- [ ] Visit a list → appears in recent lists on home page
- [ ] Visit multiple lists → ordered by most recent
- [ ] More than 10 lists → oldest dropped
- [ ] Clear button removes all recent lists
- [ ] Recent lists persist across browser sessions

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

## Phase 6: Migrate to Azure Static Web Apps (Future)

### Goal
Migrate from Azure Storage static website + separate Azure Function to Azure Static Web Apps. No functional changes - just infrastructure.

### Why Migrate
| Feature | Azure Storage Static Site (current) | Azure Static Web Apps |
|---------|-------------------------------------|----------------------|
| Hosting | Blob container serves files | Dedicated static hosting |
| Auth | None built-in | Built-in (GitHub, Google, Microsoft) |
| Functions | Separate Azure Function app | Integrated in same project |
| Cost | ~$1/month | Free tier available |
| Deploy | Manual / separate | GitHub Actions auto-deploy |

### Current Architecture
```
checklist-spa/
├── client/           → deployed to Azure Storage static site
│   ├── index.html
│   ├── home/
│   ├── tasks/
│   └── shared/
└── azure-function/   → deployed to separate Azure Function App
    └── TasksApi/
```

### Target Architecture
```
checklist-spa/
├── client/                      → Static Web App serves this
│   ├── index.html
│   ├── home/
│   ├── tasks/
│   ├── shared/
│   └── staticwebapp.config.json → routing + future auth config
└── api/                         → Integrated Azure Functions
    ├── tasks/
    │   └── index.js
    ├── host.json
    └── package.json
```

### Implementation Steps

**1. Restructure project**
- Rename `azure-function/` → `api/`
- Move `TasksApi/` → `api/tasks/` (SWA uses folder-based routing)
- Update function bindings if needed

**2. Add Static Web Apps config**
- Create `client/staticwebapp.config.json`:
```json
{
  "navigationFallback": {
    "rewrite": "/index.html"
  },
  "routes": [
    { "route": "/api/*", "allowedRoles": ["anonymous"] }
  ]
}
```

**3. Create Azure Static Web App resource**
- In Azure Portal: Create → Static Web App
- Connect to GitHub repo
- Set app location: `/client`
- Set API location: `/api`
- Set output location: (empty, no build step)

**4. Update client config**
- Change `CONFIG.API_BASE` from full URL to `/api/tasks`
- SWA proxies `/api/*` to the integrated functions

**5. Environment variables**
- Move `BLOB_SAS_URL` and `BLOB_CONTAINER_NAME` to SWA app settings
- Remove old Function App after confirming SWA works

**6. DNS / Custom domain (if applicable)**
- Update DNS to point to new SWA endpoint
- Or keep using SWA's auto-generated URL

### Files to Create/Modify
- Create: `client/staticwebapp.config.json`
- Move: `azure-function/` → `api/`
- Modify: `api/tasks/function.json` (update route if needed)
- Modify: `client/config.js` (change API_BASE)
- Delete (after migration): old Azure Function App, Storage static site

### Testing Checklist
- [ ] SWA deploys from GitHub push
- [ ] Home page loads at SWA URL
- [ ] Create new list works
- [ ] Add/edit/delete tasks works
- [ ] Existing lists accessible via `?list=` param

---

## Phase 7: Authentication (Future)

### Goal
Add login requirement for write access using Azure Static Web Apps built-in auth.

### Auth Model
- **Read (GET)**: Always public, no login required
- **Write (PUT)**: Requires authenticated user

### How SWA Auth Works
- Built-in providers: GitHub, Google, Microsoft, Twitter
- Login URL: `/.auth/login/{provider}` (e.g., `/.auth/login/github`)
- Logout URL: `/.auth/logout`
- User info: `/.auth/me` returns `{ clientPrincipal: { userId, userDetails, identityProvider } }`
- Functions receive user info in `x-ms-client-principal` header

### Implementation

**1. Configure allowed providers**
Update `staticwebapp.config.json`:
```json
{
  "auth": {
    "identityProviders": {
      "github": { "registration": { "clientId": "..." } }
    }
  },
  "routes": [
    { "route": "/api/tasks/*", "methods": ["GET"], "allowedRoles": ["anonymous"] },
    { "route": "/api/tasks/*", "methods": ["PUT"], "allowedRoles": ["authenticated"] }
  ]
}
```

**2. Add login UI to client**
- Show "Login to edit" button when not authenticated
- After login, show user info + logout button
- Check `/.auth/me` on page load to get auth state

**3. Update API (optional enhancements)**
- Read `x-ms-client-principal` header to get user ID
- Store list ownership: `{listName}-meta.json` with `{ owner: "github|12345" }`
- Only allow owner to edit (or allow all authenticated users initially)

### Ownership Model Options

**Option A: Any authenticated user can edit any list**
- Simplest to implement
- Good for collaborative/shared lists
- Just check `allowedRoles: ["authenticated"]` in route config

**Option B: Only owner can edit**
- Store owner ID when list is created
- API checks `x-ms-client-principal.userId === meta.owner`
- Requires metadata file per list

**Recommendation**: Start with Option A, add ownership later if needed.

### Data Model (for Option B, future)
```json
// {listName}-meta.json
{
  "created": "2026-01-23T...",
  "owner": "github|12345678"
}
```

### Files to Modify
- `client/staticwebapp.config.json` - add route auth rules
- `client/shared/auth.js` (new) - `getUser()`, `isLoggedIn()`, `loginUrl()`, `logout()`
- `client/tasks/index.html` - show login button, disable edit when not logged in
- `client/home/index.html` - show login status
- `api/tasks/index.js` - (Option B only) check ownership

### Testing Checklist
- [ ] Can view list without logging in
- [ ] Cannot save changes without logging in
- [ ] Login with GitHub works
- [ ] After login, can save changes
- [ ] Logout works
- [ ] User info displayed correctly

---

## Implementation Order

### Completed
- ✅ Phase 1: URL parameter support
- ✅ Phase 2: Auto-create lists on 404
- ✅ Phase 3: Router architecture + home page + folder reorganization

### Next
- **Phase 4**: Home page enhancements (recent lists)
- **Phase 6**: Migrate to Azure Static Web Apps
- **Phase 7**: Authentication (built-in SWA auth)

### Later
- Phase 5: Meal board template (see PLAN-MEALBOARD.md)

---

## Security Considerations

- **List enumeration**: No API to list all lists (prevents discovery)
- **Random IDs**: Home page generates sufficiently random IDs (8+ chars, alphanumeric)
- **Rate limiting**: Consider Azure Function rate limits for abuse prevention
- **Input validation**: Sanitize list names (alphanumeric, hyphens, max 64 chars)
- **Reserved character**: `~` is reserved for system-generated sub-lists (e.g., `mylist~shopping`)
- **Auth model**: Read is public (anyone with list URL), write requires SWA login
- **SWA auth**: Managed by Azure, tokens handled automatically, no secrets in client code

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

### Phase 4
- [ ] Visit a list → appears in recent lists on home page
- [ ] Visit multiple lists → ordered by most recent
- [ ] More than 10 lists → oldest dropped
- [ ] Clear button removes all recent lists
- [ ] Recent lists persist across browser sessions

### Phase 5 (Later)
- [ ] `meals.html?list=xyz` → loads meal board view
- [ ] `index.html?list=xyz&template=meals` → redirects to meal board
- [ ] Meal board uses same API/data format as tasks

### Phase 6 (SWA Migration)
- [ ] SWA deploys from GitHub push
- [ ] Home page loads at SWA URL
- [ ] Create new list works
- [ ] Add/edit/delete tasks works
- [ ] Existing lists accessible via `?list=` param

### Phase 7 (Auth)
- [ ] Can view list without logging in
- [ ] Cannot save changes without logging in
- [ ] Login with GitHub works
- [ ] After login, can save changes
- [ ] Logout works
- [ ] User info displayed correctly
