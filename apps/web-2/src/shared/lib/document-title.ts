import { createIsomorphicFn } from '@tanstack/react-start'

import { m } from '#/paraglide/messages'
import { serverEnv } from '#/shared/lib/env.server'

import { contentUrl } from './content-url'

/** The document title: the page's name, then the brand («Python · Ashyq Bilim»); the brand alone without a name. */
export const documentTitle = (name?: string | null): string =>
  name ? `${name} · ${m.platform_brand()}` : m.platform_brand()

type TitledMatch = { staticData: { title?: () => string } }

/**
 * A tab's document title: the open tab before its object («Журнал · Python · Ashyq Bilim»), so browser tabs and
 * history tell a course's tabs apart. `layout` is the match whose tabs these are; on the layout itself, its name.
 */
export const tabTitle = (name: string, layout: TitledMatch, matches: readonly TitledMatch[]): string => {
  const open = matches.at(-1)
  const tab = open && open !== layout ? open.staticData.title?.() : undefined
  return documentTitle(tab ? `${tab} · ${name}` : name)
}

// Link previews and shared links need absolute URLs: the public origin on the server, the page's own in the browser.
export const siteOrigin = createIsomorphicFn()
  .server(() => serverEnv.publicOrigin)
  .client(() => new URL(document.baseURI).origin)

type PageMetaOptions = {
  /** The landing's own title (the platform name alone); else `documentTitle(name)`. */
  title?: string
  /** A public storage key (a course or platform cover); else the brand share card. */
  imageKey?: string | null
}

/**
 * A public page's head: its title, and for search results and link previews (messengers, social) its name, one line
 * on what it is and a picture. `og:title` carries the bare name: the preview shows the site name on its own.
 */
export const pageMeta = (name: string, description?: string | null, options: PageMetaOptions = {}) => {
  const path = options.imageKey ? contentUrl(options.imageKey) : '/brand/share-card.png'
  const image = path.startsWith('/') ? `${siteOrigin()}${path}` : path
  return [
    { title: options.title ?? documentTitle(name) },
    ...(description ? [{ name: 'description', content: description }] : []),
    { property: 'og:type', content: 'website' },
    { property: 'og:site_name', content: m.platform_brand() },
    { property: 'og:title', content: name },
    ...(description ? [{ property: 'og:description', content: description }] : []),
    { property: 'og:image', content: image },
    { name: 'twitter:card', content: 'summary_large_image' },
  ]
}
