# API - Azure Functions

This folder contains the Azure Functions API for the checklist app. When deployed to Azure Static Web Apps, these functions are automatically integrated and available at `/api/*`.

## Local Development

### Prerequisites
- Node.js 18+
- [Azure Functions Core Tools v4](https://docs.microsoft.com/en-us/azure/azure-functions/functions-run-local)

### Setup

1. Install dependencies:
   ```bash
   cd api
   npm install
   ```

2. Create `local.settings.json` (not committed to git):
   ```json
   {
     "IsEncrypted": false,
     "Values": {
       "AzureWebJobsStorage": "",
       "FUNCTIONS_WORKER_RUNTIME": "node",
       "BLOB_SAS_URL": "https://YOUR_STORAGE.blob.core.windows.net/CONTAINER?sv=...",
       "BLOB_CONTAINER_NAME": "tasklists"
     }
   }
   ```

3. Run locally:
   ```bash
   func start
   ```
   API will be available at `http://localhost:7071/api/tasks/{listName}`

## Deploying to Azure Static Web Apps

### 1. Create Static Web App Resource

In Azure Portal:
- Search "Static Web Apps" → Create
- Connect to your GitHub repository
- Configure build:
  - **App location**: `/client`
  - **API location**: `/api`
  - **Output location**: (leave empty)

### 2. Configure Environment Variables

In Azure Portal → Your Static Web App → Configuration → Application settings:

| Name | Value |
|------|-------|
| `BLOB_SAS_URL` | Full SAS URL to your storage account (e.g., `https://account.blob.core.windows.net/container?sv=...&sig=...`) |
| `BLOB_CONTAINER_NAME` | Container name for task lists (e.g., `tasklists`) |

### 3. Client Config

`client/config.js` is already configured for SWA with `API_BASE: '/api/tasks'`.

For local development with a different API endpoint, create `client/config.local.js` (gitignored).

### 4. Deploy

Push to GitHub. Azure Static Web Apps automatically builds and deploys on push.

## API Endpoints

### GET /api/tasks/{listName}
Fetch the document for a list.

**Response**: `200 OK` with JSON document, or `404` if list doesn't exist.

### PUT /api/tasks/{listName}
Replace entire document. Creates the list if it doesn't exist.

**Request body**: JSON document
**Response**: `200 OK` with `{ "success": true }`

### POST /api/tasks/{listName}
Atomically append an item to an array. Uses ETag-based optimistic locking for multi-user support.

**Request body**:
```json
{
  "path": "weeks.0.event.comments",
  "value": { "id": "c1", "text": "My comment" }
}
```

**Path examples**:
| Path | Target |
|------|--------|
| `resources` | `doc.resources` |
| `weeks.0.completions` | `doc.weeks[0].completions` |
| `weeks.0.event.comments` | `doc.weeks[0].event.comments` |

**Response**: `200 OK` with `{ "success": true, "data": <full document> }`
**Conflict**: `409` with `{ "error": "Conflict, please retry" }` - client should retry

### DELETE /api/tasks/{listName}
Atomically remove an item from an array by ID. Uses ETag-based optimistic locking.

**Request body**:
```json
{
  "path": "resources",
  "id": "r1"
}
```

**Response**: `200 OK` with `{ "success": true, "data": <full document> }`
**Not found**: `404` with `{ "error": "Item not found" }`
**Conflict**: `409` with `{ "error": "Conflict, please retry" }` - client should retry

### OPTIONS /api/tasks/{listName}
CORS preflight.

## Testing

Run the test suite:
```bash
cd api
npm install
npm test
```

Tests cover all endpoints, path navigation, conflict handling, and integration scenarios. See `tasks/index.test.js` for usage examples.

## Storage

Tasks are stored as JSON files in Azure Blob Storage:
- Each list is a separate blob: `{listName}.json`
- Blob contains a JSON array of task objects

## Troubleshooting

### Function not found (404 on /api/*)
- Verify `api/` folder is at repo root (sibling to `client/`)
- Check API location is set to `/api` in SWA config
- Check Azure Portal → Static Web App → Functions to see if functions loaded

### CORS errors
- For SWA deployment, CORS is handled automatically (same origin)
- For local dev with separate frontend, the function includes permissive CORS headers

### Blob storage errors
- Verify `BLOB_SAS_URL` has read/write permissions
- Check SAS token hasn't expired
- Verify container exists
