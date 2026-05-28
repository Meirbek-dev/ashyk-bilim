import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const GOOGLE_AVATAR_HOSTS = new Set([
  'lh3.googleusercontent.com',
  'lh4.googleusercontent.com',
  'lh5.googleusercontent.com',
  'lh6.googleusercontent.com',
])

const FALLBACK_AVATAR_PATH = '/empty_avatar.avif'
const SUCCESS_CACHE_CONTROL =
  'public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800'
const FAILURE_CACHE_CONTROL = 'public, max-age=300, s-maxage=300'

const isAllowedAvatarUrl = (url: URL): boolean => {
  return url.protocol === 'https:' && GOOGLE_AVATAR_HOSTS.has(url.hostname.toLowerCase())
}

const redirectToFallback = (request: NextRequest, status = 302) => {
  return NextResponse.redirect(new URL(FALLBACK_AVATAR_PATH, request.url), {
    status,
    headers: {
      'Cache-Control': FAILURE_CACHE_CONTROL,
    },
  })
}

export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get('url')
  if (!rawUrl) return redirectToFallback(request, 302)

  let avatarUrl: URL
  try {
    avatarUrl = new URL(rawUrl)
  } catch {
    return redirectToFallback(request, 302)
  }

  if (!isAllowedAvatarUrl(avatarUrl)) {
    return redirectToFallback(request, 302)
  }

  try {
    const upstreamResponse = await fetch(avatarUrl, {
      headers: {
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'User-Agent': 'AshyqBilim/1.0 AvatarProxy',
      },
      next: {
        revalidate: 604_800,
      },
    })

    if (!upstreamResponse.ok) {
      return redirectToFallback(request, 302)
    }

    const contentType = upstreamResponse.headers.get('content-type') ?? 'image/jpeg'
    if (!contentType.startsWith('image/')) {
      return redirectToFallback(request, 302)
    }

    return new NextResponse(upstreamResponse.body, {
      status: 200,
      headers: {
        'Cache-Control': SUCCESS_CACHE_CONTROL,
        'Content-Type': contentType,
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return redirectToFallback(request, 302)
  }
}
