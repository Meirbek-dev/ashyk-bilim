import { NextResponse } from 'next/server'

import { getAppConfigResult, getPublicConfigResult, getServerConfigResult } from '@/services/config/env'

interface DiagnosticsPayload {
  timestamp: string
  nodeEnv: string | undefined
  checks: DiagnosticsChecks
}

type BackendErrorCheck =
  | {
      status: 'error'
      error: string
    }
  | {
      status: 'error'
      error: string
      code: string
    }

type StackErrorCheck =
  | {
      status: 'error'
      error: string
    }
  | {
      status: 'error'
      error: string
      stack: string
    }

interface DiagnosticsChecks {
  envVars?: {
    status: 'checking'
    publicConfigValid: boolean
    serverConfigValid: boolean
    issues: unknown[]
    resolved: {
      siteUrl: string | null
      apiUrl: string | null
      mediaUrl: string | null
      internalApiUrl: string | null
      appUrl: string | null
      cookieDomain: string | null
      cookieSecure: boolean | null
    }
  }
  backend?:
    | {
        status: 'healthy' | 'unhealthy'
        statusCode: number
        url: string
      }
    | BackendErrorCheck
  cookies?:
    | { status: 'working' }
    | {
        status: 'error'
        error: string
      }
  i18n?:
    | {
        status: 'working'
        currentLocale: string
      }
    | StackErrorCheck
  auth?:
    | {
        status: 'working'
        hasSession: boolean
        hasUser: boolean
      }
    | StackErrorCheck
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error'
}

function getErrorStack(error: unknown): string | undefined {
  return error instanceof Error ? error.stack : undefined
}

function getErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return undefined
  }

  const code = Reflect.get(error, 'code')
  return typeof code === 'string' ? code : undefined
}

function buildBackendErrorCheck(error: unknown): BackendErrorCheck {
  const code = getErrorCode(error)

  if (code === undefined) {
    return {
      status: 'error',
      error: getErrorMessage(error),
    }
  }

  return {
    status: 'error',
    error: getErrorMessage(error),
    code,
  }
}

function buildStackErrorCheck(error: unknown): StackErrorCheck {
  const stack = getErrorStack(error)

  if (stack === undefined) {
    return {
      status: 'error',
      error: getErrorMessage(error),
    }
  }

  return {
    status: 'error',
    error: getErrorMessage(error),
    stack,
  }
}

export async function GET() {
  // Diagnostics expose internal URLs, config, and connectivity — block in production.
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const diagnostics: DiagnosticsPayload = {
    timestamp: new Date().toISOString(),
    nodeEnv: process.env.NODE_ENV,
    checks: {},
  }

  try {
    const publicConfig = getPublicConfigResult()
    const serverConfig = getServerConfigResult()
    const appConfig = getAppConfigResult()

    // Check environment variables
    diagnostics.checks.envVars = {
      status: 'checking',
      publicConfigValid: publicConfig.success,
      serverConfigValid: serverConfig.success,
      issues: appConfig.success ? [] : appConfig.errors,
      resolved: {
        siteUrl: publicConfig.success ? publicConfig.config.siteUrl : null,
        apiUrl: publicConfig.success ? publicConfig.config.apiUrl : null,
        mediaUrl: publicConfig.success ? publicConfig.config.mediaUrl : null,
        internalApiUrl: serverConfig.success ? (serverConfig.config.internalApiUrl ?? null) : null,
        appUrl: serverConfig.success ? serverConfig.config.appUrl : null,
        cookieDomain: serverConfig.success ? (serverConfig.config.cookieDomain ?? null) : null,
        cookieSecure: serverConfig.success ? serverConfig.config.cookieSecure : null,
      },
    }

    // Check backend connectivity
    try {
      const backendUrl = serverConfig.success
        ? (serverConfig.config.internalApiUrl ?? (publicConfig.success ? publicConfig.config.apiUrl : null))
        : publicConfig.success
          ? publicConfig.config.apiUrl
          : null

      if (!backendUrl) {
        throw new Error('Backend URL unavailable because configuration is invalid')
      }

      const response = await fetch(`${backendUrl}health`, {
        signal: AbortSignal.timeout(5000),
      })
      diagnostics.checks.backend = {
        status: response.ok ? 'healthy' : 'unhealthy',
        statusCode: response.status,
        url: backendUrl,
      }
    } catch (error: unknown) {
      diagnostics.checks.backend = buildBackendErrorCheck(error)
    }

    // Check cookies functionality
    try {
      const { cookies } = await import('next/headers')
      await cookies()
      diagnostics.checks.cookies = { status: 'working' }
    } catch (error: unknown) {
      diagnostics.checks.cookies = {
        status: 'error',
        error: getErrorMessage(error),
      }
    }

    // Check i18n
    try {
      const { getUserLocale } = await import('@/i18n/locale')
      const locale = await getUserLocale()
      diagnostics.checks.i18n = {
        status: 'working',
        currentLocale: locale,
      }
    } catch (error: unknown) {
      diagnostics.checks.i18n = buildStackErrorCheck(error)
    }

    // Check auth
    try {
      const { getSession } = await import('@/lib/auth/session')
      const session = await getSession()
      diagnostics.checks.auth = {
        status: 'working',
        hasSession: Boolean(session),
        hasUser: Boolean(session?.user),
      }
    } catch (error: unknown) {
      diagnostics.checks.auth = buildStackErrorCheck(error)
    }

    return NextResponse.json(diagnostics, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, must-revalidate',
      },
    })
  } catch (error: unknown) {
    const errorCheck = buildStackErrorCheck(error)
    return NextResponse.json(
      {
        error: 'Diagnostic failed',
        message: getErrorMessage(error),
        ...('stack' in errorCheck ? { stack: errorCheck.stack } : {}),
        ...diagnostics,
      },
      { status: 500 },
    )
  }
}
