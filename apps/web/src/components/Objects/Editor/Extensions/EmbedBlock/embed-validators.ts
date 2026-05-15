import { getEmbedProvider, isEmbedType } from './embed-options';
import type { EmbedType } from './embed-options';

export type EmbedValidationError = 'errorEmpty' | 'errorInvalid';

/**
 * Pure URL validation and transformation helpers for the EmbedBlock extension.
 *
 * These functions are intentionally side-effect-free so they can be tested
 * with property-based tests (fast-check) and reused across the EmbedPanel
 * forms and the NodeView src builders.
 */

// ---------------------------------------------------------------------------
// YouTube
// ---------------------------------------------------------------------------

/**
 * Parses a YouTube URL and returns the video ID, or `null` if the URL does
 * not match any of the four supported formats:
 *
 *   - https://www.youtube.com/watch?v=<id>
 *   - https://youtu.be/<id>
 *   - https://www.youtube.com/embed/<id>
 *   - https://www.youtube.com/shorts/<id>
 *
 * The video ID must be a non-empty string. Whitespace-only IDs are rejected.
 */
export function parseYouTubeUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const { protocol, hostname, pathname, searchParams } = parsed;

  // Only accept https:// URLs (the four supported formats all use https)
  if (protocol !== 'https:') return null;

  // Normalise hostname: accept "youtube.com" and "www.youtube.com"
  const isYouTubeHost = hostname === 'www.youtube.com' || hostname === 'youtube.com';
  const isYouTuBeHost = hostname === 'youtu.be';

  if (isYouTuBeHost) {
    // https://youtu.be/<id>
    const id = pathname.slice(1); // strip leading "/"
    return id.length > 0 ? id : null;
  }

  if (isYouTubeHost) {
    // https://www.youtube.com/watch?v=<id>
    if (pathname === '/watch') {
      const id = searchParams.get('v');
      return id && id.length > 0 ? id : null;
    }

    // https://www.youtube.com/embed/<id>
    const embedMatch = pathname.match(/^\/embed\/([^/?#]+)/);
    if (embedMatch) {
      const id = embedMatch[1];
      return id && id.length > 0 ? id : null;
    }

    // https://www.youtube.com/shorts/<id>
    const shortsMatch = pathname.match(/^\/shorts\/([^/?#]+)/);
    if (shortsMatch) {
      const id = shortsMatch[1];
      return id && id.length > 0 ? id : null;
    }
  }

  return null;
}

export function resolveYouTubeVideoId(value: string): string | null {
  const parsed = parseYouTubeUrl(value);
  if (parsed) return parsed;

  const trimmed = value.trim();
  return /^[a-zA-Z0-9_-]{6,}$/.test(trimmed) ? trimmed : null;
}

// ---------------------------------------------------------------------------
// Excalidraw
// ---------------------------------------------------------------------------

/**
 * Validates an Excalidraw share URL.
 *
 * Returns:
 *   - `'errorEmpty'`   — the trimmed input is blank
 *   - `'errorInvalid'` — non-empty but not a valid absolute URL, or the
 *                        hostname is not exactly `excalidraw.com`
 *   - `null`           — valid (absolute URL with hostname `excalidraw.com`)
 */
export function validateExcalidrawUrl(url: string): null | EmbedValidationError {
  if (url.trim() === '') return 'errorEmpty';

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'errorInvalid';
  }

  if (parsed.hostname !== 'excalidraw.com') return 'errorInvalid';

  return null;
}

/**
 * Builds the `src` for an Excalidraw `<iframe>` by appending `?embed=1`
 * (or `&embed=1` if the URL already contains a query string).
 *
 * Assumes the caller has already validated the URL with `validateExcalidrawUrl`.
 */
export function buildExcalidrawSrc(url: string): string {
  return url.includes('?') ? `${url}&embed=1` : `${url}?embed=1`;
}

// ---------------------------------------------------------------------------
// tldraw
// ---------------------------------------------------------------------------

/**
 * Validates a tldraw share URL.
 *
 * A valid tldraw share URL must:
 *   - be a valid absolute URL
 *   - have hostname exactly `tldraw.com`
 *   - have a path matching `/r/<room-id>` where `<room-id>` is non-empty
 *
 * Returns:
 *   - `'errorEmpty'`   — the trimmed input is blank
 *   - `'errorInvalid'` — non-empty but fails any of the above checks
 *   - `null`           — valid
 */
export function validateTldrawUrl(url: string): null | EmbedValidationError {
  if (url.trim() === '') return 'errorEmpty';

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'errorInvalid';
  }

  if (parsed.hostname !== 'tldraw.com') return 'errorInvalid';

  // Path must be /r/<non-empty-room-id> with no further path segments
  if (!/^\/r\/[^/]+$/.test(parsed.pathname)) return 'errorInvalid';

  return null;
}

/**
 * Builds the `src` for a tldraw `<iframe>` by appending `?embed=1`
 * (or `&embed=1` if the URL already contains a query string).
 *
 * Assumes the caller has already validated the URL with `validateTldrawUrl`.
 */
export function buildTldrawSrc(url: string): string {
  return url.includes('?') ? `${url}&embed=1` : `${url}?embed=1`;
}

// ---------------------------------------------------------------------------
// Provider-driven validation
// ---------------------------------------------------------------------------

function parseAbsoluteUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function hostnameMatches(hostname: string, allowedHost: string): boolean {
  return hostname === allowedHost || hostname.endsWith(`.${allowedHost}`);
}

function validateProviderUrl(type: EmbedType, url: string): null | EmbedValidationError {
  if (url.trim() === '') return 'errorEmpty';

  if (type === 'youtube') {
    return resolveYouTubeVideoId(url) ? null : 'errorInvalid';
  }

  if (type === 'excalidraw') {
    return validateExcalidrawUrl(url);
  }

  if (type === 'tldraw') {
    return validateTldrawUrl(url);
  }

  const provider = getEmbedProvider(type);
  const parsed = parseAbsoluteUrl(url);

  if (!provider || !parsed || parsed.protocol !== 'https:') {
    return 'errorInvalid';
  }

  const hostname = parsed.hostname.toLowerCase();
  const isAllowedHost = provider.hostnames.some((allowedHost) => hostnameMatches(hostname, allowedHost.toLowerCase()));

  return isAllowedHost ? null : 'errorInvalid';
}

export function validateEmbedUrl(
  type: EmbedType | string | null | undefined,
  url: string,
): null | EmbedValidationError {
  if (!type || !isEmbedType(type)) return 'errorInvalid';
  return validateProviderUrl(type, url);
}

function appendQueryParam(url: string, key: string, value: string): string {
  const [withoutHash = '', hash = ''] = url.split('#');
  const separator = withoutHash.includes('?') ? '&' : '?';
  return `${withoutHash}${separator}${key}=${encodeURIComponent(value)}${hash ? `#${hash}` : ''}`;
}

function buildVimeoSrc(url: string): string {
  const parsed = parseAbsoluteUrl(url);
  if (!parsed) return url;

  if (parsed.hostname === 'player.vimeo.com') return url;

  const id = parsed.pathname.split('/').filter(Boolean)[0];
  return id ? `https://player.vimeo.com/video/${id}` : url;
}

function buildCodePenSrc(url: string): string {
  const parsed = parseAbsoluteUrl(url);
  if (!parsed) return url;

  const path = parsed.pathname.replace('/pen/', '/embed/');
  return `${parsed.origin}${path}${parsed.search}`;
}

function buildFigmaSrc(url: string): string {
  return `https://www.figma.com/embed?embed_host=ashyk-bilim&url=${encodeURIComponent(url)}`;
}

function buildGistSrc(url: string): string {
  return url.endsWith('.pibb') ? url : `${url}.pibb`;
}

function buildSpotifySrc(url: string): string {
  const parsed = parseAbsoluteUrl(url);
  if (!parsed || parsed.pathname.startsWith('/embed/')) return url;
  return `${parsed.origin}/embed${parsed.pathname}${parsed.search}`;
}

function buildGenericEmbeddableSrc(type: EmbedType, url: string): string {
  switch (type) {
    case 'youtube': {
      const videoId = resolveYouTubeVideoId(url);
      return videoId ? `https://www.youtube.com/embed/${videoId}?rel=0` : url;
    }
    case 'excalidraw':
      return buildExcalidrawSrc(url);
    case 'tldraw':
      return buildTldrawSrc(url);
    case 'vimeo':
      return buildVimeoSrc(url);
    case 'codepen':
      return buildCodePenSrc(url);
    case 'figma':
      return buildFigmaSrc(url);
    case 'github-gist':
      return buildGistSrc(url);
    case 'spotify':
      return buildSpotifySrc(url);
    default:
      return url;
  }
}

export function buildEmbedSrc(type: EmbedType | string | null | undefined, url: string): string {
  if (!type || !isEmbedType(type)) return url;
  return buildGenericEmbeddableSrc(type, url);
}

export function normalizeEmbedUrl(type: EmbedType, url: string): string {
  if (type === 'youtube') {
    return resolveYouTubeVideoId(url) ?? url.trim();
  }

  if (type === 'phet' && !url.includes('fullscreen')) {
    return appendQueryParam(url.trim(), 'simulation', 'true');
  }

  return url.trim();
}
