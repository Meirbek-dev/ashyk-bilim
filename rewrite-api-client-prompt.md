## Context: what exists today and why it's being rewritten

`apps/web/src/lib/api-client.ts` is the sole fetch layer for the app, called from ~165 sites across ~53 files (mostly directly, not through its own convenience wrappers). It correctly solves three hard problems — SSR cookie forwarding, deduplicated 401-refresh-and-retry, and combining multiple `AbortSignal`s — and then:

- Exposes eight different exported functions (`apiFetcher`, `apiJson`, `apiResult`, `apiStreamFetch`, `apiFetcherWithHeaders`, `fetchResponseMetadata`, `errorHandling`, `getResponseMetadata`) with inconsistent return shapes and, critically, **inconsistent error behavior** — most throw, `getResponseMetadata`/`fetchResponseMetadata` silently swallow non-2xx responses into `{ success: false, data: null }` instead.
- Is bypassed by 155 of its 165 call sites, which call the raw `apiFetch()` and hand-roll their own `response.ok` check — meaning error handling for any given request depends on which developer wrote that call site and what they felt like doing that day. Confirmed real examples that throw a bare `Error` instead of the app's typed `ApiErrorEnvelope` (defined in `src/lib/api/assertSuccess.ts`), silently opting out of the global `isApiError`/`meta.expectedCodes`/telemetry handling in `src/lib/react-query/queryClient.ts`:
  - `src/features/ai-experience/api/use-cancel-ai-run.ts`
  - `src/features/assessments/registry/exam/ExamAttemptContent.tsx`
