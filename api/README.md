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
Fetch tasks for a list.

**Response**: `200 OK` with JSON array of tasks, or `404` if list doesn't exist.

### PUT /api/tasks/{listName}
Save tasks for a list. Creates the list if it doesn't exist.

**Request body**: JSON array of tasks
**Response**: `200 OK` with `{ "success": true }`

### OPTIONS /api/tasks/{listName}
CORS preflight.

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
