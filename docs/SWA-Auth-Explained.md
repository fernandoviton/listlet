Threat Model — How SWA Authentication Works

## TLDR
  1. Login — SWA handles the full OAuth dance and gives the browser an encrypted StaticWebAppsAuthCookie. The browser can't
   read or tamper with it.
  2. Every API call — The browser automatically sends that cookie. Before your code runs, SWA's reverse proxy:
    - Decrypts the cookie
    - Checks route rules (allowedRoles in staticwebapp.config.json) — returns 401 if failed
    - Injects the x-ms-client-principal header with the user's identity
    - Strips any client-supplied version of that header (prevents spoofing)
    - Forwards the request to your Function
  3. Your code — receives a request that's already authenticated by SWA, with a trusted x-ms-client-principal header. The
  authenticateRequest() helper just decodes that header and checks the allowlist.

  So your Azure Function never deals with OAuth tokens, cookies, or session validation directly — SWA does all of that as a
   reverse proxy layer in front of your code.


### Initial Login Flow

```
Browser                          SWA Reverse Proxy              OAuth Provider (GitHub/Google/AAD)
   |                                    |                                    |
   |-- GET /.auth/login/github -------->|                                    |
   |                                    |-- 302 redirect to provider ------->|
   |                                    |                                    |
   |<---------- 302 to provider consent page --------------------------------|
   |                                    |                                    |
   |-- User authenticates at provider ---------------------------------------->|
   |                                    |                                    |
   |                                    |<-- callback with auth code --------|
   |                                    |                                    |
   |                                    |-- exchanges code for token ------->|
   |                                    |<-- ID token / user info -----------|
   |                                    |                                    |
   |<-- 302 redirect + Set-Cookie: StaticWebAppsAuthCookie=<encrypted> ------|
   |                                    |                                    |
```

1. Browser navigates to `/.auth/login/github` (or `/google`, `/aad`).
2. SWA's reverse proxy initiates a standard OAuth 2.0 / OpenID Connect flow — redirects the browser to the provider's consent screen.
3. User authenticates with the provider. Provider redirects back to SWA's callback endpoint with an authorization code.
4. SWA's proxy exchanges the code for tokens **server-side** (the browser never sees the OAuth tokens).
5. SWA sets an **encrypted, httpOnly cookie** called `StaticWebAppsAuthCookie` on the browser. This cookie is opaque to client-side JavaScript — it cannot be read or tampered with by the browser.
6. The browser is redirected back to the original page. The user is now logged in.

**Key point:** The OAuth access/ID tokens are never exposed to the client. SWA stores them internally and only exposes a sanitized user profile via `/.auth/me` and the `x-ms-client-principal` header.

### Subsequent API Calls (Authenticated Requests)

```
Browser                          SWA Reverse Proxy              Azure Function (api/tasks)
   |                                    |                                    |
   |-- GET /api/store/tasks/mylist ---->|                                    |
   |   Cookie: StaticWebAppsAuthCookie  |                                    |
   |                                    |                                    |
   |                     [1] Decrypt cookie                                  |
   |                     [2] Check route rules (allowedRoles)                |
   |                     [3] If unauthorized → return 401                    |
   |                                    |                                    |
   |                     [4] Inject x-ms-client-principal header             |
   |                     [5] Strip any client-supplied                       |
   |                         x-ms-client-principal header                    |
   |                                    |                                    |
   |                                    |-- forwarded request + header ----->|
   |                                    |                                    |
   |                                    |              [6] Decode base64 header
   |                                    |              [7] Check ALLOWED_USERS
   |                                    |              [8] Process or 403
   |                                    |                                    |
   |<-------------- response ------------------------------------------------|
```

