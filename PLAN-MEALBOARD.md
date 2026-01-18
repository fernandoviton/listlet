# Meal Board Template - Implementation Plan

> **Parent Plan**: [PLAN.md](PLAN.md) (Phase 5)

## Overview

A specialized template for weekly meal planning that integrates with the existing task list infrastructure. The meal board provides a week-focused view with quick meal selection from a predefined menu, automatic generation of prep tasks, and on-demand shopping list creation.

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Meals per day | 1 | Simplicity; dinner-focused |
| Prep task scheduling | Weekend (Sat/Sun) | Predictable prep time |
| Prep task lifecycle | Auto-delete with meal | Keeps data clean |
| Shopping list storage | Separate sub-list (`~shopping`) | Reuses existing task UI |
| Reserved character | `~` (tilde) | URL-safe, rarely used in names |
| Task structure | Unchanged | Use existing `name`, `status`, `tags` fields |
| Ingredient format | Freeform in task name | No aggregation, simple |

---

## Core Concepts

### Week-Centric View
- Primary focus: **Next week** (Monday-Sunday)
- **Weekend (Sat/Sun) shown at TOP** for prep visibility
- Quick navigation to current week or other weeks
- Each day shows one assigned meal (dinner)

### Meals Database (`meals.json`)
- Hardcoded/uploaded file with meal metadata
- Shared across all lists (not per-list)

### Task Integration
- Meals generate tasks in the underlying task list
- Shopping list: Created on-demand via button → separate `{listName}~shopping` list
- Prep tasks: Auto-created when meal is assigned (if meal has prep metadata)
- Prep tasks: Auto-deleted when meal is removed

---

## Data Models

### `meals.json` - Meal Definitions
```json
{
  "meals": [
    {
      "id": "spaghetti-bolognese",
      "name": "Spaghetti Bolognese",
      "tags": ["pasta", "italian", "kid-friendly"],
      "prepTime": "30 min",
      "prepTask": "Brown ground beef, dice onions",
      "ingredients": [
        "1 lb ground beef",
        "1 box spaghetti",
        "1 jar marinara sauce",
        "parmesan to taste"
      ]
    },
    {
      "id": "tacos",
      "name": "Tacos",
      "tags": ["mexican", "quick", "kid-friendly"],
      "prepTime": "20 min",
      "prepTask": null,
      "ingredients": [
        "1 box taco shells",
        "1 lb ground beef",
        "1 packet taco seasoning",
        "1 bag shredded cheese",
        "1 head lettuce",
        "2 tomatoes"
      ]
    }
  ]
}
```

### Meal Assignments (stored in task list)
Uses existing task structure with `name`, `status`, `tags`:

```json
[
  { "name": "🍽️ Mon 1/19: Spaghetti Bolognese", "status": "not-started", "tags": ["meal", "2026-01-19", "meal:spaghetti-bolognese"] },
  { "name": "🍽️ Tue 1/20: Tacos", "status": "not-started", "tags": ["meal", "2026-01-20", "meal:tacos"] },
  { "name": "🔪 Weekend Prep: Brown beef for Mon Spaghetti", "status": "not-started", "tags": ["prep", "2026-01-19", "meal:spaghetti-bolognese"] }
]
```

**Tag conventions:**
- `meal` - Identifies as a meal task
- `prep` - Identifies as a prep task
- `2026-01-19` - Date tag for filtering by day
- `meal:spaghetti-bolognese` - Links to meal ID (for prep→meal relationship)

### Shopping List (separate list)
Stored as `{listName}~shopping` - a plain task list with one task per ingredient:

```json
// List: family-meals~shopping
[
  { "name": "1 lb ground beef", "status": "not-started" },
  { "name": "1 box spaghetti", "status": "not-started" },
  { "name": "1 jar marinara sauce", "status": "not-started" },
  { "name": "parmesan to taste", "status": "not-started" },
  { "name": "1 box taco shells", "status": "not-started" }
]
```

### Reserved Character: `~` (Tilde)

The tilde character is reserved for system-generated sub-lists:
- `family-meals` → user's meal planning list
- `family-meals~shopping` → auto-generated shopping list

**Validation rule**: List names containing `~` cannot be user-created. Only the system can create/manage them.

---

## User Interface

### Week View Layout
Weekend at top for prep visibility:

