// The SDK builds every URL on this placeholder origin, the same in SSR and in the browser: the generated
// query keys embed the base URL, so a per-environment base would break hydration (and leak the internal
// address into the page). apiFetch (client.ts) swaps in the real origin: same-origin in the browser,
// INTERNAL_API_URL in SSR. Its own module: the session key (entry chunk) needs it without the SDK.
export const KEY_ORIGIN = 'https://api.invalid'
