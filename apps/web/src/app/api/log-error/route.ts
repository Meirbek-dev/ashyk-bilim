import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { IS_PRODUCTION } from '@/services/config/env'

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

function getBodyString(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key]
  return typeof value === 'string' ? value : undefined
}

function getBodyLogValue(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key]
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') return JSON.stringify(value)
  return undefined
}

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    const [firstForwarded] = forwarded.split(',')
    return firstForwarded ? firstForwarded.trim() : 'unknown'
  }
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

    const isProd = IS_PRODUCTION
    const url = getBodyString(body, 'url') ?? request.url
    const errorMessage = getBodyLogValue(body, 'error')
    const digest = getBodyString(body, 'digest')
    const eventId = getBodyString(body, 'eventId')
    const page = getBodyString(body, 'page')
    const requestId = getBodyString(body, 'requestId') ?? getBodyString(body, 'request_id')
    const scope = getBodyString(body, 'scope')

    console.error('[CLIENT ERROR LOG]', {
      eventId,
      timestamp: new Date().toISOString(),
      url,
      scope,
      // Do not log full user-agent in production to avoid PII leakage in logs.
      userAgent: isProd ? undefined : request.headers.get('user-agent'),
      error: errorMessage?.slice(0, 1000),
      digest,
      requestId,
      // Component stacks can contain source paths and PII — strip in production.
      componentStack: isProd ? undefined : body.componentStack,
      page,
    })

    return NextResponse.json({ logged: true }, { status: 200 })
  } catch (error) {
    console.error('Failed to log error:', error)
    return NextResponse.json({ error: 'Logging failed' }, { status: 500 })
  }
}