1. Every API request includes the `StaticWebAppsAuthCookie` automatically (it's a regular cookie).
2. SWA's reverse proxy **decrypts** the cookie and validates the session.
3. SWA checks the route rules in `staticwebapp.config.json`. If the route requires `allowedRoles: ["authenticated"]` and the user isn't logged in, SWA returns **401** immediately — the request never reaches the Function.
4. SWA **injects** the `x-ms-client-principal` header, a base64-encoded JSON blob containing `identityProvider`, `userId`, `userDetails` (email/username), and `userRoles`.
5. **Critically, SWA strips any client-supplied `x-ms-client-principal` header** before forwarding. The client cannot spoof this header — it is generated exclusively by SWA's proxy from the decrypted cookie.
6. The Azure Function decodes the base64 header and reads the user identity.
7. Our code checks the `ALLOWED_USERS` env var to implement the allowlist (returning **403** if the user isn't listed).

### Trust Boundaries

| Boundary | What enforces it | Threat if bypassed |
|----------|------------------|--------------------|
| Browser → SWA proxy | TLS + `StaticWebAppsAuthCookie` (encrypted, httpOnly) | Session hijacking if cookie is stolen (mitigated by httpOnly, secure flag, SameSite) |
| SWA proxy → Azure Function | SWA strips/replaces `x-ms-client-principal`; Functions only accept traffic from SWA | Identity spoofing if Function is exposed directly (mitigated by SWA's managed backend linking) |
| Function → Blob Storage | SAS URL or managed identity | Data access if SAS URL leaks (mitigated by keeping it in app settings, not client code) |

### Threats and Mitigations

| # | Threat | Severity | Mitigation |
|---|--------|----------|------------|
| T1 | **Header spoofing** — attacker sends a crafted `x-ms-client-principal` directly | High | SWA proxy strips this header on all inbound requests and replaces it with one derived from the decrypted cookie. The Function is not directly accessible — SWA's backend linking ensures traffic only arrives via the proxy. |
| T2 | **Cookie theft / session hijacking** | Medium | Cookie is encrypted, `httpOnly` (no JS access), `Secure` (HTTPS only), and `SameSite`. Lifetime is managed by SWA (~8 hours). No long-lived tokens on the client. |
| T3 | **Unauthorized but authenticated user** — someone logs in via GitHub but isn't in the allowlist | Medium | Two-layer defense: SWA route rules reject unauthenticated users (401), then `authenticateRequest()` in the Function checks `ALLOWED_USERS` (403). |
| T4 | **ALLOWED_USERS not set (fail-open)** | Low | By design for initial setup. In production, this should always be set. Could add a startup warning log if empty. |
| T5 | **Provider returns username instead of email** (GitHub privacy settings) | Low | `userDetails` may contain a GitHub username rather than an email. The allowlist match could silently fail. Mitigation: also support matching on `userId`, or document that users must have a public email on their provider account. |
| T6 | **Direct Function access bypassing SWA** | High | SWA's managed backend linking restricts the Function app to only accept requests proxied through SWA. Even if someone discovers the Function's direct URL (`.azurewebsites.net`), requests without SWA's proxy are rejected. |
| T7 | **CSRF on state-changing API calls** | Low | The `StaticWebAppsAuthCookie` uses `SameSite` attributes. Additionally, our API uses JSON bodies (not form-encoded), which aren't trivially submittable cross-origin. The ETag-based optimistic locking provides a further barrier to blind writes. |
| T8 | **Blob SAS URL exposure** | High | The SAS URL is stored in Azure app settings (environment variable), never sent to the client. If leaked, it grants direct blob access. Mitigation: use short-lived SAS tokens or managed identity instead of a long-lived SAS URL. |

### What SWA Does NOT Do

- **SWA does not validate what the Function does with the identity.** It only passes along who the user is. Authorization logic (allowlist, per-list permissions, etc.) is entirely our responsibility.
- **SWA does not provide per-resource authorization.** It can restrict routes to "authenticated" or custom roles, but it cannot say "user X can access list Y." That would need application-level logic.
- **SWA does not rotate the cookie automatically.** Sessions expire (~8h), but there's no refresh token flow exposed to the client. The user simply re-authenticates when the cookie expires.
