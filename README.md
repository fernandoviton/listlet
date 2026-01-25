# Task List SPA

## Overview
A simple, responsive task list application that displays tasks with multiple states. Supports **multiple lists** via URL parameters (`?list=mylist`). Also includes **SwarmSpace**, a collaborative RPG session tracker with real-time sync.

Tasks are persisted via an Azure Static Web App with a managed API backed by Azure Blob Storage.

## Architecture

```
┌─────────────────────┐     ┌─────────────────────┐
│  Azure Static Web   │     │  Azure Blob Storage │
│  App (SPA + API)    │────▶│  {listName}.json    │
│  /api/tasks/{list}  │     │                     │
└─────────────────────┘     └─────────────────────┘

URL: /tasks/?list=grocery  →  API: /api/tasks/grocery  →  Blob: grocery.json
URL: /swarmspace/?list=game1  →  API: /api/tasks/game1  →  Blob: game1.json
```

## URL Structure

```
/                              → Redirects to /home/
/?list=grocery                 → Redirects to /tasks/?list=grocery
/home/                         → Landing page (create new list)
/tasks/?list=grocery           → Task list for "grocery"
/tasks/                        → Task list with default list name
/swarmspace/?list=game1        → SwarmSpace RPG tracker
```

## Data Formats

### Task List: `{listName}.json`
```json
[
  { "name": "Task name here", "status": "not-started", "tags": [] },
  { "name": "Another task", "status": "in-progress", "tags": ["urgent"] },
  { "name": "Completed task", "status": "done", "tags": ["backend"] }
]
```

**Status values:** `not-started` | `in-progress` | `needs-review` | `done` | `removed`

### SwarmSpace Session: `{sessionName}.json`
```json
{
  "title": "Campaign Name",
  "setting": "Setting description",
  "startingWeek": 1,
  "currentWeekId": "abc123",
  "weeks": [{ "id": "abc123", "weekNumber": 1, "event": {...}, "action": {...}, "completions": [] }],
  "resources": [{ "id": "xyz", "name": "Gold", "status": "abundant" }],
  "locations": [{ "id": "loc1", "name": "Town", "distance": 0 }],
  "names": [{ "id": "n1", "name": "NPC Name", "description": "..." }]
}
```

## File Structure
```
checklist-spa/
├── client/                     # Frontend SPA
│   ├── index.html              # Router (redirects to /home/ or /tasks/)
│   ├── config.js               # API configuration
│   ├── staticwebapp.config.json # SWA routing config
│   │
│   ├── shared/                 # Shared utilities
│   │   ├── api.js              # Fetch/save logic with atomic operations
│   │   ├── utils.js            # escapeHtml, generateId, getListName
│   │   └── common.css          # Base styles
│   │
│   ├── home/                   # Landing page
│   │   └── index.html
│   │
│   ├── tasks/                  # Task list feature
│   │   ├── index.html
│   │   ├── tasks.js            # UI logic
│   │   ├── tasks.css
│   │   ├── task-store.js       # State management
│   │   └── task-mutations.js   # Pure mutation functions
│   │
│   └── swarmspace/             # RPG session tracker
│       ├── index.html
│       ├── swarmspace.js       # UI logic
│       ├── swarmspace.css
│       ├── swarmspace-store.js # State management
│       └── sync.js             # Multi-user sync polling
│
├── api/                        # Azure Functions API
│   ├── host.json
│   ├── package.json
│   ├── local.settings.json     # Local dev settings (not deployed)
│   └── tasks/
│       ├── function.json       # HTTP trigger config
│       ├── index.js            # API handler
│       └── index.test.js       # Tests
│
└── README.md
```

## Azure Deployment (CLI)

### Prerequisites
- [Azure CLI](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli) installed
- Logged in: `az login`

### 1. Create Resources

```bash
# Variables - customize these
RG="listlet"
LOCATION="westus2"
APP_NAME="listlet"

# Create resource group
az group create --name $RG --location $LOCATION

# Create storage account (name must be globally unique, lowercase, no hyphens)
az storage account create --name $APP_NAME --resource-group $RG --location $LOCATION --sku Standard_LRS

# Create blob container for task data
az storage container create --name tasklists --account-name $APP_NAME --auth-mode login

# Create Static Web App (includes managed API)
az staticwebapp create --name $APP_NAME --resource-group $RG --location $LOCATION --sku Free
```

