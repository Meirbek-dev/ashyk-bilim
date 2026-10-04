/**
 * The `embedBlock` node: `{type, url, width, height}`. `type` is a provider id from the old catalog
 * (youtube, excalidraw, google-docs...) or `url`, a page of a known service. Unknown provider ids from old
 * documents render like `url`. Whatever the type, the iframe address must be on `EMBED_HOSTS`: never our own
 * origin, a relative path or an arbitrary page (B-EDT-21).
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

// The third-party services of the old embed catalog (and their player hosts); a host matches with its subdomains.
const EMBED_HOSTS = [
  'airtable.com',
  'blooket.com',
  'brilliant.org',
  'canva.com',
  'chatgpt.com',
  'chemtube3d.com',
  'clickup.com',
  'coda.io',
  'codepen.io',
  'codesandbox.io',
  'codesnip.dev',
  'deezer.com',
  'desmos.com',
  'discord.com',
  'discord.gg',
  'edpuzzle.com',
  'excalidraw.com',
  'explaineverything.com',
  'figma.com',
  'flip.com',
  'gamma.app',
  'genially.com',
  'geogebra.org',
  'gist.github.com',
  'gitpod.io',
  'glitch.com',
  'google.com',
  'h5p.com',
  'h5p.org',
  'huggingface.co',
  'hyperbeam.com',
  'jotform.com',
  'jsfiddle.net',
  'kaggle.com',
  'kahoot.it',
  'kaltura.com',
  'live.com',
  'loom.com',
  'lottiefiles.com',
  'mentimeter.com',
  'microsoft.com',
  'miro.com',
  'mixcloud.com',
  'molview.org',
  'mural.co',
  'mybinder.org',
  'nearpod.com',
  'notion.so',
  'observablehq.com',
  'office.com',
  'openai.com',
  'overleaf.com',
  'padlet.com',
  'panopto.com',
  'phet.colorado.edu',
  'pitch.com',
  'plickers.com',
  'polleverywhere.com',
  'ppt-online.org',
  'prezi.com',
  'quizizz.com',
  'quizlet.com',
  'replit.com',
  'rutube.ru',
  'sketchfab.com',
  'sketchpad.app',
  'sli.do',
  'slides.com',
  'slido.com',
  'sodaphonic.com',
  'soundcloud.com',
  'spline.design',
  'spotify.com',
  'stackblitz.com',
  'stepik.org',
  'suno.com',
  'symbolab.com',
  't.me',
  'tableau.com',
  'tally.so',
  'ted.com',
  'texlyre.com',
  'tldraw.com',
  'trello.com',
  'typeform.com',
  'vimeo.com',
  'vk.com',
  'vkvideo.ru',
  'wakelet.com',
  'wandb.ai',
  'wistia.com',
  'wistia.net',
  'wolframalpha.com',
  'wooclap.com',
  'wordwall.net',
  'yandex.com',
  'yandex.ru',
  'youtube-nocookie.com',
]

// Players that keep state in their own storage and break in an opaque origin. `allow-same-origin` lets a frame
// keep *its own* origin; these hosts are never ours, so it grants nothing over our window.
const OWN_ORIGIN_PLAYERS = [
  'youtube-nocookie.com',
  'vimeo.com',
  'google.com',
  'spotify.com',
  'excalidraw.com',
  'tldraw.com',
  'figma.com',
  'codepen.io',
]

const onHosts = (url: URL, hosts: readonly string[]) => hosts.some(host => hostIs(url, host))

const YOUTUBE_ID = /^[\w-]{11}$/
const videoId = (id: string | null | undefined) => (id && YOUTUBE_ID.test(id) ? id : null)

/** The video id of a youtube.com/watch, youtu.be, /embed/ or /shorts/ URL, or a bare 11-character id. */
export function youTubeId(value: string): string | null {
  const url = parse(value)
  if (!url) return videoId(value.trim())
  if (url.protocol !== 'https:') return null
  if (url.hostname === 'youtu.be') return videoId(url.pathname.slice(1).split('/')[0])
  if (!hostIs(url, 'youtube.com')) return null
  if (url.pathname === '/watch') return videoId(url.searchParams.get('v'))
  return videoId(/^\/(embed|shorts)\/([^/?#]+)/.exec(url.pathname)?.[2])
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

/** The iframe `src` for an embed, or null when the stored URL cannot be shown safely: https on `EMBED_HOSTS` only. */
export function embedSrc(type: string | null, value: string | null): string | null {
  if (!value) return null
  if (type === 'youtube' || (type === null && youTubeId(value))) {
    const id = youTubeId(value)
    return id ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0` : null
  }
  const url = parse(value)
  if (url?.protocol !== 'https:') return null
  const source = type && Object.hasOwn(SOURCES, type) ? SOURCES[type] : undefined
  const src = parse(source ? source(url) : url.href)
  return src?.protocol === 'https:' && !src.username && !src.password && onHosts(src, EMBED_HOSTS) ? src.href : null
}

/** True for an address of the page's own site (absolute on its host, or a path): never framed, the server refuses it. */
export function isOwnSite(value: string, origin: string): boolean {
  const text = value.trim()
  const url = parse(text) ?? (/^[./]/.test(text) ? parse(new URL(text, origin).href) : null)
  return url !== null && url.hostname.replace(/\.$/, '') === new URL(origin).hostname
}

/** The iframe sandbox for an `embedSrc` address: no top navigation ever; own origin only for `OWN_ORIGIN_PLAYERS`. */
export function embedSandbox(src: string): string {
  const url = parse(src)
  const own = url?.protocol === 'https:' && onHosts(url, OWN_ORIGIN_PLAYERS) ? ' allow-same-origin' : ''
  return `allow-scripts${own} allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation`
}
