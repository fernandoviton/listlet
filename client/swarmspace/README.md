# SwarmSpace Multi-User Support

This document describes the multi-user architecture for SwarmSpace, enabling multiple users to collaborate on the same session without data loss.

## Problem

The original implementation used raw PUT of the entire document. When User A and B edit simultaneously, B's save would overwrite A's changes, causing data loss.

## Solution

### Atomic Operations with Optimistic Locking

The API supports atomic operations with ETag-based optimistic locking:

1. **POST** - Atomically append an item to an array
2. **DELETE** - Atomically remove an item from an array by ID
3. **PATCH** - Atomically update a single field (added in Phase 2)

All atomic operations:
- Read the current document with its ETag
- Apply the change
- Write back with `If-Match: <etag>` condition
- Return HTTP 409 (Conflict) if the document changed since read
- Client retries automatically with exponential backoff

### Sync Polling for Readers

For users who are primarily reading (not actively editing), the client polls for updates:
- **Active polling**: Every 15 seconds for the first 5 minutes of inactivity
- **Paused state**: After 5 minutes, polling pauses to save resources
- **Manual refresh**: Users can click the sync indicator to refresh and resume

## Files

### `sync.js`
Sync polling module that handles:
- Automatic polling every 15 seconds
- Pause after 5 minutes of inactivity
- Manual refresh capability
- Activity reset on user actions

### `swarmspace.js` (modified)
Updated handlers to use atomic operations:
- `handleAddWeek()` - Uses `api.appendItem('weeks', newWeek)`
- `handleSaveComment()` - Uses `api.appendItem()` with computed comment path
- `handleSaveCompletion()` - Uses `api.appendItem()` for completions
- `handleSaveResource()` - Uses `api.appendItem('resources', resource)`
- `handleSaveLocation()` - Uses `api.appendItem('locations', location)`
- `handleSaveName()` - Uses `api.appendItem('names', nameEntry)`
- Delete handlers use `api.deleteItem()` for respective arrays

### All Operations Now Atomic (Phase 2)
As of Phase 2, ALL operations use atomic methods:

**Using PATCH:**
- Metadata (title, setting)
- Event text (scribe editing the card text)
- Action type changes (discussion/discovery/project)
- Current week marker
- Project setup (modifies existing week action)

**Using POST (append):**
- Import (uses multiple atomic appends)
- Adding weeks, comments, completions, resources, locations, names

**Restricted:**
- `startingWeek` - Can only be changed when session has <= 1 week

**Removed:**
- `scheduleSave()` and `saveSession()` have been removed
- Full document PUT is only used for initial document creation

## API Endpoints

### POST `/api/tasks/{listName}`
Append an item to an array.

**Request:**
```json
{
  "path": "weeks.0.event.comments",
  "value": { "id": "abc123", "text": "My comment" }
}
```

**Response (200):**
```json
{
  "success": true,
  "data": { /* full document */ }
}
```

**Response (409 Conflict):**
```json
{
  "error": "Conflict, please retry"
}
```

### DELETE `/api/tasks/{listName}`
Remove an item from an array by ID.

**Request:**
```json
{
  "path": "resources",
  "id": "abc123"
}
```

**Response:** Same as POST

### PATCH `/api/tasks/{listName}`
Update a single field atomically.

**Request:**
```json
{
  "path": "weeks.0.event.text",
  "value": "Updated event text"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": { /* full document */ }
}
```

**Response (409 Conflict):**
```json
{
  "error": "Conflict, please retry"
}
```

## Client API (`api.js`)

### `api.appendItem(path, value, maxRetries = 3)`
Atomically append an item to an array. Retries automatically on conflict.

### `api.deleteItem(path, id, maxRetries = 3)`
Atomically remove an item by ID. Retries automatically on conflict.

### `api.patchItem(path, value, maxRetries = 3)`
Atomically update a single field at the given path. Retries automatically on conflict.

All methods return the full document after the operation, allowing the client to sync its local state.

## UI Indicators

### Sync Status
A sync status indicator appears in the bottom-right corner:
- **Green "Synced"**: Auto-syncing every 15 seconds
- **Orange "Sync paused"**: Inactive for 5+ minutes, click to refresh

### Error Display
When an atomic operation fails (after all retries exhausted), a red error banner appears at the bottom of the screen for 5 seconds.

