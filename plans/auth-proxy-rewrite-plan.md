# Auth and Proxy Rewrite Plan

## Executive summary

The current auth system has a reasonably strong backend foundation: access and refresh cookies are HttpOnly, refresh cookies are path scoped, refresh tokens rotate, reused refresh tokens revoke the token family, login is rate limited, and `/auth/me` is protected by FastAPI Users.

The weak part is the Next.js frontend boundary. `apps/web/src/proxy.ts` is doing too many jobs at once: locale routing, legacy URL rewrites, health/sitemap rewrites, request header mutation, request-id propagation, auth preflight, token refresh redirects, and editor route remapping. That makes it slow and fragile, but it also gives a misleading security model. The proxy only decodes the unsigned JWT `exp` claim; it does not verify the token, user state, session revocation, permissions, or account activity. Real authentication still happens later in `getSession()` and the backend.

The rewrite should reduce the proxy to deterministic routing only, move auth decisions to server component/layout guards and backend API authorization, and make refresh a single explicit path with concurrency protection.

## Current flow

### Browser page request

1. `proxy.ts` runs for most page requests because of the broad matcher in `apps/web/src/proxy.ts:31`.
2. The proxy:
   - handles `/health`, `/.well-known`, `/redirect_from_auth`, and `/sitemap.xml` special cases (`apps/web/src/proxy.ts:145`, `apps/web/src/proxy.ts:149`, `apps/web/src/proxy.ts:157`, `apps/web/src/proxy.ts:166`);
   - invokes `next-intl` middleware (`apps/web/src/proxy.ts:170`);
   - computes locale path info (`apps/web/src/proxy.ts:177`);
   - rewrites short auth URLs like `/en/login` to `/en/auth/login` (`apps/web/src/proxy.ts:184`);
   - checks selected protected prefixes (`apps/web/src/proxy.ts:189`);
   - redirects missing or locally-expired access tokens to `/api/auth/refresh` (`apps/web/src/proxy.ts:195`);
   - rewrites editor URLs (`apps/web/src/proxy.ts:200`);
   - rewrites almost every localized request again (`apps/web/src/proxy.ts:210`).
3. The locale layout still calls `getSession()` for every localized render (`apps/web/src/app/[locale]/layout.tsx:35`).
4. `getSession()` checks the access-token cookie, redirects to refresh if absent/expired with a refresh cookie, then calls `apiFetch('auth/me')` (`apps/web/src/lib/auth/session.ts:31`, `apps/web/src/lib/auth/session.ts:49`).

### API calls

1. Server-side API calls use `apiFetch()`, which forwards only auth cookies from `next/headers` (`apps/web/src/lib/api-client.ts:55`, `apps/web/src/lib/api-client.ts:139`).
2. Browser-side API calls use `credentials: 'include'` and redirect to `/api/auth/refresh` on the first 401 per tab (`apps/web/src/lib/api-client.ts:172`).
3. `/api/auth/refresh` forwards auth cookies to the backend refresh endpoint and copies backend `Set-Cookie` headers back to the browser (`apps/web/src/app/api/auth/refresh/route.ts:44`, `apps/web/src/app/api/auth/refresh/route.ts:63`).

### Backend auth

1. Login issues an access JWT and creates a Redis-backed refresh session (`apps/api/src/routers/auth.py:179`, `apps/api/src/routers/auth.py:246`).
2. Refresh validates the refresh cookie, rotates the refresh session, and sets new access and refresh cookies (`apps/api/src/routers/auth.py:318`, `apps/api/src/routers/auth.py:357`, `apps/api/src/routers/auth.py:364`).
3. Cookie settings are stronger on the backend than the frontend code implies: access cookie is HttpOnly/Lax/path `/`, refresh cookie is HttpOnly/Strict/path `/api/auth/refresh` (`apps/api/src/security/auth_cookies.py:17`, `apps/api/src/security/auth_cookies.py:34`).

## Critical findings

### P0: refresh rotation can punish normal concurrency

The frontend has at least three independent refresh triggers:

- proxy redirect for protected pages (`apps/web/src/proxy.ts:195`);
- `getSession()` redirect on missing/expired access token (`apps/web/src/lib/auth/session.ts:35`, `apps/web/src/lib/auth/session.ts:42`);
- browser `apiFetch()` redirect on 401 (`apps/web/src/lib/api-client.ts:172`).

