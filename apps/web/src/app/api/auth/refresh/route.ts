import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { clearAuthCookies } from '@/lib/auth/cookie-bridge'
import { buildLoginRedirect, normalizeReturnTo } from '@/lib/auth/redirect'
import { copyBackendSetCookies, serverAuthFetchForRequest } from '@/lib/auth/server-auth-fetch'

function wantsJson(request: NextRequest): boolean {
  return (
    request.headers.get('x-auth-refresh') === 'fetch' ||
    request.headers.get('accept')?.includes('application/json') === true
  )
}

function authJson(status: number, body: { loginUrl?: string; status: string }): NextResponse {
  return NextResponse.json(body, { status })
}

function redirectToLogin(request: NextRequest, returnTo: string): NextResponse {
  if (wantsJson(request)) {
    const response = authJson(401, { status: 'unauthenticated', loginUrl: buildLoginRedirect(returnTo) })
    clearAuthCookies(response)
    return response
  }

  const response = NextResponse.redirect(new URL(buildLoginRedirect(returnTo), request.nextUrl.origin))
  clearAuthCookies(response)
  return response
}

function redirectToReturnTo(request: NextRequest, returnTo: string): NextResponse {
  if (wantsJson(request)) {
    return authJson(409, { status: 'already_rotated' })
  }
  return NextResponse.redirect(new URL(returnTo, request.nextUrl.origin))
}

export async function GET(request: NextRequest) {
  const returnTo = normalizeReturnTo(request.nextUrl.searchParams.get('returnTo'))

  let backendResponse: Response
  try {
    backendResponse = await serverAuthFetchForRequest(request, 'auth/refresh', {
      method: 'POST',
    })
  } catch {
    return redirectToLogin(request, returnTo)
  }

  if (backendResponse.status === 409) {
    return redirectToReturnTo(request, returnTo)
  }

  if (!backendResponse.ok) {
    return redirectToLogin(request, returnTo)
  }

  if (wantsJson(request)) {
    const response = authJson(200, { status: 'ok' })
    copyBackendSetCookies(backendResponse.headers, response)
    return response
  }

  const response = NextResponse.redirect(new URL(returnTo, request.nextUrl.origin))
  copyBackendSetCookies(backendResponse.headers, response)
  return response
}
