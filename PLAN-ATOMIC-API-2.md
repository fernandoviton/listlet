# Atomic API Planning - Phase 2

## Problem Statement
The swarm client has concurrency issues where `scheduleSave()` does a full document PUT for small field changes. This can cause "soft conflicts" where last-writer-wins overwrites other users' atomic changes.

**Goal:** After these changes, there should be NO full PUT operations except initial document creation.

---

## Decisions Made

1. **PATCH Design**: Simple key-value PATCH (matches existing `appendItem` pattern)
2. **startProject**: Split into PATCH (action type) + atomic append (completion)
3. **Resource edits**: Remove edit functionality - append/delete only
4. **Import**: Convert to use atomic appends (currently uses scheduleSave - needs fix)
5. **startingWeek**: Restrict to when weeks.length <= 1, gray out otherwise

---

## Implementation Plan (Tests First)

### Step 1: Write API Tests for PATCH Endpoint

**File: `api/tasks/index.test.js`**

Add tests for PATCH before implementing:
```javascript
describe('PATCH - Update single field', () => {
    it('should update a top-level field', async () => {
        // PATCH { path: 'title', value: 'New Title' }
    });

    it('should update a nested field', async () => {
        // PATCH { path: 'weeks.0.event.text', value: 'Updated event' }
    });

    it('should update an object field', async () => {
        // PATCH { path: 'weeks.0.action', value: { type: 'project', projectName: 'X', projectDuration: 2 } }
    });

    it('should return 409 on ETag mismatch', async () => {
        // Concurrent modification test
    });

    it('should return 400 for invalid path', async () => {
        // Path doesn't exist
    });
});
```

### Step 2: Implement PATCH Endpoint

**Server: `api/tasks/index.js`**
```javascript
// PATCH - Update single field atomically
// Body: { path: 'weeks.0.event.text', value: 'new text' }
// Uses ETag for optimistic locking like POST/DELETE
```

**Client: `client/shared/api.js`**
Add `patchItem(path, value, maxRetries=3)` method mirroring `appendItem` pattern.

### Step 3: Convert Single-Field Operations to PATCH

| Operation | Current | Change To |
|-----------|---------|-----------|
| Event text update | `scheduleSave()` | `api.patchItem('weeks.{idx}.event.text', value)` |
| Action type change | `scheduleSave()` | `api.patchItem('weeks.{idx}.action.type', value)` |
| Set current week | `scheduleSave()` | `api.patchItem('currentWeekId', weekId)` |
| Metadata (title) | `scheduleSave()` | `api.patchItem('title', value)` |
| Metadata (setting) | `scheduleSave()` | `api.patchItem('setting', value)` |

**Note:** `startingWeek` is NOT patched - it's restricted (see Step 7).

### Step 4: Convert startProject to Atomic Operations

Current flow in `handleSaveProject()`:
1. `SwarmSpaceStore.startProject()` - modifies local state
2. `scheduleSave()` - full PUT

New flow:
1. PATCH the action fields: `api.patchItem('weeks.{idx}.action', { type: 'project', projectName, projectDuration })`
2. Create missing weeks if needed: loop `api.appendItem('weeks', newWeek)` for each
3. Append completion to target week: `api.appendItem('weeks.{idx}.completions', completion)`

### Step 5: Convert Import to Atomic Operations

**Current (BROKEN):** Uses `SwarmSpaceStore.upsert*()` then `scheduleSave()` - full PUT

**New flow:**
```javascript
async function handleImport() {
    // ... parse markdown ...

    // Use atomic appends for each item
    for (const resource of resourcesToAdd) {
        await api.appendItem('resources', resource);
    }
    for (const location of locationsToAdd) {
        await api.appendItem('locations', location);
    }
    for (const name of namesToAdd) {
        await api.appendItem('names', name);
    }

    // Refresh from server to get final state
    const updatedDoc = await api.fetchTasks();
    SwarmSpaceStore.setSession(updatedDoc);
    renderAll();
}
```

### Step 6: Remove Resource Edit Functionality

**File: `client/swarmspace/swarmspace.js`**

- Remove `editingResourceId` variable and all references
- Remove the edit path in `handleSaveResource()` (lines 987-990)
- Remove any UI that allows editing existing resources

Resources become strictly: **add new** or **delete**.

