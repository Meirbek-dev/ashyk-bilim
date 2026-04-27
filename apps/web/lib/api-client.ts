/**
 * Unified API fetch client.
 *
 * Server-side: forwards only auth cookies from the incoming request so the
 * backend receives auth cookies automatically.
 *
 * Client-side: uses credentials:"include" so cookies are sent automatically.
 * A 401 is treated as an auth refresh opportunity first; the refresh bridge
 * will redirect to login if the refresh cookie is also invalid or missing.
 */

import { getAPIUrl, getServerAPIUrl } from '@services/config/config';
import { isAuthRoute } from '@/lib/auth/redirect';
import { AUTH_COOKIE_NAMES } from '@/lib/auth/types';

type ApiFetchInit = Omit<RequestInit, 'credentials'> & {
  /** Override which base URL to use (defaults to environment-aware selection). */
  baseUrl?: string;
  /** Override the default request timeout. Use false for no client-side timeout. */
  timeoutMs?: number | false;
};

function apiBase(isServer: boolean, baseUrl?: string): string {
  if (baseUrl) return baseUrl;
  return isServer ? getServerAPIUrl() : getAPIUrl();
}

function resolveRequestUrl(pathOrUrl: string, base: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }

  return `${base.replace(/\/+$/, '')}/${pathOrUrl.replace(/^\/+/, '')}`;
}

function isRequestCookieUnavailableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes('during prerendering') ||
    message.includes('prerender is complete') ||
    message.includes('outside a request scope') ||
    message.includes('requestasyncstorage')
  );
}

async function getServerCookieHeader(): Promise<string> {
  try {
    const { cookies } = await import('next/headers');
    const cookieStore = await cookies();

    return cookieStore
      .getAll()
      .filter((c) => (AUTH_COOKIE_NAMES as readonly string[]).includes(c.name))
      .map((c) => `${c.name}=${c.value}`)
      .join('; ');
  } catch (error) {
    if (isRequestCookieUnavailableError(error)) return '';
    throw error;
  }
}

const DEFAULT_TIMEOUT_MS = 30_000; // 30 seconds

function createTimeoutReason(timeoutMs: number): Error {
  const error = new Error(`Request timed out after ${Math.round(timeoutMs / 1000)} seconds`);
  error.name = 'TimeoutError';
  return error;
}

function combineAbortSignals(signals: AbortSignal[]): { signal: AbortSignal; cleanup: () => void } {
  const activeSignals = signals.filter(Boolean);

  if (activeSignals.length === 1) {
    return { signal: activeSignals[0]!, cleanup: () => undefined };
  }

  const controller = new AbortController();
  const listeners: Array<{ signal: AbortSignal; listener: () => void }> = [];

  const abortFrom = (signal: AbortSignal) => {
    if (!controller.signal.aborted) {
      controller.abort(signal.reason ?? new Error('Request aborted'));
    }
  };

  for (const signal of activeSignals) {
    if (signal.aborted) {
      abortFrom(signal);
      continue;
    }

    const listener = () => abortFrom(signal);
    signal.addEventListener('abort', listener, { once: true });
    listeners.push({ signal, listener });
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      for (const { signal, listener } of listeners) {
        signal.removeEventListener('abort', listener);
      }
    },
  };
}

export async function apiFetch(path: string, init: ApiFetchInit = {}): Promise<Response> {
  const isServer = typeof globalThis.window === 'undefined';
  const { baseUrl, timeoutMs = DEFAULT_TIMEOUT_MS, signal: callerSignal, ...fetchInit } = init;
  const base = apiBase(isServer, baseUrl);
  const url = resolveRequestUrl(path, base);

  const options: RequestInit = { ...fetchInit, credentials: 'include', cache: fetchInit.cache ?? 'no-store' };

  // Server: forward cookies from the incoming request.
  if (isServer) {
    const existingHeaders = new Headers(options.headers ?? {});
    if (!existingHeaders.has('Cookie')) {
      const serverCookieHeader = await getServerCookieHeader();
      if (serverCookieHeader) {
        options.headers = { ...Object.fromEntries(existingHeaders.entries()), Cookie: serverCookieHeader };
      }
    }
  }

  const effectiveTimeoutMs = typeof timeoutMs === 'number' ? timeoutMs : null;
  const timeoutController = effectiveTimeoutMs === null ? null : new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  if (timeoutController && effectiveTimeoutMs !== null && effectiveTimeoutMs > 0) {
    timeoutId = setTimeout(
      () => timeoutController.abort(createTimeoutReason(effectiveTimeoutMs)),
      effectiveTimeoutMs,
    );
  }

  const abortSignals = [callerSignal, timeoutController?.signal].filter(
    (signal): signal is AbortSignal => Boolean(signal),
  );
  const combinedSignal = abortSignals.length > 0 ? combineAbortSignals(abortSignals) : null;

  try {
    const response = await fetch(url, {
      ...options,
      signal: combinedSignal?.signal,
    });

    if (!isServer && response.status === 401) {
      const { pathname, search } = globalThis.location;
      if (!isAuthRoute(pathname)) {
        globalThis.location.assign(`/api/auth/refresh?returnTo=${encodeURIComponent(pathname + search)}`);
      }
    }

    return response;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    combinedSignal?.cleanup();
  }
}