The backend rotates refresh tokens and treats reuse as a compromise signal (`apps/api/src/routers/auth.py:334`). That is correct for true replay, but dangerous when the frontend can send parallel refresh requests with the same old refresh cookie. A user opening two protected tabs, a render plus client request, or multiple 401s can cause one refresh to rotate the token and another refresh to look like token reuse. Depending on Redis/audit timing, this can revoke the whole token family and force logout.

Rewrite requirement: refresh must be single-flight from the frontend, and the backend should support a short idempotency/grace strategy for same-session refresh replay.

### P0: proxy auth is not real authentication

`proxy.ts` imports `isAccessTokenExpired()` and only decodes the unsigned JWT payload (`apps/web/src/proxy.ts:6`, `apps/web/src/lib/auth/cookie-bridge.ts:142`). This is fine as a refresh hint, but not a security boundary. A forged token with a future `exp` can pass the proxy check and reach the page render. The backend will reject it later, but the current structure makes the proxy look authoritative.

There is even a misleading comment saying signature verification happens in `proxy.ts` (`apps/web/src/lib/auth/cookie-bridge.ts:146`). It does not.

Rewrite requirement: proxy may only perform cheap routing decisions. Authentication and authorization must be enforced by server layouts/actions and backend endpoints.

### P0: forwarded host/proto are trusted when building redirects

Both `proxy.ts` and the refresh route build absolute redirect origins from `x-forwarded-host` / `x-forwarded-proto` (`apps/web/src/proxy.ts:127`, `apps/web/src/app/api/auth/refresh/route.ts:32`). If the hosting layer does not strip untrusted forwarded headers, this can produce attacker-controlled `Location` values. Even when the infrastructure is expected to sanitize these headers, the application code should not rely on that for auth redirects.

Rewrite requirement: frontend redirects should use same-origin relative URLs or `request.nextUrl.origin`, and trusted forwarded headers should be centralized behind one helper used only where they are genuinely needed for backend audit metadata.

### P1: route protection is duplicated and already drifting

`PROTECTED_PREFIXES` in `proxy.ts` includes `/assessments` (`apps/web/src/proxy.ts:20`). `PROTECTED_ROUTE_PREFIXES` in `lib/auth/redirect.ts` does not (`apps/web/src/lib/auth/redirect.ts:5`). The tests cover the helper, not the proxy (`apps/web/src/tests/auth/redirect.test.ts:5`). This guarantees future inconsistencies.

Rewrite requirement: keep one route policy module, strip locale before matching, and use segment-aware matching instead of raw `startsWith()`.

### P1: localized auth-route detection is wrong on the client

`isAuthRoute()` only knows `/login`, `/signup`, `/forgot`, and `/reset` (`apps/web/src/lib/auth/redirect.ts:3`). It does not know `/en/login`, `/ru/login`, `/en/auth/login`, etc. Browser `apiFetch()` therefore can treat a localized auth page as a non-auth page and redirect to refresh on a 401 (`apps/web/src/lib/api-client.ts:172`).

Rewrite requirement: auth route detection must normalize locale and internal `/auth/*` paths before checking, or it should only be used by route-aware server code that receives a canonical path.

### P1: every localized page pays proxy complexity even though layout fetches session anyway

The proxy constructs new request headers, copies response headers, and rewrites every localized request (`apps/web/src/proxy.ts:66`, `apps/web/src/proxy.ts:91`, `apps/web/src/proxy.ts:109`, `apps/web/src/proxy.ts:210`). But the locale layout still calls `getSession()` on every localized request (`apps/web/src/app/[locale]/layout.tsx:35`). The proxy check does not remove the backend `auth/me` fetch; it only adds an extra preflight branch for protected routes.

Rewrite requirement: remove auth from proxy and use route-group layouts for guarded areas. If a route truly needs no session, do not mount the session provider for that route group.

### P1: broad prefix checks cause accidental protection

`pathnameWithoutLocale.startsWith(prefix)` means `/administrator`, `/analytics-preview`, `/certificate-showcase`, and similar paths can be treated as protected because they share a prefix (`apps/web/src/proxy.ts:189`). This is not currently catastrophic, but it is a routing bug waiting for future routes.

Rewrite requirement: match exact segment boundaries: `path === prefix || path.startsWith(prefix + '/')`.

### P1: refresh route has too much duplicated forwarding logic

`apps/web/src/app/actions/auth.ts`, `apps/web/src/app/api/auth/refresh/route.ts`, and `apps/web/src/lib/api-client.ts` each construct cookie/forwarded headers slightly differently (`apps/web/src/app/actions/auth.ts:32`, `apps/web/src/app/api/auth/refresh/route.ts:11`, `apps/web/src/lib/api-client.ts:55`). This increases audit inconsistency and makes security review harder.