### Step 7: Restrict startingWeek

**File: `client/swarmspace/swarmspace.js`**

In the UI initialization or render:
```javascript
const startingWeekInput = document.getElementById('startingWeek');
const session = SwarmSpaceStore.getSession();
if (session.weeks.length > 1) {
    startingWeekInput.disabled = true;
    startingWeekInput.title = 'Cannot change starting week after multiple weeks exist';
} else {
    startingWeekInput.disabled = false;
    startingWeekInput.title = '';
}
```

**Also update:** `handleMetaChange()` to skip startingWeek update if disabled.

### Step 8: Remove scheduleSave/saveSession

After all operations are converted to atomic:
- Remove `scheduleSave()` function
- Remove `saveSession()` function
- Remove `saveTimeout` variable
- Keep PUT only for initial document creation (if blob doesn't exist)

### Step 9: Update Documentation

**File: `PLAN-ATOMIC-API.md`**

Update the "Keep whole-document PUT for" section to reflect phase 2 changes:
- ~~Session metadata~~ → Now uses PATCH
- ~~Current week marker~~ → Now uses PATCH
- ~~Project setup~~ → Now uses PATCH + POST
- ~~Event text~~ → Now uses PATCH

**Add to Migration Path:**
- Phase 2: All remaining PUT operations converted to PATCH
- After phase 2: Only PUT is for initial blob creation

**Create: `PLAN-ATOMIC-API-2.md`**
- Copy of this plan for historical reference

---

## Files Modified

### Server
- `api/tasks/index.js` - Add PATCH endpoint with ETag locking
- `api/tasks/index.test.js` - Add PATCH tests

### Client
- `client/shared/api.js` - Add `patchItem()` method
- `client/swarmspace/swarmspace.js`:
  - Convert `scheduleSave()` calls to `api.patchItem()` for single-field updates
  - Split `handleSaveProject()` into PATCH + append calls
  - Convert `handleImport()` to use atomic appends
  - Remove resource editing functionality
  - Add startingWeek restriction logic
  - Remove `scheduleSave()`, `saveSession()`, `saveTimeout`

### Documentation
- `PLAN-ATOMIC-API.md` - Updated to reflect phase 2 completion
- `PLAN-ATOMIC-API-2.md` - This plan for historical reference

---

## Operations After Changes

| Operation | Method | Atomic? |
|-----------|--------|---------|
| Add week | POST (appendItem) | ✓ |
| Delete week | DELETE (deleteItem) | ✓ |
| Event text | PATCH | ✓ |
| Action type | PATCH | ✓ |
| Set current week | PATCH | ✓ |
| Title/setting | PATCH | ✓ |
| Start project | PATCH + POST | ✓ |
| Add comment | POST | ✓ |
| Delete comment | DELETE | ✓ |
| Add completion | POST | ✓ |
| Delete completion | DELETE | ✓ |
| Add resource | POST | ✓ |
| Delete resource | DELETE | ✓ |
| Add location | POST | ✓ |
| Delete location | DELETE | ✓ |
| Add name | POST | ✓ |
| Delete name | DELETE | ✓ |
| startingWeek | RESTRICTED (only when <= 1 week) | N/A |
| Import | Multiple POSTs | ✓ |
| **Full PUT** | **REMOVED** (only initial create) | N/A |

---

## Verification

1. **Unit tests**: Run `npm test` after each step - tests should pass
2. **Manual testing**:
   - Open two browser tabs
   - Make changes in both (event text, action type, add items)
   - Verify no overwrites occur
   - Verify startingWeek is grayed out after adding 2+ weeks
   - Verify resources can only be added/deleted, not edited
   - Test Import with multiple items
3. **Verify no PUT calls** (except initial create):
   - Open Network tab in DevTools
   - Perform all operations
   - Confirm no PUT requests after initial load

---

## Status: COMPLETED

All steps implemented:
- [x] Step 1: PATCH endpoint tests
- [x] Step 2: PATCH endpoint implementation
- [x] Step 3: Single-field operations converted to PATCH
- [x] Step 4: startProject converted to atomic operations
- [x] Step 5: Import converted to atomic operations
- [x] Step 6: Resource edit functionality removed
- [x] Step 7: startingWeek input restricted
- [x] Step 8: scheduleSave/saveSession removed
- [x] Step 9: Documentation updated
