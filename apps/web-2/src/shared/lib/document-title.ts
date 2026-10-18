import { m } from '#/paraglide/messages'

/** The document title: the page's name, then the brand («Python · Ashyq Bilim»); the brand alone without a name. */
export const documentTitle = (name?: string | null): string =>
  name ? `${name} · ${m.platform_brand()}` : m.platform_brand()

/**
 * A public page's head: its title, and for search results and link previews (messengers, social) its name and one
 * line on what it is. `og:title` carries the bare name: the preview shows the site name on its own. The landing
 * passes its own `title` (the platform name alone).
 */
export const pageMeta = (name: string, description?: string | null, title = documentTitle(name)) => [
  { title },
  ...(description ? [{ name: 'description', content: description }] : []),
  { property: 'og:type', content: 'website' },
  { property: 'og:site_name', content: m.platform_brand() },
  { property: 'og:title', content: name },
  ...(description ? [{ property: 'og:description', content: description }] : []),
]
