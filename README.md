# Task List SPA

## Overview
A simple, responsive task list application that displays tasks with multiple states. Supports **multiple lists** via URL parameters (`?list=mylist`). Tasks are persisted via an Azure Function backed by Azure Blob Storage.

## Architecture

```
┌─────────────┐     ┌─────────────────┐     ┌─────────────────────┐
│  Static     │     │  Azure Function │     │  Azure Blob Storage │
│  Hosting    │────▶│  (GET/PUT)      │────▶│  {listName}.json    │
│             │     │  /tasks/{list}  │     │                     │
└─────────────┘     └─────────────────┘     └─────────────────────┘

URL: /tasks/?list=grocery  →  API: /api/tasks/grocery  →  Blob: grocery.json
```

## URL Structure

```
/                           → Redirects to /home/
/?list=grocery              → Redirects to /tasks/?list=grocery
/home/                      → Landing page (create new list)
/tasks/?list=grocery        → Task list for "grocery"
/tasks/                     → Task list with default list name
```

## Data Format

### `{listName}.json` (in Azure Blob Storage)
```json
[
  { "name": "Task name here", "status": "not-started", "tags": [] },
  { "name": "Another task", "status": "in-progress", "tags": ["urgent"] },
  { "name": "Completed task", "status": "done", "tags": ["backend"] },
  { "name": "Deleted task", "status": "removed" }
]
```

**Status values:** `not-started` | `in-progress` | `needs-review` | `done` | `removed`

## File Structure
```
checklist-spa/
├── client/                     # Frontend SPA
│   ├── index.html              # Router (redirects to /home/ or /tasks/)
│   ├── config.js               # API URL and default list name
│   ├── config.example.js       # Template for config.js
│   │
│   ├── shared/                 # Shared utilities
│   │   ├── api.js              # Fetch/save logic, list creation
│   │   ├── utils.js            # escapeHtml, generateId, getListName
│   │   └── common.css          # Base styles (buttons, modals, etc.)
│   │
│   ├── home/                   # Landing page feature
│   │   └── index.html          # Create new list, go to existing list
│   │
│   └── tasks/                  # Task list feature
│       ├── index.html          # Task list page
│       ├── tasks.js            # Task-specific UI logic
│       ├── tasks.css           # Task-specific styles
│       ├── task-store.js       # State management
│       └── task-mutations.js   # Pure mutation functions
│
├── azure-function/             # Backend API
│   ├── host.json
│   ├── package.json
│   ├── local.settings.json
│   └── TasksApi/
│       ├── function.json
│       └── index.js
│
├── PLAN.md                     # Implementation roadmap
└── README.md                   # This file
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
2. Upload all files and folders from `client/`:
   - `index.html`, `config.js`
   - `shared/` folder (with api.js, utils.js, common.css)
   - `home/` folder (with index.html)
   - `tasks/` folder (with all files)
3. Your SPA is now live at the Primary endpoint URL

### 11. Update Frontend Config
Before uploading, update `client/config.js` with your function URL:
```javascript
const CONFIG = {
    API_BASE: 'https://<your-function-app>.azurewebsites.net/api/tasks',
    DEFAULT_LIST_NAME: 'tasks'  // Used when no ?list= param
};
```

## Using the App

### Accessing Lists
- **Home page:** `https://yoursite.com/` → create new list or enter existing name
- **Default list:** `https://yoursite.com/tasks/` → uses `DEFAULT_LIST_NAME`
- **Specific list:** `https://yoursite.com/tasks/?list=grocery` → loads `grocery.json`
- **Any name works:** `?list=work`, `?list=shopping`, `?list=my-project`

### Task Actions

**Add a task:** Type in the input field and click "Add" or press Enter

**Cycle task status:** Click a task to cycle through: not-started → in-progress → needs-review → done → removed

**Add a tag:** Click the + button next to a task, type a tag name. Previously used tags appear as suggestions.

**Remove a tag:** Click on a tag to remove it from that task.

**Rename a tag:** Click the ✎ button on a tag group header to rename the tag across all tasks.

**Status icons:**
- ○ Not started (gray)
- ◐ In progress (orange)
- ? Needs review (blue)
- ✓ Done (green, strikethrough)
- ✕ Removed (red, faded)

All changes auto-save to Azure.

## Managing Tasks via Azure Portal

1. Storage Account → Containers → tasklists
2. Click `{listName}.json` → **Edit**
3. Modify and save

**Recover removed tasks:** Edit the JSON and change `"status": "removed"` back to `"not-started"`

**Create new lists:** Just visit `?list=newname` - an empty list is created automatically
