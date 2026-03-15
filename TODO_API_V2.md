# Listlet API V2 Plan

## Context

Listlet currently has no auth, no image support, and a single Azure Function for JSON blob CRUD. The user wants to add auth, OpenRouter LLM proxy, simple RBAC, and image storage — while keeping costs near-zero for 10-50 users.

**Decision: Stay on Azure.** The current stack (SWA free tier + Blob Storage + Azure Functions free tier) is effectively free at this scale and purely pay-per-use. 3rd-party BaaS options either have subscription cliffs (Supabase $25/mo) or require full migration for marginal benefit (Firebase). The custom code burden is small — the entire backend is one file today.

## V2 Scope (4 features, ordered by dependency)

### 1. Auth (prerequisite for everything else)
Follows `TODO_AddingAuthToApi.md` closely — it's a solid plan.

- **SWA built-in OAuth** (GitHub/Google/Microsoft) — zero config, free
- **`api/shared/auth.js`** — extract `x-ms-client-principal` header, decode, check allowlist
- **`staticwebapp.config.json`** — gate `/api/*` to `authenticated` role
- **`client/shared/auth-ui.js`** — login/logout UI, skip on localhost
- **`client/shared/api.js`** — handle 401/403 → redirect to login

Files: `api/shared/auth.js` (new), `api/tasks/index.js`, `client/staticwebapp.config.json`, `client/shared/auth-ui.js` (new), `client/shared/api.js`, all `index.html` files

### 2. Simple RBAC (builds on auth)
Add a `RBAC_CONFIG` env var (JSON) or a simple convention:

```
ALLOWED_USERS=alice@gmail.com:admin,bob@gmail.com:user
```

Roles:
- **admin**: full access (all containers, all operations, manage users eventually)
- **user**: read/write to specific containers they're granted (or all, depending on simplicity preference)
- **viewer**: read-only (future, if needed)

Implementation: extend `api/shared/auth.js` to parse role from `ALLOWED_USERS`, return it in the auth result. Add a `requireRole(auth, minRole)` helper. Check in each function handler.

Files: `api/shared/auth.js` (extend)

### 3. Image Storage (new Azure Function)
New function: `api/images/index.js`
Route: `/api/images/{container}/{name}/{filename}`

- **POST** (upload): Accept `multipart/form-data`, validate content-type (image/*), enforce size limit (e.g., 5MB), upload to a dedicated `images` blob container with path `{container}/{name}/{filename}`
- **GET** (serve): Download from blob, return with correct `Content-Type` header
- **DELETE**: Remove image (admin or owner only via RBAC)

Client-side: add `uploadImage(container, name, file)` and `getImageUrl(container, name, filename)` to `api.js`

Files: `api/images/function.json` (new), `api/images/index.js` (new), `client/shared/api.js` (extend)

### 4. OpenRouter LLM Proxy (needs auth)
Follows `TODO_Adding_Openrouter_NeedsReview.md` — implement after auth is in place.

- **`api/llm/index.js`** — proxy to OpenRouter, gated by auth
- **`client/config.js`** — add `API_LLM_PARSE` endpoint
- **`client/quicktrip/quicktrip.js`** — AI date input UI

Files: `api/llm/function.json` (new), `api/llm/index.js` (new), `client/config.js`, `client/quicktrip/quicktrip.js`, `client/quicktrip/quicktrip.css`

## Implementation Order

1. Auth → 2. RBAC → 3. Images → 4. LLM Proxy

Each step is independently deployable and testable. Auth is the gate — nothing else should ship without it.

## Verification

1. **Auth**: Deploy, confirm unauthenticated API → 401, login → works, non-allowlisted user → 403, localhost mock mode unaffected
2. **RBAC**: Confirm admin can do everything, user role is restricted appropriately
3. **Images**: Upload an image via curl/UI, retrieve it, confirm size limit enforced, confirm auth required
4. **LLM Proxy**: POST sample text to `/api/llm/parse-dates`, confirm structured response, confirm auth required, confirm mock mode shows graceful error
