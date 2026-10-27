import { problemError } from './client'

/**
 * A JSON request that must leave while the page goes away (`pagehide`, a hidden tab). `fetch` is called within the
 * event with `keepalive`: a closing page runs no later task, and the SDK reaches `fetch` only after awaits (its
 * request is rebuilt with a buffered body). Same origin; a non-2xx answer rejects with its `ApiError`.
 */
export async function sendOnLeave(
  path: string,
  method: 'PATCH' | 'POST',
  body: unknown,
  headers: Record<string, string> = {},
): Promise<unknown> {
  const response = await fetch(path, {
    method,
    keepalive: true,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw await problemError(response)
  return response.json()
}
