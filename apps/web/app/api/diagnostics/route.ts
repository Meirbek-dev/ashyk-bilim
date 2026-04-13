import { connection, NextResponse } from 'next/server';

import { getAppConfigResult, getPublicConfigResult, getServerConfigResult } from '@/services/config/env';

export async function GET() {
  await connection();

  const diagnostics = {
    timestamp: new Date().toISOString(),
    nodeEnv: process.env.NODE_ENV,
    checks: {} as Record<string, any>,
  };

  try {
    const publicConfig = getPublicConfigResult();
    const serverConfig = getServerConfigResult();
    const appConfig = getAppConfigResult();

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
    };

    // Check backend connectivity
    try {
      const backendUrl = serverConfig.success
        ? (serverConfig.config.internalApiUrl ?? (publicConfig.success ? publicConfig.config.apiUrl : null))
        : publicConfig.success
          ? publicConfig.config.apiUrl
          : null;

      if (!backendUrl) {
        throw new Error('Backend URL unavailable because configuration is invalid');
      }

      const response = await fetch(`${backendUrl}health`, {
        signal: AbortSignal.timeout(5000),
      });
      diagnostics.checks.backend = {
        status: response.ok ? 'healthy' : 'unhealthy',
        statusCode: response.status,
        url: backendUrl,
      };
    } catch (error: any) {
      diagnostics.checks.backend = {
        status: 'error',
        error: error.message,
        code: error.code,
      };
    }

    // Check cookies functionality
    try {
      const { cookies } = await import('next/headers');
      await cookies();
      diagnostics.checks.cookies = { status: 'working' };
    } catch (error: any) {
      diagnostics.checks.cookies = {
        status: 'error',
        error: error.message,
      };
    }

    // Check i18n
    try {
      const { getUserLocale } = await import('@/i18n/locale');
      const locale = await getUserLocale();
      diagnostics.checks.i18n = {
        status: 'working',
        currentLocale: locale,
      };
    } catch (error: any) {
      diagnostics.checks.i18n = {
        status: 'error',
        error: error.message,
        stack: error.stack,
      };
    }

    // Check auth
    try {
      const { getSession } = await import('@/lib/auth/session');
      const session = await getSession();
      diagnostics.checks.auth = {
        status: 'working',
        hasSession: Boolean(session),
        hasUser: Boolean(session?.user),
      };
    } catch (error: any) {
      diagnostics.checks.auth = {
        status: 'error',
        error: error.message,
        stack: error.stack,
      };
    }

    return NextResponse.json(diagnostics, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, must-revalidate',
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: 'Diagnostic failed',
        message: error.message,
        stack: error.stack,
        ...diagnostics,
      },
      { status: 500 },
    );
  }
}