Rewrite requirement: one `serverAuthFetch()` helper should own backend auth calls, cookie forwarding, response cookie propagation, and trusted request metadata.

### P2: return-to handling loses query in some paths

`getSession()` builds return-to from `x-pathname` plus `x-search` (`apps/web/src/lib/auth/session.ts:13`). `requireSession()` uses only `x-pathname` (`apps/web/src/lib/auth/session.ts:78`). That means a protected page with query state can round-trip differently depending on which guard path fires.

Rewrite requirement: one `getReturnTo()` helper should preserve pathname and search consistently.

### P2: server-side absolute return-to normalization is environment-blind

`normalizeReturnTo()` uses `http://localhost` as the origin on the server (`apps/web/src/lib/auth/redirect.ts:35`). That prevents many absolute internal production URLs from being treated as internal. It is safer than allowing external redirects, but it creates surprising behavior and pushes callers toward inconsistent custom origin code.

Rewrite requirement: normalize only relative return-to values in app code. If absolute URLs must be accepted, validate against configured public origins in one server-only helper.

### P2: tests miss the risky code

Existing tests cover redirect helpers and auth actions, but not the proxy behavior, refresh concurrency, locale normalization, or hostile forwarded headers (`apps/web/src/tests/auth/redirect.test.ts:5`, `apps/web/src/tests/auth/auth-pipeline.test.ts:1`). E2E only checks one unauthenticated dash redirect (`apps/web/e2e/specs/01-auth.spec.ts:116`).

Rewrite requirement: add focused unit tests for route policy and refresh behavior, plus E2E cases for expired access token, missing access token with valid refresh, and parallel protected navigations.

## Target architecture

### Design principles

1. Backend is the only authority for token validity, user activity, session revocation, and permissions.
2. Proxy is routing glue only. It may normalize locale URLs and rewrite public aliases, but it must not claim authentication.
3. Refresh is explicit and single-flight. Page renders and client calls should not race each other into token-family revocation.
4. Route policy is centralized, locale-aware, segment-aware, and tested.
5. Cookie forwarding and `Set-Cookie` propagation have one implementation.
6. Protected server-rendered pages use layouts/helpers, not proxy prefix gates.

### Proposed module layout

```text
apps/web/src/lib/auth/
  routes.ts              # canonical auth/public/protected route policy
  return-to.ts           # normalize locale-aware relative returnTo values
  server-auth-fetch.ts   # backend auth fetch + cookie forwarding + Set-Cookie apply
  session.ts             # getSession/requireSession, no proxy header dependency
  refresh.ts             # frontend refresh URL builder and status helpers

apps/web/src/proxy.ts    # i18n + legacy rewrites + health/sitemap only
apps/web/src/app/api/auth/refresh/route.ts
apps/web/src/app/[locale]/(protected)/layout.tsx or guarded route layouts
```

## Rewrite plan

### Phase 1: centralize route policy

Create `apps/web/src/lib/auth/routes.ts`.

Responsibilities:

- strip locale prefixes (`/en`, `/ru`, `/kz`, and full locale forms if still supported);
- normalize public short auth routes (`/login`) and internal auth routes (`/auth/login`);
- expose `isAuthRoute(path)`, `isProtectedRoute(path)`, `isEditorLegacyRoute(path)`, `toInternalAuthPath(path)`;
- use exact segment matching, not raw `startsWith()`;
- export a single protected route list used by tests and any remaining guards.

Initial route policy:

```ts
const protectedPrefixes = [
  '/dash',
  '/profile',
  '/settings',
  '/admin',
  '/analytics',
  '/editor',
  '/certificates',
  '/assessments',
] as const
```

Tests:

- `/en/dash`, `/ru/dash/courses`, `/kz/assessments/x` are protected;
- `/en/login`, `/en/auth/login`, `/login` are auth routes;
- `/administrator`, `/analytics-preview`, `/certificate-showcase` are not protected unless explicitly added;
- editor legacy route detection matches only `/course/:course/activity/:activity/edit`.

### Phase 2: simplify `proxy.ts`

Reduce `proxy.ts` to:

1. generate request id if still needed;
2. handle `/health` -> `/api/health`;
3. keep `/.well-known` unlocalized;
4. handle `/sitemap.xml` -> `/api/sitemap`;
5. run `next-intl` middleware;
6. rewrite canonical short auth routes to internal auth route pages;
7. rewrite legacy editor URL to canonical editor route;
8. pass request headers needed by `getReturnTo()` if still necessary.

