# SwarmSpace Multi-User Support

This document describes the multi-user architecture for SwarmSpace, enabling multiple users to collaborate on the same session without data loss.

## Problem

The original implementation used raw PUT of the entire document. When User A and B edit simultaneously, B's save would overwrite A's changes, causing data loss.

## Solution

### Atomic Operations with Optimistic Locking

The API now supports atomic POST (append) and DELETE operations with ETag-based optimistic locking:

1. **POST** - Atomically append an item to an array
2. **DELETE** - Atomically remove an item from an array by ID

Both operations:
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

### Single-Writer Operations (still use scheduleSave)
Some operations remain single-writer since they modify existing fields rather than array items:
- Metadata (title, setting, startingWeek)
- Event text (scribe editing the card text)
- Action type changes (discussion/discovery/project)
- Current week marker
- Project setup (modifies existing week action)
- Import (bulk operation)

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

## Client API (`api.js`)

### `api.appendItem(path, value, maxRetries = 3)`
Atomically append an item to an array. Retries automatically on conflict.

### `api.deleteItem(path, id, maxRetries = 3)`
Atomically remove an item by ID. Retries automatically on conflict.

Both methods return the full document after the operation, allowing the client to sync its local state.

## UI Indicators

### Sync Status
A sync status indicator appears in the bottom-right corner:
- **Green "Synced"**: Auto-syncing every 15 seconds
- **Orange "Sync paused"**: Inactive for 5+ minutes, click to refresh

### Error Display
When an atomic operation fails (after all retries exhausted), a red error banner appears at the bottom of the screen for 5 seconds.

**Important**: Atomic operations do NOT fall back to `scheduleSave()` on failure. Falling back to a full PUT could silently overwrite other users' changes, causing data loss. Instead, the user is notified and can retry manually.

## Testing

### Running Tests

```bash
cd api
npm install
npm test
```

### Test Coverage

The API has comprehensive tests in `api/tasks/index.test.js` covering:

- **Configuration**: Missing/invalid environment variables
- **CORS**: Preflight request handling
- **GET**: Document fetch, 404 handling
- **PUT**: Full document replacement
- **POST (Append)**: Top-level arrays, nested arrays, validation, conflict handling
- **DELETE (Remove)**: By ID, nested paths, validation, not found, conflict handling
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
  GET - Fetch Document
    √ returns document content
    √ returns 404 if document does not exist
  PUT - Replace Document
    √ replaces entire document
  POST - Atomic Append
    √ appends item to top-level array
    √ appends item to nested array using dot notation
    √ returns 409 on ETag mismatch (conflict)
    ...
  DELETE - Atomic Remove
    √ removes item from array by id
    √ removes item from nested array
    √ returns 409 on ETag mismatch (conflict)
    ...
  Integration Scenarios
    √ simulates concurrent comment additions
    √ full session workflow

Tests: 27 passed
```

## Manual Verification

1. **Conflict handling**: Open two browser tabs, rapidly add comments from both, verify none are lost
2. **Retry logic**: Check network tab for 409 responses and successful retries
3. **Sync polling**: Leave tab idle, verify polling stops after 5 min, shows paused UI
4. **Manual refresh**: Click sync indicator when paused, verify data refreshes
5. **Single-writer ops**: Edit event text, verify scheduleSave() still works
