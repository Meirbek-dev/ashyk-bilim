/**
 * The `embedBlock` node: `{type, url, width, height}`. `type` is a provider id from the old catalog
 * (youtube, excalidraw, google-docs...) or `url`, any https page. Unknown provider ids from old documents
 * render like `url`: the iframe shows the stored URL as is, which is what the old web did for them.
 */
const GENERIC_EMBED = 'url'

const parse = (value: string): URL | null => {
  try {
    return new URL(value.trim())
  } catch {
    return null
  }
}

const hostIs = (url: URL, host: string) => url.hostname === host || url.hostname.endsWith(`.${host}`)

/** The video id of a youtube.com/watch, youtu.be, /embed/ or /shorts/ URL, or a bare id. */
export function youTubeId(value: string): string | null {
  const url = parse(value)
  if (!url) return /^[\w-]{6,}$/.test(value.trim()) ? value.trim() : null
  if (url.protocol !== 'https:') return null
  if (url.hostname === 'youtu.be') return url.pathname.slice(1).split('/')[0] || null
  if (!hostIs(url, 'youtube.com')) return null
  if (url.pathname === '/watch') return url.searchParams.get('v') || null
  return /^\/(embed|shorts)\/([^/?#]+)/.exec(url.pathname)?.[2] ?? null
}

// Host (and path, for Google) -> provider id. Only providers whose iframe address differs from the page
// address, plus the ones legacy `blockEmbed` documents point to; every other https page is `url`.
const PROVIDERS: [type: string, match: (url: URL) => boolean][] = [
  ['youtube', url => youTubeId(url.href) !== null],
  ['google-docs', url => hostIs(url, 'docs.google.com') && url.pathname.startsWith('/document/')],
  ['google-slides', url => hostIs(url, 'docs.google.com') && url.pathname.startsWith('/presentation/')],
  ['google-sheets', url => hostIs(url, 'docs.google.com') && url.pathname.startsWith('/spreadsheets/')],
  [
    'google-forms',
    url => (hostIs(url, 'docs.google.com') && url.pathname.startsWith('/forms/')) || hostIs(url, 'forms.gle'),
  ],
  ['vimeo', url => hostIs(url, 'vimeo.com')],
  ['excalidraw', url => url.hostname === 'excalidraw.com'],
  ['tldraw', url => url.hostname === 'tldraw.com'],
  ['figma', url => hostIs(url, 'figma.com')],
  ['codepen', url => hostIs(url, 'codepen.io')],
  ['github-gist', url => url.hostname === 'gist.github.com'],
  ['spotify', url => url.hostname === 'open.spotify.com'],
]

/** The provider of a pasted or legacy URL; `url` when no provider rewrites its address. */
export function embedTypeForUrl(value: string): string {
  const url = parse(value)
  if (!url) return youTubeId(value) ? 'youtube' : GENERIC_EMBED
  return PROVIDERS.find(([, match]) => match(url))?.[0] ?? GENERIC_EMBED
}

const withParam = (url: URL, key: string, value: string) => {
  url.searchParams.set(key, value)
  return url.href
}

const SOURCES: Record<string, (url: URL) => string> = {
  excalidraw: url => withParam(url, 'embed', '1'),
  tldraw: url => withParam(url, 'embed', '1'),
  telegram: url => withParam(url, 'embed', '1'),
  vimeo: url =>
    url.hostname === 'player.vimeo.com'
      ? url.href
      : `https://player.vimeo.com/video/${url.pathname.split('/')[1] ?? ''}`,
  codepen: url => `${url.origin}${url.pathname.replace('/pen/', '/embed/')}${url.search}`,
  figma: url => `https://www.figma.com/embed?embed_host=ashyk-bilim&url=${encodeURIComponent(url.href)}`,
  'github-gist': url => (url.href.endsWith('.pibb') ? url.href : `${url.href}.pibb`),
  spotify: url => (url.pathname.startsWith('/embed/') ? url.href : `${url.origin}/embed${url.pathname}${url.search}`),
  'google-slides': url => url.href.replace(/\/edit(\?.*)?$/, '/embed'),
  'google-docs': url => (url.pathname.includes('/pub') ? url.href : url.href.replace(/\/edit([?#].*)?$/, '/preview')),
  quizizz: url => url.href.replace('/admin/quiz/', '/embed/quiz/'),
  edpuzzle: url => url.href.replace('/media/', '/embed/media/'),
}

/** The iframe `src` for an embed, or null when the stored URL cannot be shown safely (https only). */
export function embedSrc(type: string | null, value: string | null): string | null {
  if (!value) return null
  if (type === 'youtube' || (type === null && youTubeId(value))) {
    const id = youTubeId(value)
    return id ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0` : null
  }
  const url = parse(value)
  if (url?.protocol !== 'https:') return null
  const source = type && Object.hasOwn(SOURCES, type) ? SOURCES[type] : undefined
  return source ? source(url) : url.href
}
