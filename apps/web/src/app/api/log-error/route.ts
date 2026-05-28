import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

const MAX_BODY_BYTES = 8192 // 8 KB cap to prevent log-spam / memory exhaustion

/**
 * Simple in-process sliding-window rate limiter keyed by IP address.
 *
 * Limits each IP to MAX_LOG_REQUESTS per WINDOW_MS milliseconds.
 * This prevents log-spam abuse on the unauthenticated error logging endpoint.
 * Uses a Map with TTL-based entry expiry to avoid unbounded memory growth.
 */
const MAX_LOG_REQUESTS = 10
const WINDOW_MS = 60_000 // 1 minute

interface RateEntry {
  timestamps: number[]
  lastSeen: number
}

const _ipCounters = new Map<string, RateEntry>()
let _lastEviction = Date.now()

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]!.trim()
  return 'unknown'
}

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const cutoff = now - WINDOW_MS

  // Periodic eviction of stale entries (~every 5 minutes) to prevent unbounded growth.
  if (now - _lastEviction > 5 * 60_000) {
    for (const [key, entry] of _ipCounters) {
      if (entry.lastSeen < cutoff) _ipCounters.delete(key)
    }
    _lastEviction = now
  }

  const entry = _ipCounters.get(ip) ?? { timestamps: [], lastSeen: now }
  entry.timestamps = entry.timestamps.filter(ts => ts > cutoff)
  entry.lastSeen = now

  if (entry.timestamps.length >= MAX_LOG_REQUESTS) {
    _ipCounters.set(ip, entry)
    return true
  }

  entry.timestamps.push(now)
  _ipCounters.set(ip, entry)
  return false
}

export async function POST(request: NextRequest) {
  // Rate limit: 10 requests per minute per IP.
  const ip = getClientIp(request)
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  try {
    const contentLength = Number(request.headers.get('content-length') ?? '0')
    if (contentLength > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
    }

    const rawText = await request.text()
    if (rawText.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
    }

    let body: Record<string, unknown>
    try {
      body = JSON.parse(rawText)
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const isProd = process.env.NODE_ENV === 'production'

    console.error('[CLIENT ERROR LOG]', {
      timestamp: new Date().toISOString(),
      url: typeof body.url === 'string' ? body.url : request.url,
      // Do not log full user-agent in production to avoid PII leakage in logs.
      userAgent: isProd ? undefined : request.headers.get('user-agent'),
      error: typeof body.error === 'string' ? body.error.slice(0, 1000) : undefined,
      digest: typeof body.digest === 'string' ? body.digest : undefined,
      // Component stacks can contain source paths and PII — strip in production.
      componentStack: isProd ? undefined : body.componentStack,
      page: typeof body.page === 'string' ? body.page : undefined,
    })

    return NextResponse.json({ logged: true }, { status: 200 })
  } catch (error) {
    console.error('Failed to log error:', error)
    return NextResponse.json({ error: 'Logging failed' }, { status: 500 })
  }
}