Remove from proxy:

- `PROTECTED_PREFIXES`;
- `isAccessTokenExpired()` import;
- access-token cookie reads;
- redirect to `/api/auth/refresh`;
- forwarded-host/proto origin construction;
- unconditional final rewrite for every localized request unless `next-intl` actually requires it.

New proxy pseudocode:

```ts
export default function proxy(request: NextRequest) {
  const requestId = crypto.randomUUID()
  const { pathname, search } = request.nextUrl

  if (pathname === '/health' || pathname.startsWith('/health/')) {
    return withRequestHeaders(NextResponse.rewrite(new URL('/api/health', request.url)), request, requestId)
  }

  if (isWellKnown(pathname)) return normalizeWellKnown(request)
  if (pathname === '/sitemap.xml') return rewriteSameOrigin(request, '/api/sitemap', requestId)

  const i18nResponse = intlMiddleware(request)
  if (isRedirect(i18nResponse)) return withRequestId(i18nResponse, requestId)

  const resolvedPath = getResolvedPath(i18nResponse, request)
  const route = classifyRoute(resolvedPath)

  if (route.kind === 'authAlias') {
    return rewriteSameOrigin(request, route.internalPath + search, requestId)
  }

  if (route.kind === 'legacyEditor') {
    return rewriteSameOrigin(request, route.internalPath + search, requestId)
  }

  return withRequestHeaders(i18nResponse, request, requestId)
}
```

### Phase 3: move page protection to layouts

Create guarded layouts where the filesystem already expresses protected areas.

Candidates:

- `apps/web/src/app/[locale]/(platform)/dash/layout.tsx` already exists and should call `requireSession()`.
- `apps/web/src/app/[locale]/editor/...` should call `requireSession()` or `requirePermission()` at the editor layout/page boundary.
- Analytics/admin/course-authoring pages should use `requirePermission()` where permissions matter.
- Public course, collection, certificate verification, search, home, and auth pages should not force a session unless they need personalization.

Important: the current `[locale]/layout.tsx` calls `getSession()` for all localized pages. If performance is a goal, split providers:

- public locale layout loads i18n/theme only;
- protected route groups load session and provide authenticated context;
- public pages that need optional personalization call `getSession()` locally.

This is the biggest performance win because it removes the global `auth/me` fetch from anonymous public pages.

### Phase 4: redesign refresh flow

Frontend:

- Keep `/api/auth/refresh` as the only browser-visible refresh endpoint.
- Do not call refresh from proxy.
- In `getSession()`, when access is missing/expired and refresh cookie is present, redirect to `/api/auth/refresh?returnTo=...`.
- In browser `apiFetch()`, replace hard navigation side effects with a shared refresh coordinator:
  - if a refresh is already in progress, await it;
  - after success, retry the original request once;
  - after failure, navigate to login once;
  - never trigger multiple refresh navigations from parallel 401s.

Backend:

- Add refresh replay grace for the same session family and recent rotation, or add an idempotency token strategy.
- Treat true reuse after grace or from a different context as compromise.
- Log enough metadata to distinguish benign duplicate refresh from attack replay.

Suggested backend strategy:

- Store `previous_refresh_token_hash`, `previous_session_id`, and `rotated_at` for a short window, e.g. 5-10 seconds.
- If the old token is replayed during the grace window from the same user-agent/IP bucket, return the already-issued successor or a 409/204 that tells the frontend to reload session without revoking the family.
- Only revoke the family when replay happens outside grace or mismatched context.

### Phase 5: centralize backend auth fetches

Create `server-auth-fetch.ts` with:

- `serverAuthFetch(path, init)`;
- `postAuthForm(path, formData)`;
- `postAuthJson(path, body)`;
- `applyBackendSetCookies(responseHeaders)`;
- `copyBackendSetCookies(responseHeaders, nextResponse)`;
- `buildTrustedForwardedHeaders(sourceHeaders)`.

Use it from:

- `loginAction`;
- `signupAction`;
- `logoutAction`;
- `/api/auth/refresh`;
- `getSession()` / `apiFetch()` server branch if appropriate.

Then delete duplicated forwarding code from action and route files.

### Phase 6: harden redirects and return-to

Rules:

- `returnTo` accepted by frontend auth endpoints must be relative only.
- Reject `//host`, absolute `http(s)://`, backslash variants, encoded control characters, and auth-loop destinations.
- Preserve pathname plus search consistently for both `getSession()` and `requireSession()`.
- Build redirect locations with relative URLs when possible:

