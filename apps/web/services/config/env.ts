import * as v from 'valibot';

const NonEmptyStringSchema = v.pipe(v.string(), v.trim(), v.minLength(1));
const UrlSchema = v.pipe(NonEmptyStringSchema, v.url());

const PublicEnvSchema = v.object({
  NEXT_PUBLIC_SITE_URL: UrlSchema,
  NEXT_PUBLIC_API_URL: UrlSchema,
  NEXT_PUBLIC_MEDIA_URL: v.optional(UrlSchema),
});

const ServerEnvSchema = v.object({
  INTERNAL_API_URL: v.optional(UrlSchema),
  APP_URL: v.optional(UrlSchema),
  COOKIE_DOMAIN: v.optional(NonEmptyStringSchema),
});

export interface ConfigIssue {
  scope: 'public' | 'server';
  key: string;
  message: string;
}

export interface PublicConfig {
  siteUrl: string;
  siteOrigin: string;
  siteHost: string;
  siteHostname: string;
  apiUrl: string;
  mediaUrl: string;
}

export interface ServerConfig {
  internalApiUrl?: string;
  appUrl: string;
  appOrigin: string;
  appHost: string;
  cookieDomain?: string;
  cookieSecure: boolean;
}

export interface AppConfig extends PublicConfig, ServerConfig {}

type PublicEnv = v.InferOutput<typeof PublicEnvSchema>;
type ServerEnv = v.InferOutput<typeof ServerEnvSchema>;

type ResolutionResult<T> =
  | { success: true; config: T; errors: [] }
  | { success: false; config: null; errors: ConfigIssue[] };

const getOptionalEnvValue = (value: string | undefined): string | undefined => {
  if (value === undefined) return undefined;

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
};

const ensureTrailingSlash = (value: string) => (value.endsWith('/') ? value : `${value}/`);

const normalizeSiteUrl = (value: string) => `${new URL(value).origin}/`;

const normalizePathUrl = (value: string) => ensureTrailingSlash(new URL(value).toString());

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

const normalizeCookieDomain = (value: string): string => value.trim().replace(/^\.+/, '');

const deriveCookieDomain = (inputUrl: string, explicitCookieDomain?: string) => {
  const manualDomain = getOptionalEnvValue(explicitCookieDomain);
  if (manualDomain) return normalizeCookieDomain(manualDomain);

  const { hostname } = new URL(inputUrl);
  return isUnsupportedCookieDomain(hostname) ? undefined : hostname;
};

const mapIssues = (scope: 'public' | 'server', issues: unknown): ConfigIssue[] => {
  if (!Array.isArray(issues)) {
    return [{ scope, key: 'unknown', message: 'Unknown validation error' }];
  }

  return issues.map((issue) => {
    const typedIssue = issue as { message?: string; path?: { key?: string | number }[] };
    const key = typedIssue.path?.find((segment) => typeof segment.key === 'string')?.key;
    return {
      scope,
      key: typeof key === 'string' ? key : 'unknown',
      message: typedIssue.message || 'Invalid environment value',
    };
  });
};

const readPublicEnvInput = () => ({
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_MEDIA_URL: getOptionalEnvValue(process.env.NEXT_PUBLIC_MEDIA_URL),
});

const readServerEnvInput = () => ({
  INTERNAL_API_URL: getOptionalEnvValue(process.env.INTERNAL_API_URL),
  APP_URL: getOptionalEnvValue(process.env.APP_URL) ?? process.env.NEXT_PUBLIC_SITE_URL,
  COOKIE_DOMAIN: getOptionalEnvValue(process.env.COOKIE_DOMAIN),
});

const buildPublicConfig = (env: PublicEnv): PublicConfig => {
  const siteUrl = normalizeSiteUrl(env.NEXT_PUBLIC_SITE_URL);
  const site = new URL(siteUrl);

  return {
    siteUrl,
    siteOrigin: site.origin,
    siteHost: site.host,
    siteHostname: site.hostname,
    apiUrl: normalizePathUrl(env.NEXT_PUBLIC_API_URL),
    mediaUrl: env.NEXT_PUBLIC_MEDIA_URL ? normalizePathUrl(env.NEXT_PUBLIC_MEDIA_URL) : siteUrl,
  };
};

