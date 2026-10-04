// Guards of the web server's one public write, `POST /_client-error` (src/server.ts).

/** The body as text, or null once it passes `maxBytes`: the read stops there, whatever Content-Length said. */
export async function readLimited(request: Request, maxBytes: number): Promise<string | null> {
  if (!request.body) return ''
  const reader = request.body.getReader()
  const decoder = new TextDecoder()
  let text = ''
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maxBytes) {
      await reader.cancel()
      return null
    }
    text += decoder.decode(value, { stream: true })
  }
  return text + decoder.decode()
}

/**
 * The client a request counts against: nginx's `X-Real-IP` (it overwrites any client value with the peer it
 * resolved through `set_real_ip_from`, docs/INFRA.md); `X-Forwarded-For` is client-forgeable and never read.
 */
export const clientKey = (request: Request): string => request.headers.get('x-real-ip')?.trim() || 'direct'

/**
 * A per-minute budget per client. A full table drops only expired windows; while it is still full, an unseen
 * client is refused (a flood of forged keys cannot reset everyone's window).
 */
export function createBudget(perMinute: number, maxClients = 10_000) {
  const windows = new Map<string, { start: number; count: number }>()
  return (client: string, now: number): boolean => {
    let entry = windows.get(client)
    if (entry && now - entry.start > 60_000) {
      windows.delete(client)
      entry = undefined
    }
    if (!entry) {
      if (windows.size >= maxClients)
        for (const [key, value] of windows) if (now - value.start > 60_000) windows.delete(key)
      if (windows.size >= maxClients) return true
      windows.set(client, { start: now, count: 1 })
      return false
    }
    entry.count += 1
    return entry.count > perMinute
  }
}
