# Task List SPA - Implementation Plan

## Overview
A simple, responsive task list application that displays tasks with three possible states. Tasks are persisted via an Azure Function backed by Azure Blob Storage.

## Architecture

```
┌─────────────┐     ┌─────────────────┐     ┌─────────────────────┐
│  GitHub     │     │  Azure Function │     │  Azure Blob Storage │
│  Pages      │────▶│  (GET/PUT)      │────▶│  tasks.json         │
│  index.html │     │                 │     │                     │
└─────────────┘     └─────────────────┘     └─────────────────────┘
```

## Data Format

### `tasks.json` (in Azure Blob Storage)
```json
[
  { "name": "Task name here", "status": "not-started" },
  { "name": "Another task", "status": "in-progress" },
  { "name": "Completed task", "status": "done" }
]
```

**Status values:** `not-started` | `in-progress` | `done`

## File Structure
```
checklist-spa/
├── index.html           # Main app (HTML + CSS + JS)
├── PLAN.md              # This file
└── azure-function/
    ├── host.json            # Function app config
    ├── package.json         # Dependencies
    ├── local.settings.json  # Local dev settings (not deployed)
    └── TasksApi/
        ├── function.json    # Function binding config
        └── index.js         # Function code (GET & PUT)
```

## Azure Deployment Instructions

### 1. Create Azure Storage Account
1. Go to [Azure Portal](https://portal.azure.com) → **Create a resource** → **Storage account**
2. Choose a name (e.g., `taskliststorage`)
3. Select region, Standard performance, LRS redundancy
4. Click **Review + Create** → **Create**

### 2. Create Blob Container
1. Open your storage account
2. Go to **Containers** → **+ Container**
3. Name: `tasklists`
4. Public access level: **Private**
5. Click **Create**

### 3. Upload Initial Task Data
1. In the `tasklists` container, click **Upload**
2. Create and upload a file named `tasks.json`:
```json
[
  { "name": "Sample task 1", "status": "not-started" },
  { "name": "Sample task 2", "status": "in-progress" }
]
```

### 4. Generate SAS URL
1. Go to Storage Account → **Shared access signature** (under Security + networking)
2. Configure permissions:
   - Allowed services: **Blob**
   - Allowed resource types: **Container** and **Object**
   - Allowed permissions: **Read**, **Write**, **List**
3. Set an expiry date (e.g., 1 year from now)
4. Click **Generate SAS and connection string**
5. Copy the **Blob service SAS URL** (save for step 6)

### 5. Create Azure Function App
1. Azure Portal → **Create a resource** → **Function App**
2. Configure:
   - Runtime stack: **Node.js**
   - Version: **18 LTS** or newer
   - Operating System: **Windows** or **Linux**
   - Plan type: **Consumption (Serverless)**
3. Click **Review + Create** → **Create**

### 6. Configure Function App Settings
1. Go to your Function App → **Settings** → **Environment Variables** → **App Settings** Tab
2. Click **+ Add** and add:
   - Name: `BLOB_SAS_URL`
   - Value: (paste Blob service SAS URL from step 4)
3. Add another setting:
   - Name: `BLOB_CONTAINER_NAME`
   - Value: `tasklists`
4. Click **Apply**, then **Confirm**

### 7. Deploy the Azure Function (VS Code)
1. Install the **Azure Functions** extension in VS Code
2. Open the `azure-function/` folder in VS Code
3. Run `npm install` in the terminal
4. Click the **Azure** icon in the sidebar
5. Under **Functions**, right-click your function app → **Deploy to Function App...**
6. Select your function app and confirm

**Alternative: Deploy via Azure Portal**
1. In your Function App, go to **Deployment Center**
2. Choose **GitHub** as the source
3. Authorize and select this repo, `main` branch, `azure-function/` folder
4. Azure will auto-deploy on push

### 8. Configure CORS
1. Go to Function App → **CORS**
2. Add your static website URL (from step 1): `https://<storageaccount>.z13.web.core.windows.net`
3. Click **Save**

### 9. Enable Static Website Hosting
1. Go to your Storage Account → **Data management** → **Static website**
2. Set **Static website** to **Enabled**
3. Index document name: `index.html`
4. Click **Save**
5. Copy the **Primary endpoint** URL (this is your SPA URL)

### 10. Upload SPA Files
1. Go to Storage Account → **Containers** → **$web**
2. Upload `index.html` and `config.js` (with your actual API URL)
3. Your SPA is now live at the Primary endpoint URL

### 11. Update Frontend Config
Before uploading, update `config.js` with your function URL:
```javascript
const CONFIG = {
    API_BASE: 'https://<your-function-app>.azurewebsites.net/api/tasks',
    LIST_NAME: 'tasks'
};
```

## Updating Tasks

**Via the App:** Click tasks to cycle their status (auto-saves)

**Via Azure Portal:**
1. Storage Account → Containers → tasklists
2. Click `tasks.json` → **Edit**
3. Modify and save

**Create New Lists:** Upload a new `{name}.json` to blob storage, then change `LIST_NAME` in index.html