- Hand-rolls a timeout mechanism (`createTimeoutReason` + `setTimeout` + `AbortController`) that duplicates the native `AbortSignal.timeout()`, which the code already knows exists — it uses `AbortSignal.any()` a few lines later.
- Has no retry policy at all for transient failures (timeouts, 5xx, dropped connections).
- Does zero runtime validation of response bodies — `(await response.json()) as T` is a compile-time-only guarantee.
- Provides `apiStreamFetch`, a bare `Response` with the timeout disabled, as the entire story for streaming/SSE — despite the app depending on `@ag-ui/core` (the AG-UI protocol's event types) without also depending on `@ag-ui/client` (the reference `HttpAgent` transport that already implements SSE parsing, reconnection, and event decoding for that exact protocol).

This is not a "throw it out" situation — the cookie/auth/abort logic is hard-won and correct. It's a "stop reimplementing solved problems, and stop letting call sites route around the parts that are correct" situation.

## Objective

Rebuild the fetch layer as a small number of composable, typed, validated entry points, with the custom auth/cookie/tracing logic as thin hooks on top of a real HTTP transport library — not hand-rolled from raw `fetch()`. Make it structurally difficult for a call site to bypass error parsing, the way the current 8-export surface makes it structurally easy.

## Decisions to make, with recommendations

1. **Transport primitive: `ofetch` (unjs) over hand-rolled `fetch()`.** It's built on native fetch, ~small bundle, has built-in retry with configurable `retryStatusCodes`, built-in `timeout`, request/response interceptors (`onRequest`/`onResponse`/`onResponseError`) to hang the existing cookie/auth/401-refresh logic off of, and native support for `blob`/`text`/`stream`/`arrayBuffer` response types (which the current client has no equivalent for at all). `ky` is a reasonable alternative if bundle size matters more than the built-in blob/stream ergonomics — pick one, don't evaluate both in production. Do not reach for axios; there's no reason to pull in an XHR-based, 5-8x larger library when the app is fetch-native everywhere else.
2. **Runtime response validation: Orval-generated Zod schemas, validated explicitly inside the custom mutator — not via Orval's `runtimeValidation` flag.** Orval's automatic runtime validation is currently bypassed when a custom mutator is used (this is a known, open upstream limitation, not a config mistake you'll make) — so import the generated `.zod.ts` schema for each response and call `.parse()`/`.safeParse()` explicitly inside the mutator/response handler you're already writing for auth and error normalization. This introduces Zod for the generated-schema layer specifically, separate from `valibot`, which stays for hand-written form validation — that split is intentional, not an inconsistency to "fix."
3. **Request tracing: W3C Trace Context (`traceparent` header) instead of the hand-rolled `X-Request-ID` counter**, since the backend already runs Logfire (OpenTelemetry-based). A real trace-context header lets a frontend request and its corresponding backend spans show up correlated in the same Logfire trace, instead of a string ID you have to grep logs for by hand. Keep a request-ID-style fallback only if some downstream system still expects the old header shape.
4. **AI streaming: adopt `@ag-ui/client`'s `HttpAgent` for the AG-UI-protocol traffic specifically**, rather than routing it through the generic fetch client's `apiStreamFetch`. Whatever currently parses SSE chunks by hand for the AI tutor chat should be replaced by the reference transport, which already handles reconnection and event decoding correctly. `apiStreamFetch` (or its replacement) should remain for any non-AG-UI streaming use case (e.g., large file/report downloads), but stop being the AI chat's transport.

## Steps

### 1. Audit before rewriting

- Grep every call site of `apiFetch`, `apiFetcher`, `apiJson`, `apiResult`, `apiStreamFetch`, `apiFetcherWithHeaders`, `fetchResponseMetadata`, `getResponseMetadata`, `errorHandling`. Classify each: (a) already uses a throwing, `ApiErrorEnvelope`-aware wrapper — migrate mechanically; (b) uses raw `apiFetch` with its own `response.ok` check that already matches the app's error contract — migrate mechanically; (c) uses raw `apiFetch` with an ad hoc, non-conforming error (like the two examples above) — these need a human decision about whether the custom message/behavior was intentional and should be preserved as an override, not silently dropped; (d) uses `getResponseMetadata`/`fetchResponseMetadata` — audit every one of these specifically, since they're the ones currently swallowing failures; confirm whether the calling code actually checks `.success` before trusting `.data`.
- Confirm whether streaming/SSE parsing for the AI chat currently lives inline in a component, in a hook, or nowhere obvious yet — find it before deciding how `HttpAgent` slots in.

### 2. Build the new core client

- Create the `ofetch` (or `ky`) instance with `baseURL` resolved the same way `apiBase(isServer, baseUrl)` does today (server vs. client base URL), `retry` with a small capped count and jitter for idempotent requests only, `timeout` as the default, and interceptor hooks carrying over, verbatim in behavior:
  - server-side cookie forwarding (only the allow-listed auth cookies, same `getServerCookieHeader` logic)
  - client-side `credentials: 'include'`
  - the deduplicated 401 → `recoverBrowserSessionFrom401` → retry-once flow (the module-level `authRefreshPromise`/`authRedirectPending` dedup logic is correct — keep it, just hang it off `onResponseError` instead of hand-written in the fetch call)
  - `traceparent` header generation, replacing `createFrontendRequestId`/`X-Request-ID`
  - Next.js `next: { tags, revalidate }` cache option passthrough, including the existing `force-cache` vs. `no-store` branching based on whether cache tags are present
- Expose a small, deliberately narrow set of typed entry points on top — not eight. A reasonable shape: one JSON request function (throws a parsed, validated `ApiErrorEnvelope`-shaped error always), one for responses that need headers/metadata alongside data, one for blob/stream responses (using the library's native support instead of a bespoke function), and the `HttpAgent`-based path for AG-UI traffic. Every JSON-returning entry point runs its result through the matching Orval-generated Zod schema before returning.
- Make the "give me a raw `Response` with no error handling" escape hatch (if you keep one at all) obviously named (e.g. `apiFetchRaw`) and clearly documented as "you are opting out of error normalization, this should be rare" — don't let it be the thing 94% of call sites reach for by default the way `apiFetch` is today.

### 3. Migrate call sites

- For classification (a) and (b) from step 1: mechanical find-and-replace to the new entry points, verified with the existing test suite.
- For classification (c) (the ad hoc error-contract sites): fix these by hand, one at a time. Decide whether the custom message (`'Could not cancel AI run'`, `payload.detail`) should become a feature-specific override passed to the shared error-mapping layer from the earlier error-handling-refactor prompt, or whether the generic mapped message is actually fine and the override was never adding value.
- For classification (d) (`getResponseMetadata`/`fetchResponseMetadata` call sites): these need the most scrutiny — confirm the calling component actually branches on `.success`/checks for `null` data before rendering, since the audit in step 1 may turn up places that don't.
- This should land as its own PR sequenced **before** the Orval migration's mutator work (from the earlier Orval prompt) — Orval's custom mutator will wrap whatever this rewrite produces, so get the transport right first, then let Orval-generated hooks retire most of the remaining hand-written call sites naturally as part of that migration's tag-by-tag rollout, rather than hand-fixing every one of the ~165 sites permanently.

### 4. Prevent regression

- Add a lint rule (or extend the one from the error-handling-refactor prompt) that flags direct use of global `fetch()` anywhere in `apps/web/src` outside the new client module itself, and flags use of the "raw" escape-hatch export outside a small, explicit allowlist.
- Add a unit test for the retry policy (mock a 503 then a 200, assert exactly one retry happens and the caller gets the 200) and for the Zod-validation-at-the-mutator-boundary path (mock a response that violates the generated schema, assert it throws a validation error rather than returning malformed data silently).

## Definition of done

- One transport library (`ofetch` or `ky`) handles timeout, retry, and non-JSON response types — none of that logic is hand-rolled anymore.
- Every JSON-returning entry point validates its response against the matching Orval-generated Zod schema before returning it to the caller.
- No call site can get a `response.ok`-style branch point and improvise its own error shape — the two example files above (and every other classification-(c) site) throw the same `ApiErrorEnvelope`-derived error type everything else does.
- `getResponseMetadata`/`fetchResponseMetadata`'s swallow-on-failure behavior is gone; every audited call site correctly surfaces failures.
- The AI chat streaming path runs through `@ag-ui/client`'s `HttpAgent`, not hand-parsed SSE chunks over `apiStreamFetch`.
- Frontend requests carry a `traceparent` header and show up correlated with backend Logfire spans.
- The lint rule from step 4 is in place so a 166th ad hoc `apiFetch` call site can't reappear next quarter.