```ts
NextResponse.redirect(`/api/auth/refresh?returnTo=${encodeURIComponent(returnTo)}`)
NextResponse.redirect(returnTo)
```

When absolute URLs are required by Next APIs, use `new URL(relativePath, request.nextUrl.origin)` and do not read `x-forwarded-host` directly in auth code.

### Phase 7: update comments and docs

Fix misleading comments:

- `cookie-bridge.ts` should state that `exp` decoding is an untrusted refresh hint only.
- Remove the claim that proxy verifies signatures.
- Document that frontend permission checks are UX gates; backend remains authoritative.

## Proposed end state

### `proxy.ts`

Proxy owns:

- locale routing;
- public alias rewrites;
- legacy editor rewrite;
- health/sitemap/well-known exceptions;
- request id propagation if still valuable.

Proxy does not own:

- auth state;
- refresh decisions;
- permission checks;
- backend calls;
- trusted origin construction from forwarded headers.

### `getSession()`

`getSession()` owns:

- reading cookies;
- deciding whether a refresh redirect is needed during server render;
- calling backend `/auth/me`;
- returning `null` on unauthenticated state.

It should not depend on proxy-injected headers for correctness. Header-provided return-to is acceptable as a convenience, but there must be a fallback from `headers()` or route context.

### `apiFetch()`

`apiFetch()` owns:

- credentials/cookie forwarding;
- timeout behavior;
- client-side 401 refresh coordination;
- one retry after successful refresh.

It should not perform unconditional `location.assign()` from arbitrary code paths without single-flight protection.

### Backend

Backend owns:

- JWT verification;
- refresh token rotation and replay detection;
- session revocation;
- RBAC and object authorization;
- rate limiting.

## Implementation checklist

1. Add route policy module and tests.
2. Add return-to module and tests.
3. Add server auth fetch helper and migrate login/signup/logout/refresh.
4. Add client refresh coordinator to `apiFetch()`.
5. Add backend refresh replay grace or idempotency.
6. Remove auth check from `proxy.ts`.
7. Move protection to route layouts/pages.
8. Split global optional session loading out of `[locale]/layout.tsx` if performance is required now.
9. Update comments/docs.
10. Add E2E coverage for refresh and protected navigation.

## Test plan

Unit tests:

- route classification with localized and non-localized paths;
- segment-aware protected matching;
- auth route detection for `/login`, `/auth/login`, `/en/login`, `/en/auth/login`;
- return-to normalization rejects external and protocol-relative values;
- `apiFetch()` performs one refresh and one retry for concurrent 401s;
- refresh failure redirects to localized login once;
- server auth fetch forwards only expected cookies and trusted metadata.

Proxy tests:

- `/en/login` rewrites to `/en/auth/login`;
- `/en/dash` does not inspect cookies and does not redirect to refresh;
- `/health` rewrites to `/api/health`;
- `/.well-known/*` is never localized;
- `/course/a/activity/b/edit` rewrites to `/editor/course/a/activity/b/edit`;
- hostile `x-forwarded-host` does not affect auth redirect locations because proxy no longer builds them.

Backend tests:

- refresh rotates token and invalidates old token outside grace;
- duplicate refresh inside grace does not revoke the family;
- replay outside grace revokes the family;
- refresh with missing/invalid token returns 401 and clears cookies through frontend bridge.

E2E tests:

- unauthenticated `/en/dash/courses` redirects to `/en/login?returnTo=...`;
- expired access token plus valid refresh lands back on the requested protected page;
- two parallel protected navigations with an expired access token do not log the user out;
- browser API 401 refreshes and retries once without losing form/page state;
- localized login page API errors do not trigger refresh loops.

## Migration risks

- Moving session loading out of `[locale]/layout.tsx` can affect components that assume `useSessionContext()` is always initialized. Audit those consumers before splitting public/protected layouts.
- Removing proxy auth may expose protected UI for a short server-render interval if pages are not guarded. Do the layout guard migration before deleting proxy auth in the same branch.
- Backend refresh grace must be short and observable. Too broad a grace window weakens replay detection.
- Locale-aware redirects need careful testing because user-visible short routes (`/en/login`) currently rely on proxy rewrites.

## Recommended order of work

1. Land route policy and return-to tests without behavior changes.
2. Refactor proxy to use the policy module but keep current auth behavior temporarily.
3. Add refresh coordinator and backend duplicate-refresh handling.
4. Add protected layouts/page guards.
5. Remove proxy auth.
6. Split optional/global session loading for performance.
7. Run `vp check`, `vp test`, and targeted Playwright auth specs.
