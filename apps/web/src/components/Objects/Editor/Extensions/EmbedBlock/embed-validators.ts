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
  const isYouTubeHost =
    hostname === 'www.youtube.com' || hostname === 'youtube.com';
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
export function validateExcalidrawUrl(
  url: string,
): null | 'errorEmpty' | 'errorInvalid' {
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
export function validateTldrawUrl(
  url: string,
): null | 'errorEmpty' | 'errorInvalid' {
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
