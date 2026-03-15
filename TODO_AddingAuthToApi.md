# Add Authentication to Listlet

## Context
The app currently has no auth — anyone who guesses a list URL can read/write data. Before adding an LLM proxy feature (which has an API key cost), we need to gate API access to approved users. The approach: use SWA's built-in OAuth for login (GitHub/Google/Microsoft), then check an allowlist in the Azure Function.

## Architecture Overview
```
User → SWA Built-in Auth (GitHub/Google/Microsoft login)
     → SWA checks allowedRoles: ["authenticated"]
     → Azure Function checks ALLOWED_USERS env var
     → Blob Storage
```

Two layers of protection:
1. **SWA route config** — rejects unauthenticated requests (returns 401)
2. **Function-level allowlist** — rejects authenticated-but-not-allowed users (returns 403)

---

## Step 1: Create `api/shared/auth.js` (new file)

Reusable auth helper for all current and future Azure Functions.

```js
function authenticateRequest(req) {
    const header = req.headers['x-ms-client-principal'];
    if (!header) {
        return { authenticated: false, user: null, error: 'No auth header' };
    }
    const decoded = JSON.parse(Buffer.from(header, 'base64').toString('utf-8'));
    const email = (decoded.userDetails || '').toLowerCase();
    const allowedUsers = (process.env.ALLOWED_USERS || '')
        .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

    // Fail-open when no allowlist configured (allows easy initial testing)
    if (allowedUsers.length === 0) {
        return { authenticated: true, user: { email, userId: decoded.userId, provider: decoded.identityProvider } };
    }
    if (!allowedUsers.includes(email)) {
        return { authenticated: false, user: { email }, error: 'User not in allowlist' };
    }
    return { authenticated: true, user: { email, userId: decoded.userId, provider: decoded.identityProvider } };
}
module.exports = { authenticateRequest };
```

## Step 2: Add auth check to `api/tasks/index.js`

Insert after the OPTIONS handler (line 44) and before container validation (line 46):

```js
const { authenticateRequest } = require('../shared/auth');
// ... (at top)

// After OPTIONS return, before business logic:
const auth = authenticateRequest(req);
if (!auth.authenticated) {
    context.res = { status: 403, headers, body: JSON.stringify({ error: auth.error || 'Forbidden' }) };
    return;
}
```

## Step 3: Update `client/staticwebapp.config.json`

Change the `/api/*` route from `"anonymous"` to `"authenticated"`:

```json
{
    "route": "/api/*",
    "allowedRoles": ["authenticated"]
}
```

This makes SWA reject unauthenticated API requests with 401 before they reach the function.

## Step 4: Add auth UI — `client/shared/auth-ui.js` (new file)

Minimal login/logout indicator. Skips on localhost/mock mode. Fetches `/.auth/me` to check login state. Shows login links for GitHub/Google/Microsoft or "Logged in as X | Logout".

Add `<script src="/shared/auth-ui.js"></script>` after `config-loader.js` in:
- `client/tasks/index.html` (after line 38)
- `client/swarmspace/index.html` (after line 218)
- `client/quicktrip/index.html` (after line 60)
- `client/home/index.html` (after line 117)

## Step 5: Handle 401/403 in `client/shared/api.js`

Add a helper at the top of `api.js` and use it in the non-mock fetch paths:

```js
function checkAuthResponse(response) {
    if (response.status === 401 || response.status === 403) {
        window.location.href = '/.auth/login/github';
        throw new Error('Authentication required');
    }
}
```

Call `checkAuthResponse(response)` after each `fetch()` in `fetchTasks`, `saveTasks`, `appendItem`, `deleteItem`, and `patchItem` (only in the non-mock branches, before checking `response.ok`).

## Step 6: Configure environment variable

**Azure Portal**: SWA > Configuration > Add `ALLOWED_USERS` = `user1@gmail.com,user2@example.com`

**Local dev** (`api/local.settings.json`): Add `"ALLOWED_USERS": ""` (empty = fail-open for local testing)

## Step 7: Keep `authLevel: "anonymous"` in `api/tasks/function.json`

Do NOT change this. SWA handles auth at the proxy level. The function's `authLevel` controls Azure Functions key-based auth, which is separate and not needed.

---

## Files Changed

| File | Action | Lines changed |
|------|--------|---------------|
| `api/shared/auth.js` | Create | ~20 lines |
| `api/tasks/index.js` | Modify | ~7 lines added (require + auth check) |
| `client/staticwebapp.config.json` | Modify | 1 line (`anonymous` → `authenticated`) |
| `client/shared/auth-ui.js` | Create | ~30 lines |
| `client/shared/api.js` | Modify | ~10 lines (auth error helper + calls) |
| `client/tasks/index.html` | Modify | 1 line (script tag) |
| `client/swarmspace/index.html` | Modify | 1 line (script tag) |
| `client/quicktrip/index.html` | Modify | 1 line (script tag) |
| `client/home/index.html` | Modify | 1 line (script tag) |
| `api/local.settings.json` | Modify | 1 line (ALLOWED_USERS) |

## Important Notes

- **GitHub may not expose email**: `userDetails` from SWA may contain a username instead of email depending on provider and user's GitHub privacy settings. We should test this and may need to match on `userId` as a fallback.
- **Mock mode unaffected**: localhost mock mode bypasses all API calls via localStorage, so auth is irrelevant locally.
- **Login providers**: GitHub (`/.auth/login/github`), Google (`/.auth/login/google`), Microsoft (`/.auth/login/aad`) — all zero-config in SWA.

## Verification

1. **Deploy** and confirm unauthenticated API calls return 401
2. **Login** via GitHub/Google/Microsoft and confirm API calls work
3. **Set ALLOWED_USERS** to your email, confirm you can access; try a different account and confirm 403
4. **Mock mode**: Run locally, confirm everything still works without auth
5. **Test the auth-ui.js**: Verify login/logout links appear correctly in production, and are hidden on localhost
