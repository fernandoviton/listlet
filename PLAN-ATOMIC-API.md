# Plan: Atomic Append/Delete API Operations

## Problem

Current GET-modify-PUT pattern has a race condition:

```
User A:  GET(0 comments) ──────────────> PUT(adds "A")
User B:       GET(0 comments) ────────────────> PUT(adds "B")

Result: Only "B" exists. "A" is lost!
```

## Solution

Add server-side atomic operations using Azure Blob ETags for optimistic locking.

## API Changes

### New Endpoints (extend existing `api/tasks/index.js`)

| Method | Path | Body | Description |
|--------|------|------|-------------|
| POST | `/api/tasks/{listName}` | `{ path, value }` | Append value at path |
| DELETE | `/api/tasks/{listName}` | `{ path, id }` | Delete item by id at path |

Existing GET/PUT remain unchanged.

### Request/Response Examples

**Append a comment:**
```javascript
POST /api/tasks/swarmspace
{
  "path": "weeks.0.event.comments",
  "value": { "id": "abc123", "text": "My comment" }
}

// Success: 200 { success: true }
// Conflict: 409 { error: "Conflict, please retry" }
```

**Delete a comment:**
```javascript
DELETE /api/tasks/swarmspace
{
  "path": "weeks.0.event.comments",
  "id": "abc123"
}

// Success: 200 { success: true }
// Conflict: 409 { error: "Conflict, please retry" }
```

## Implementation

### 1. Update `api/tasks/index.js`

```javascript
// Add to CORS headers
'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',

// Add POST handler
else if (req.method === 'POST') {
    const { path, value } = req.body;

    // Download with ETag
    const downloadResponse = await blobClient.download(0);
    const etag = downloadResponse.etag;
    const content = await streamToString(downloadResponse.readableStreamBody);
    const data = JSON.parse(content);

    // Navigate to path and append
    const target = navigateToPath(data, path);
    if (!Array.isArray(target)) {
        context.res = { status: 400, headers, body: JSON.stringify({ error: 'Path must point to array' }) };
        return;
    }
    target.push(value);

    // Upload with If-Match
    const newContent = JSON.stringify(data);
    try {
        await blobClient.upload(newContent, newContent.length, {
            overwrite: true,
            conditions: { ifMatch: etag }
        });
        context.res = { status: 200, headers, body: JSON.stringify({ success: true, data: value }) };
    } catch (e) {
        if (e.statusCode === 412) {
            context.res = { status: 409, headers, body: JSON.stringify({ error: 'Conflict, please retry' }) };
        } else {
            throw e;
        }
    }
}

// Add DELETE handler
else if (req.method === 'DELETE') {
    const { path, id } = req.body;

    // Download with ETag
    const downloadResponse = await blobClient.download(0);
    const etag = downloadResponse.etag;
    const content = await streamToString(downloadResponse.readableStreamBody);
    const data = JSON.parse(content);

    // Navigate to path and remove by id
    const target = navigateToPath(data, path);
    if (!Array.isArray(target)) {
        context.res = { status: 400, headers, body: JSON.stringify({ error: 'Path must point to array' }) };
        return;
    }
    const idx = target.findIndex(item => item.id === id);
    if (idx === -1) {
        context.res = { status: 404, headers, body: JSON.stringify({ error: 'Item not found' }) };
        return;
    }
    target.splice(idx, 1);

    // Upload with If-Match
    const newContent = JSON.stringify(data);
    try {
        await blobClient.upload(newContent, newContent.length, {
            overwrite: true,
            conditions: { ifMatch: etag }
        });
        context.res = { status: 200, headers, body: JSON.stringify({ success: true }) };
    } catch (e) {
        if (e.statusCode === 412) {
            context.res = { status: 409, headers, body: JSON.stringify({ error: 'Conflict, please retry' }) };
        } else {
            throw e;
        }
    }
}

// Helper function
function navigateToPath(obj, path) {
    const parts = path.split('.');
    let current = obj;
    for (const part of parts) {
        if (current === undefined) return undefined;
        // Handle array index
        if (/^\d+$/.test(part)) {
            current = current[parseInt(part, 10)];
        } else {
            current = current[part];
        }
    }
    return current;
}
```

### 2. Update Client `shared/api.js`

Add methods with auto-retry:

```javascript
async appendItem(path, value, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        const response = await fetch(`${baseUrl}/${listName}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path, value })
        });

        if (response.status === 409) {
            // Conflict - retry
            await new Promise(r => setTimeout(r, 100 * (i + 1))); // backoff
            continue;
        }

        if (!response.ok) throw new Error('Failed to append');
        return response.json();
    }
    throw new Error('Max retries exceeded');
},

async deleteItem(path, id, maxRetries = 3) {
    // Similar retry logic...
}
```

### 3. Update SwarmSpace to Use New Methods

Replace direct saves with atomic operations:

```javascript
// Before (race-prone)
SwarmSpaceStore.addComment(weekId, target, text);
scheduleSave(); // saves entire document

// After (atomic)
await api.appendItem(
    `weeks.${weekIndex}.${target}.comments`,
    { id: generateId(), text }
);
```

## Migration Path

1. Deploy API changes (backwards compatible)
2. Update swarmspace client to use atomic operations for:
   - Adding comments
   - Deleting comments
   - Adding completions
   - Deleting completions
   - Adding weeks
   - Adding resources/locations/names
   - Deleting resources/locations/names
3. Keep whole-document PUT for:
   - Session metadata (title, setting, startingWeek)
   - Current week marker
   - Project setup (modifies action fields)
   - Event text (single writer - the scribe)

## Operations to Make Atomic

| Operation | Path Pattern | Priority |
|-----------|--------------|----------|
| Add comment | `weeks.{i}.event.comments` | High |
| Add comment | `weeks.{i}.action.comments` | High |
| Add comment | `weeks.{i}.completions.{j}.comments` | High |
| Delete comment | (same paths) | High |
| Add week | `weeks` | Medium |
| Add completion | `weeks.{i}.completions` | Medium |
| Delete completion | `weeks.{i}.completions` | Medium |
| Add resource | `resources` | Medium |
| Delete resource | `resources` | Medium |
| Add location | `locations` | Low |
| Add name | `names` | Low |

## Testing

1. Open two browser tabs
2. Rapidly add comments from both
3. Verify no comments lost
4. Check 409 retries in network tab