// ── Request utilities (migrated from services/utils/ts/requests.ts) ───────────

type FetchCacheConfig =
  | {
      revalidate?: number | null | undefined;
      tags?: string[];
      cache?: RequestCache | null | undefined;
      [key: string]: any;
    }
  | undefined;

const sanitizeFetchConfig = (config: FetchCacheConfig): { next?: Record<string, any>; cache?: RequestCache } => {
  if (!config) return {};

  const sanitized: Record<string, any> = { ...config };
  let cache: RequestCache | undefined;

  if ('cache' in sanitized) {
    const cacheValue = sanitized.cache;
    if (cacheValue === 'no-store' || cacheValue === 'force-cache' || cacheValue === 'only-if-cached') {
      cache = cacheValue;
    }
    delete sanitized.cache;
  }

  if (sanitized.revalidate !== undefined && sanitized.revalidate !== null) {
    const parsed = Number(sanitized.revalidate);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      cache = 'no-store';
      delete sanitized.revalidate;
    } else {
      sanitized.revalidate = parsed;
    }
  }

  if (Object.keys(sanitized).length === 0) {
    return cache ? { cache } : {};
  }

  return cache ? { next: sanitized, cache } : { next: sanitized };
};

export const RequestBody = (method: string, data: any, next: any) => {
  const headers: Record<string, string> = {};
  const options: RequestInit & { next?: any } = {
    method,
    redirect: 'follow',
    credentials: 'include',
    headers,
  };

  const { next: sanitizedNext, cache } = sanitizeFetchConfig(next);
  if (cache) options.cache = cache;
  if (sanitizedNext) options.next = sanitizedNext;

  if (data !== null) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(data);
  }

  return options;
};

export const apiFetcher = async (url: string) => {
  const response = await apiFetch(url, {
    method: 'GET',
  });
  return errorHandling(response);
};

export const fetchResponseMetadata = async (url: string): Promise<CustomResponseTyping> => {
  const response = await apiFetch(url, {
    method: 'GET',
  });
  return getResponseMetadata(response);
};

export const apiFetcherWithHeaders = async (url: string): Promise<{ data: any; headers: Record<string, string> }> => {
  const response = await apiFetch(url, {
    method: 'GET',
  });
  if (!response.ok) {
    const error: any = new Error(response.statusText || 'Request failed');
    error.status = response.status;
    throw error;
  }
  const data = await response.json();
  const resHeaders: Record<string, string> = {};
  for (const [key, value] of response.headers.entries()) {
    resHeaders[key.toLowerCase()] = value;
  }
  return { data, headers: resHeaders };
};

export const errorHandling = async (res: Response) => {
  if (!res.ok) {
    let data: any;
    try {
      data = await res.json();
    } catch {
      data = null;
    }

    const detail =
      typeof data?.detail === 'string'
        ? data.detail
        : Array.isArray(data?.detail)
          ? data.detail
              .map((item: { msg?: string }) => item?.msg)
              .filter(Boolean)
              .join(', ')
          : res.statusText || 'Request failed';

    const error: any = new Error(detail || 'Request failed');
    error.status = res.status;
    error.data = data;
    error.detail = data?.detail;
    throw error;
  }
  return res.json();
};

export interface CustomResponseTyping {
  success: boolean;
  data: any;
  status: number;
  HTTPmessage: string;
}

export const getResponseMetadata = async (response: Response): Promise<CustomResponseTyping> => {
  let data: any = null;
  try {
    data = await response.json();
  } catch (error) {
    console.warn('Failed to parse response JSON in getResponseMetadata', {
      status: response.status,
      statusText: response.statusText,
      error,
    });
  }

  return {
    success: response.status === 200,
    data,
    status: response.status,
    HTTPmessage: response.statusText,
  };
};

export const revalidateTags = async (tags: string[]) => {
  const uniqueTags = [...new Set(tags)]
    .filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
    .map((tag) => tag.trim());

  if (uniqueTags.length === 0) return;

  const baseUrl = typeof globalThis.window !== 'undefined' ? globalThis.location.origin : '';
  const endpoint = `${baseUrl}/api/revalidate`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: uniqueTags }),
    });
    if (!response.ok) {
      throw new Error(`Failed to revalidate tags (${response.status})`);
    }
  } catch (error) {
    console.warn('Failed to revalidate tags via POST, falling back to per-tag requests', {
      tags: uniqueTags,
      error,
    });
    await Promise.all(
      uniqueTags.map((tag) => {
        const url = `${endpoint}?tag=${encodeURIComponent(tag)}`;
        return fetch(url, { credentials: 'include' });
      }),
    );
  }
};
