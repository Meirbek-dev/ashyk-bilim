import { getPublicConfig, getServerConfigResult } from './env';

const toAbsoluteUrl = (path: string, baseUrl: string) => new URL(path, baseUrl).toString();

const isLikelyIPv4 = (host: string) => {
  if (!host) return false;
  const parts = host.split('.');
  if (parts.length !== 4) return false;
  return parts.every((segment) => {
    if (!/^(\d{1,3})$/.test(segment)) return false;
    const numericValue = Number(segment);
    return numericValue >= 0 && numericValue <= 255;
  });
};

const isLikelyIPv6 = (host: string) => host.includes(':');

const isUnsupportedCookieDomain = (host?: string | null) => {
  if (!host) return true;
  if (host === 'localhost') return true;
  if (isLikelyIPv4(host) || isLikelyIPv6(host)) return true;
  return false;
};

/**
 * Resolves the API base URL (always ending with a slash).
 * Shared code should use getAPIUrl(). It resolves to the public browser URL
 * on the client and the internal Docker/backend URL on the server.
 * Server-only code can use getServerAPIUrl() explicitly when needed.
 */
export const getPublicAPIUrl = () => getPublicConfig().apiUrl;

export const getServerAPIUrl = () => {
  const serverConfigResult = getServerConfigResult();
  if (serverConfigResult.success && serverConfigResult.config.internalApiUrl) {
    return serverConfigResult.config.internalApiUrl;
  }

  return getPublicAPIUrl();
};

export const getAPIUrl = () => {
  if (typeof globalThis.window === 'undefined') {
    return getServerAPIUrl();
  }

  return getPublicAPIUrl();
};

export const getSiteUrl = () => getPublicConfig().siteUrl;

export const getBackendUrl = () => getSiteUrl();

export const getAbsoluteUrl = (path: string) => toAbsoluteUrl(path, getSiteUrl());

export const getTopLevelCookieDomain = () => {
  const override = process.env.COOKIE_DOMAIN?.trim();
  if (override) return override;

  const cookieSourceUrl = process.env.APP_URL?.trim() || getSiteUrl();
  const { hostname } = new URL(cookieSourceUrl);
  return isUnsupportedCookieDomain(hostname) ? undefined : hostname;
};