### 2. Generate SAS Token and Configure API

```bash
# Get storage account key
KEY=$(az storage account keys list --account-name $APP_NAME --resource-group $RG --query "[0].value" -o tsv)

# Generate SAS token (valid 5 years)
EXPIRY=$(date -u -d "+5 years" '+%Y-%m-%dT%H:%MZ')  # Linux/macOS
# PowerShell: $EXPIRY = (Get-Date).AddYears(5).ToString("yyyy-MM-ddTHH:mmZ")

SAS=$(az storage account generate-sas --account-name $APP_NAME --account-key $KEY --permissions rwl --services b --resource-types co --expiry $EXPIRY -o tsv)

# Build full SAS URL
SAS_URL="https://${APP_NAME}.blob.core.windows.net?${SAS}"

# Set app settings (use stop-parsing in PowerShell to handle ampersands)
# PowerShell:
az --% staticwebapp appsettings set --name <app-name> --resource-group <rg> --setting-names "BLOB_SAS_URL=<sas-url>" "BLOB_CONTAINER_NAME=tasklists"

# Bash:
az staticwebapp appsettings set --name $APP_NAME --resource-group $RG \
  --setting-names "BLOB_SAS_URL=$SAS_URL" "BLOB_CONTAINER_NAME=tasklists"
```

### 3. Set Up GitHub Deployment

```bash
# Get deployment token
az staticwebapp secrets list --name $APP_NAME --resource-group $RG --query "properties.apiKey" -o tsv
```

Add to GitHub repo → **Settings** → **Secrets and variables** → **Actions**:
- Name: `AZURE_STATIC_WEB_APPS_API_TOKEN`
- Value: (paste the token)

Push to `main` branch to trigger deployment.

### 4. Verify Settings

```bash
# Check app settings
az staticwebapp appsettings list --name $APP_NAME --resource-group $RG --query "properties" -o json

# Get the app URL
az staticwebapp show --name $APP_NAME --resource-group $RG --query "defaultHostname" -o tsv
```

## Renewing SAS Token

SAS tokens expire. To renew:

```bash
# Generate new token
KEY=$(az storage account keys list --account-name $APP_NAME --resource-group $RG --query "[0].value" -o tsv)
EXPIRY=$(date -u -d "+5 years" '+%Y-%m-%dT%H:%MZ')
SAS=$(az storage account generate-sas --account-name $APP_NAME --account-key $KEY --permissions rwl --services b --resource-types co --expiry $EXPIRY -o tsv)
SAS_URL="https://${APP_NAME}.blob.core.windows.net?${SAS}"

# Update app setting (PowerShell - use --% for ampersands)
az --% staticwebapp appsettings set --name <app-name> --resource-group <rg> --setting-names "BLOB_SAS_URL=<new-sas-url>"
```

## Local Development

### Mock Mode (No Azure)
Set `API_BASE: 'mock'` in `client/config.js` to use localStorage instead of the API.

### With Local API
1. Copy `api/local.settings.json` and add your `BLOB_SAS_URL`
2. Run `cd api && npm install && npm start`
3. Set `API_BASE: 'http://localhost:7071/api/tasks'` in config.js
4. Open `client/` files in a local server

### Run Tests
```bash
cd api && npm test
```

## Using the App

### Task Lists
- **Home page:** Create new list or enter existing name
- **Access list:** `/tasks/?list=grocery`
- **Cycle status:** Click task → not-started → in-progress → needs-review → done → removed
- **Tags:** Click + to add, click tag to remove, click ✎ to rename

### SwarmSpace
- **Create session:** `/swarmspace/?list=my-campaign`
- **Multi-user:** Changes sync every 15 seconds
- **Features:** Week tracking, resources, locations, NPCs, comments

## Managing Data via CLI

```bash
# List blobs
az storage blob list --container-name tasklists --account-name $APP_NAME --auth-mode login --query "[].name" -o tsv

# Download a list
az storage blob download --container-name tasklists --account-name $APP_NAME --name "tasks.json" --file tasks.json --auth-mode login

# Upload/update a list
az storage blob upload --container-name tasklists --account-name $APP_NAME --name "tasks.json" --file tasks.json --auth-mode login --overwrite

# Delete a list
az storage blob delete --container-name tasklists --account-name $APP_NAME --name "tasks.json" --auth-mode login
```
