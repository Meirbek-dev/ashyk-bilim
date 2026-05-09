const GOOGLE_AVATAR_HOSTS = new Set([
  'lh3.googleusercontent.com',
  'lh4.googleusercontent.com',
  'lh5.googleusercontent.com',
  'lh6.googleusercontent.com',
]);

export const isExternalUrl = (url: string) => url.startsWith('http://') || url.startsWith('https://');

const safeDecodeURIComponent = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

export const extractExternalAvatarUrl = (url: string): string | null => {
  const marker = '/avatars/';
  const markerIndex = url.indexOf(marker);
  if (markerIndex === -1) return null;

  const embeddedUrl = safeDecodeURIComponent(url.slice(markerIndex + marker.length));
  return isExternalUrl(embeddedUrl) ? embeddedUrl : null;
};

export const isGoogleAvatarUrl = (url: string): boolean => {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === 'https:' && GOOGLE_AVATAR_HOSTS.has(parsedUrl.hostname.toLowerCase());
  } catch {
    return false;
  }
};

export const getProxiedAvatarUrl = (url: string): string => `/api/avatar?url=${encodeURIComponent(url)}`;

export const normalizeAvatarUrl = (url: string): string => {
  const externalUrl = extractExternalAvatarUrl(url) ?? (isExternalUrl(url) ? url : null);
  if (!externalUrl) return url;

  return isGoogleAvatarUrl(externalUrl) ? getProxiedAvatarUrl(externalUrl) : externalUrl;
};
