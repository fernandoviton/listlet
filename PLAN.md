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

## Phase 3: Refactor to Router Architecture (Next)

### Purpose
Separate routing logic from the task list UI to prepare for multiple pages (home, tasks, future templates).

### Current Structure
```
index.html  → Everything (routing + task list UI)
```

### New Structure
```
index.html  → Lightweight router only
tasks.html  → Task list SPA (moved from index.html)
home.html   → Future: landing page
```

### Router Logic (`index.html`)
```javascript
// index.html - Router
(function() {
    const params = new URLSearchParams(window.location.search);
    const list = params.get('list');
    
    if (list) {
        // Has list param → go to task list
        window.location.replace(`tasks.html?list=${encodeURIComponent(list)}`);
    } else {
        // No list param → go to home page
        window.location.replace('home.html');
    }
})();
```

### URL Flow After Refactor
```
User visits index.html?list=xyz
    ↓
Router redirects to tasks.html?list=xyz
    ↓
Task list loads

User visits index.html (no param)
    ↓
Router redirects to home.html
    ↓
Home page loads (or "coming soon" placeholder)
```

### Changes Required

#### 1. Create `tasks.html`
- Copy all content from current `index.html`
- Keep the `?list=` parameter handling
- This becomes the task list SPA

#### 2. Replace `index.html` with Router
- Minimal HTML, just the routing JavaScript
- No UI, immediate redirect

#### 3. Create `home.html` Placeholder
- Simple "Coming Soon" or "Create List" stub
- Will be expanded in Phase 4

### Files to Create
- `tasks.html` - Task list SPA (moved from index.html)
- `home.html` - Placeholder for home page

### Files to Modify
- `index.html` - Replace with router logic

### Benefits
- Clean separation of concerns
- Easy to add new pages/templates
- Direct links to `tasks.html?list=xyz` still work
- `index.html` becomes the "smart entry point"

---

## Phase 4: Home Page (Future)

### Purpose
Entry point for creating new lists and accessing recent ones.

### Features
- **Create New List** button → generates random ID (e.g., `x7k2m9p3`), redirects to `?list={id}`
- **Recent Lists** → stored in localStorage, displayed as quick links
- **Optional**: Enter custom list name

### URL Flow
```
User visits index.html (no ?list=)
    ↓
Redirect to home.html
    ↓
User clicks "Create New List"
    ↓
Generate random ID: "x7k2m9p3"
    ↓
Redirect to index.html?list=x7k2m9p3
    ↓
API auto-creates empty list
```

### Files to Create
- `home.html` - New home page

### Files to Modify  
- `index.html` - Add redirect when no `?list=` param

---

## Phase 5: Meal Board Template (Future)

### Purpose
A specialized view for meal planning/tracking (details TBD).

### Files
- `tasks.html` - Task list UI (current)
- `meals.html` - Meal board UI (new)

### URL Format
```
index.html?list=xyz                    → default (tasks.html)
index.html?list=xyz&template=meals     → meal board
meals.html?list=xyz                    → direct link to meal board
```

### Implementation
- Separate HTML file (`meals.html`)
- Uses same API and data format as tasks
- Router handles optional `&template=` param
- Details TBD

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

### Now (Phases 1-2)
1. Update frontend to read `?list=` parameter
2. Update API calls to use dynamic list name  
3. Display list name in UI
4. Add auto-create in Azure Function
5. Handle missing `?list=` (temporary: show message)
6. Test & Deploy

### Next (Phase 3)
7. Create `tasks.html` from current `index.html`
8. Replace `index.html` with router
9. Create `home.html` placeholder
10. Test & Deploy

### Later (Phases 4-6)
11. Build out home page (create list, recent lists)
12. Build meal board template
13. Implement basic auth (tokens)

---

## Security Considerations

- **List enumeration**: No API to list all lists (prevents discovery)
- **Random IDs**: Home page generates sufficiently random IDs (8+ chars, alphanumeric)
- **Rate limiting**: Consider Azure Function rate limits for abuse prevention
- **Input validation**: Sanitize list names (alphanumeric, hyphens, max 64 chars)
- **Token storage**: Edit tokens should be shown once, stored by user (like API keys)

---

## Testing Checklist

### Phase 1-2
- [ ] `index.html` (no param) → shows "no list specified" message
- [ ] `index.html?list=grocery` → loads/creates "grocery" list
- [ ] `index.html?list=x7k2m9p3` → loads/creates random ID list
- [ ] Adding tasks saves to correct list
- [ ] Different browser tabs can have different lists open
- [ ] Page title shows list name
- [ ] List name displayed in header

### Phase 3
- [ ] `index.html` (no param) → redirects to `home.html`
- [ ] `index.html?list=xyz` → redirects to `tasks.html?list=xyz`
- [ ] `tasks.html?list=xyz` → loads task list correctly
- [ ] Direct links to `tasks.html?list=xyz` work
- [ ] `home.html` shows placeholder message

### Phase 4
- [ ] `home.html` → shows create button and recent lists
- [ ] Create button → generates random ID, redirects correctly
- [ ] Recent lists stored in localStorage

### Phase 5
- [ ] `meals.html?list=xyz` → loads meal board view
- [ ] `index.html?list=xyz&template=meals` → redirects to meal board
- [ ] Meal board uses same API/data format as tasks

### Phase 6
- [ ] Create list returns edit token
- [ ] PUT without token → 401
- [ ] GET on public list → works without token
- [ ] GET on private list without token → 401