**Important**: Atomic operations do NOT fall back to full PUT on failure. Falling back to a full PUT could silently overwrite other users' changes, causing data loss. Instead, the user is notified and can retry manually.

**Note**: As of Phase 2, `scheduleSave()` and `saveSession()` have been completely removed from the codebase. All operations now use atomic methods (POST/DELETE/PATCH).

## Export/Import

SwarmSpace supports two export formats:

- **Export Markdown** — Human/LLM-readable summary of the full session (weekly log, resources, locations, names, projects)
- **Export for Import** — Structured JSON designed for importing into a new session

### JSON Export Schema

```json
{
  "version": "1.0",
  "exportType": "swarmspace-import",
  "startingWeekNumber": 6,
  "resources": [{ "name": "Water", "status": "scarce" }],
  "locations": [{ "name": "Village", "distance": "2 days", "notes": "Friendly" }],
  "names": [{ "name": "Alice", "description": "Leader", "group": "Villagers" }],
  "unfinishedProjects": [{ "name": "Walls", "remaining": 2 }]
}
```

### Import Behavior

- Import accepts JSON from "Export for Import" only
- Imports: resources, locations, names (with groups), unfinished projects as completion entries
- Duplicates (by name, case-insensitive) are skipped
- `startingWeekNumber`: new session weeks start from where the old session left off (default: last week + 1). When creating weeks for imported projects, the first week uses this number.

## Testing

### Running Tests

```bash
cd api
npm install
npm test
```

### Test Coverage

Client-side store tests in `client/swarmspace/swarmspace-store.test.js` covering:
- Markdown import parsing (resources, locations, names with groups, unfinished projects)
- JSON import validation (format, version, required fields, invalid statuses)
- Export/import roundtrips (markdown and JSON)

```bash
# Client store tests
npx --prefix api jest --config '{}' --rootDir . client/swarmspace/swarmspace-store.test.js
```

The API has comprehensive tests in `api/tasks/index.test.js` covering:

- **Configuration**: Missing/invalid environment variables
- **CORS**: Preflight request handling
- **GET**: Document fetch, 404 handling
- **PUT**: Full document replacement
- **POST (Append)**: Top-level arrays, nested arrays, validation, conflict handling
- **DELETE (Remove)**: By ID, nested paths, validation, not found, conflict handling
- **PATCH (Update)**: Top-level fields, nested fields, object fields, validation, conflict handling
- **Path Navigation**: Various path patterns (`resources`, `weeks.0.event.comments`, etc.)
- **Integration**: Concurrent users, full workflow scenarios

### Example Test Output

```
PASS tasks/index.test.js
  API Configuration
    √ returns 500 if BLOB_SAS_URL is not configured
    √ returns 500 if BLOB_SAS_URL is invalid
  CORS Handling
    √ OPTIONS request returns 204 with CORS headers
  GET - Fetch Session
    √ returns session document
    √ returns 404 if session does not exist
  PUT - Replace Session
    √ replaces entire session document
  POST - Atomic Append
    √ appends week to weeks array
    √ appends comment to week event
    √ returns 409 on ETag mismatch (conflict)
    ...
  DELETE - Atomic Remove
    √ removes resource by id
    √ removes comment from week event
    √ returns 409 on ETag mismatch (conflict)
    ...
  PATCH - Update single field
    √ should update a top-level field
    √ should update a nested field
    √ should update an object field
    √ should return 409 on ETag mismatch
    √ should return 400 for invalid path
    ...
  Integration Scenarios
    √ concurrent users adding comments to same event
    √ full SwarmSpace session workflow

Tests: 40 passed
```

## Manual Verification

1. **Conflict handling**: Open two browser tabs, rapidly add comments from both, verify none are lost
2. **Retry logic**: Check network tab for 409 responses and successful retries
3. **Sync polling**: Leave tab idle, verify polling stops after 5 min, shows paused UI
4. **Manual refresh**: Click sync indicator when paused, verify data refreshes
5. **PATCH operations**: Edit event text, change action type, verify atomic PATCH calls (no PUT)
6. **startingWeek restriction**: Add 2+ weeks, verify startingWeek input becomes disabled
7. **Resources**: Verify resources can only be added/deleted, not edited
8. **No PUT calls**: After initial load, verify no PUT requests in Network tab (only GET/POST/DELETE/PATCH)