```
┌─────────────────────────────────────────────────────────────┐
│  📅 Meals - Week of January 19, 2026    [◀ Prev] [Next ▶]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ═══ WEEKEND PREP ═══════════════════════════════════════  │
│  Sat 1/17         Sun 1/18                                  │
│  ┌─────────────┐  ┌─────────────┐                          │
│  │ (no meal)   │  │ (no meal)   │                          │
│  └─────────────┘  └─────────────┘                          │
│  Prep Tasks:                                                │
│  [ ] 🔪 Brown beef for Mon Spaghetti                       │
│                                                             │
│  ═══ WEEKDAYS ═══════════════════════════════════════════  │
│  Mon 1/19       Tue 1/20       Wed 1/21                    │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐              │
│  │ Spaghetti │  │   Tacos   │  │    ---    │              │
│  │    [x]    │  │    [x]    │  │    [+]    │              │
│  └───────────┘  └───────────┘  └───────────┘              │
│                                                             │
│  Thu 1/22       Fri 1/23                                   │
│  ┌───────────┐  ┌───────────┐                              │
│  │    ---    │  │    ---    │                              │
│  │    [+]    │  │    [+]    │                              │
│  └───────────┘  └───────────┘                              │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│  🛒 Shopping                                                │
│  [Make Shopping List]                                       │
│  -- or when list exists --                                  │
│  [View Shopping List]  [Remove ❌]                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Add Meal Flow
When clicking [+] on a day:
1. Shows list of meals from `meals.json`
2. Filter by tags (quick, kid-friendly, etc.)
3. Recent meals at top
4. Selecting a meal:
   - Creates the meal task for that day
   - If meal has `prepTask`, creates prep task tagged for weekend

### Remove Meal Flow
When clicking [x] on an assigned meal:
1. Confirm removal
2. Delete meal task
3. **Auto-delete** associated prep task (matched via `meal:{id}` tag)

### Shopping List Button States

| State | UI | Action |
|-------|-----|--------|
| No shopping list exists | `[🛒 Make Shopping List]` | Creates `{listName}~shopping` with all ingredients |
| Shopping list exists | `[🛒 View Shopping List]` `[❌ Remove]` | View opens `tasks.html?list={listName}~shopping`, Remove deletes the list |

**Remove confirmation**: "Remove shopping list? This will delete all items."

---

## Feature Details

### 1. Meal Selection & Assignment

**Flow**:
1. User clicks [+] on a day (Mon-Fri)
2. Modal shows meals from `meals.json`
3. User selects meal
4. System creates:
   - Meal task: `🍽️ Mon 1/19: Spaghetti Bolognese` with tags `["meal", "2026-01-19", "meal:spaghetti-bolognese"]`
   - Prep task (if defined): `🔪 Weekend Prep: Brown beef for Mon Spaghetti` with tags `["prep", "2026-01-19", "meal:spaghetti-bolognese"]`

### 2. Prep Task Generation

**Logic**:
- If `meal.prepTask` is non-null, create a prep task
- Prep task displayed in Weekend section at top of UI
- Prep task includes day reference: "for Mon Spaghetti"
- **Auto-delete**: When meal is removed, find and delete prep task with matching `meal:{id}` tag

### 3. Shopping List Generation

**Flow**:
1. User clicks `[Make Shopping List]`
2. System scans all meal tasks for the displayed week
3. For each meal, looks up ingredients in `meals.json`
4. Creates `{listName}~shopping` list with one task per ingredient
5. Button changes to `[View Shopping List] [Remove]`

**View**: Opens `tasks.html?list={listName}~shopping` - uses existing task UI

**Remove**:
1. Confirm dialog
2. DELETE the `{listName}~shopping` list via API
3. Button reverts to `[Make Shopping List]`

### 4. Reserved Character Validation

**Client-side**:
- When creating a list (home page), reject names containing `~`
- Error message: "List names cannot contain ~"

**Future (API-side)**:
- API could enforce this as well for defense in depth

---

## File Structure

```
index.html           → Router (existing)
tasks.html           → Task list SPA (existing)
meals.html           → Meal board SPA (new)
meals.json           → Meal definitions (new, hardcoded)
task-store.js        → API abstraction (existing)
task-mutations.js    → Task operations (existing)
```

---

## Implementation Phases

### Phase 5a: Reserved Character & Validation
- [ ] Add `~` validation to list name creation (home page)
- [ ] Document reserved character in PLAN.md

### Phase 5b: Basic Meal Board UI
- [ ] Create `meals.html` with week view layout
- [ ] Weekend section at top with prep tasks
- [ ] Weekday grid (Mon-Fri)
- [ ] Week navigation (prev/next)
- [ ] Create sample `meals.json` with 5-10 meals

### Phase 5c: Meal Assignment
- [ ] Load meals from `meals.json`
- [ ] Add meal picker modal
- [ ] Create meal task on selection
- [ ] Display assigned meals in day slots
- [ ] Remove meal functionality
- [ ] Filter meals by tags

### Phase 5d: Prep Tasks
- [ ] Auto-generate prep task when meal with `prepTask` is assigned
- [ ] Display prep tasks in Weekend section
- [ ] Auto-delete prep task when meal is removed
- [ ] Prep task completion (checkbox)

### Phase 5e: Shopping List
- [ ] "Make Shopping List" button
- [ ] Aggregate ingredients from week's meals
- [ ] Create `{listName}~shopping` list via API
- [ ] Check if shopping list exists (on load)
- [ ] Button state management (Make vs View/Remove)
- [ ] "View Shopping List" → opens `tasks.html?list=...~shopping`
- [ ] "Remove" with confirm → DELETE list via API

### Phase 5f: Polish
- [ ] Mobile-friendly layout
- [ ] Link between tasks.html and meals.html for same list
- [ ] Recent meals in picker
- [ ] Error handling

---

## API Considerations

### Shopping List Management
Need to support DELETE for entire list:
- Current: `DELETE /api/tasks/{listName}` - may not exist
- May need to add this endpoint, OR
- PUT empty array `[]` to clear, then let it be (lazy delete)

### Checking if List Exists
- `GET /api/tasks/{listName}~shopping`
- 404 = doesn't exist → show "Make Shopping List"
- 200 = exists → show "View / Remove"

---

## Notes

- Uses same API (`/api/tasks/{listName}`) as regular task lists
- Meal board is a different **view** of the same data
- Can switch between `tasks.html?list=xyz` and `meals.html?list=xyz` to see raw vs meal-formatted view
- `meals.json` is shared (not per-list) - it's the recipe database
- Shopping list (`{list}~shopping`) uses standard task UI - no special template needed
- Weekend = Saturday & Sunday of the week **before** the displayed week (prep happens before the week starts)
