# Listlet

A collection of small collaborative web apps deployed as an Azure Static Web App with a shared Azure Functions API backend.

## Apps

- **Tasks** (`/tasks/?list=name`) - Simple task list with status cycling
- **SwarmSpace** (`/swarmspace/?list=name`) - Collaborative RPG session tracker with weekly logs, resources, locations, NPCs, projects, and markdown/JSON export/import
- **QuickTrip** (`/quicktrip/?list=name`) - Trip date planner where participants mark available/blocked dates on a shared calendar

All apps create lists on demand when you visit a URL with a `?list=` parameter. Multi-user sync via polling every 15 seconds.

## Architecture

- **No build step.** Client code is vanilla JS using IIFEs (not modules). Script tags in HTML, no bundler.
- **Azure Static Web App** serves `client/` as static files and `api/` as managed Azure Functions.
- **Single API endpoint** (`api/tasks/index.js`) handles all apps. Route: `/api/store/{container}/{name}` where container maps to the blob storage container (tasks, swarm, quicktrip).
- **Azure Blob Storage** for persistence. Each list is a JSON blob. The API auto-creates containers on first use via `createIfNotExists`.
- **Atomic operations** via ETag-based optimistic locking (POST for append, DELETE for remove, PATCH for field update). Client retries on 409 conflict.

## Code Patterns

Each app follows the same structure:
- `*-mutations.js` - Pure functions for state changes (testable without DOM)
- `*-store.js` - State container wrapping mutations
- `*.js` - UI controller (DOM manipulation, event binding)
- `sync.js` (shared) - Polling-based multi-user sync

`client/shared/api.js` - Shared API client (`createApi()`) used by all apps. Supports mock mode (localStorage) on localhost and real API calls in production. Key methods: `fetchTasks`, `saveTasks` (GET-mutate-PUT), `appendItem`, `deleteItem`, `patchItem`.

`client/config.js` - API base URLs. Override with `client/config.local.js` (gitignored) for local dev with a real backend.

## Testing

Two independent Jest setups, each with their own `package.json` and `jest.config.js`:

```bash
cd api && npm test     # API handler tests (Azure Functions)
cd client && npm test  # Client tests (mutations, store, API client)
```

Client tests eval the IIFE source files to get modules into `globalThis`, then test them with Jest. See existing test files for the pattern.

## Local Development

```bash
python -m http.server 8000 -d client
```

On localhost, mock mode activates automatically (localStorage). No backend needed.

## Deployment

Push to `main` triggers GitHub Actions deploy to Azure Static Web App. Requires `AZURE_STATIC_WEB_APPS_API_TOKEN` secret and `BLOB_SAS_URL` app setting. See README.md for full Azure CLI setup.