const buildServerConfig = (env: ServerEnv): ServerConfig => {
  const resolvedAppUrl = env.APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL;
  if (!resolvedAppUrl) {
    throw new Error('APP_URL or NEXT_PUBLIC_SITE_URL must be configured');
  }

  const appUrl = new URL(resolvedAppUrl).toString();
  const app = new URL(appUrl);

  return {
    internalApiUrl: env.INTERNAL_API_URL ? normalizePathUrl(env.INTERNAL_API_URL) : undefined,
    appUrl,
    appOrigin: app.origin,
    appHost: app.host,
    cookieDomain: deriveCookieDomain(appUrl, env.COOKIE_DOMAIN),
    cookieSecure: app.protocol === 'https:',
  };
};

const resolvePublicConfig = (): ResolutionResult<PublicConfig> => {
  const parsed = v.safeParse(PublicEnvSchema, readPublicEnvInput());
  if (!parsed.success) {
    return {
      success: false,
      config: null,
      errors: mapIssues('public', parsed.issues),
    };
  }

  return {
    success: true,
    config: buildPublicConfig(parsed.output),
    errors: [],
  };
};

const resolveServerConfig = (): ResolutionResult<ServerConfig> => {
  const parsed = v.safeParse(ServerEnvSchema, readServerEnvInput());
  if (!parsed.success) {
    return {
      success: false,
      config: null,
      errors: mapIssues('server', parsed.issues),
    };
  }

  return {
    success: true,
    config: buildServerConfig(parsed.output),
    errors: [],
  };
};

let publicConfigCache: PublicConfig | null = null;
let serverConfigCache: ServerConfig | null = null;
let appConfigCache: AppConfig | null = null;

export const getPublicConfigResult = () => resolvePublicConfig();

export const getServerConfigResult = () => resolveServerConfig();

export const getAppConfigResult = (): ResolutionResult<AppConfig> => {
  const publicResult = resolvePublicConfig();
  const serverResult = resolveServerConfig();

  if (!publicResult.success || !serverResult.success) {
    return {
      success: false,
      config: null,
      errors: [
        ...(publicResult.success ? [] : publicResult.errors),
        ...(serverResult.success ? [] : serverResult.errors),
      ],
    };
  }

  return {
    success: true,
    config: {
      ...publicResult.config,
      ...serverResult.config,
    },
    errors: [],
  };
};

export const getPublicConfig = (): PublicConfig => {
  if (publicConfigCache) return publicConfigCache;

  const result = resolvePublicConfig();
  if (!result.success) {
    throw new Error(result.errors.map((error) => `${error.key}: ${error.message}`).join('; '));
  }

  publicConfigCache = result.config;
  return publicConfigCache;
};

export const getServerConfig = (): ServerConfig => {
  if (serverConfigCache) return serverConfigCache;

  const result = resolveServerConfig();
  if (!result.success) {
    throw new Error(result.errors.map((error) => `${error.key}: ${error.message}`).join('; '));
  }

  serverConfigCache = result.config;
  return serverConfigCache;
};

export const getAppConfig = (): AppConfig => {
  if (appConfigCache) return appConfigCache;

  const result = getAppConfigResult();
  if (!result.success) {
    throw new Error(result.errors.map((error) => `${error.scope}.${error.key}: ${error.message}`).join('; '));
  }

  appConfigCache = result.config;
  return appConfigCache;
};

export const getServerEnv = () => {
  const serverConfig = getServerConfig();

  return {
    INTERNAL_API_URL: serverConfig.internalApiUrl,
    APP_URL: serverConfig.appUrl,
    COOKIE_DOMAIN: serverConfig.cookieDomain,
  };
};
