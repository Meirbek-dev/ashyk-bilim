import { isNotFound } from '@tanstack/react-router'
import { createIsomorphicFn } from '@tanstack/react-start'

import { m } from '#/paraglide/messages'
import { ApiError } from '#/shared/api/errors'
import { serverEnv } from '#/shared/lib/env.server'

import { contentUrl } from './content-url'

/** The document title: the page's name, then the brand («Python · Ashyq Bilim»); the brand alone without a name. */
export const documentTitle = (name?: string | null): string =>
  name ? `${name} · ${m.platform_brand()}` : m.platform_brand()

type TitledMatch = { staticData: { title?: () => string } }

type HeadMatch = {
  status: string
  error?: unknown
  staticData: { title?: () => string; notFoundTitle?: () => string }
}

const failedTitle = ({ error, staticData }: HeadMatch) => {
  const missing = isNotFound(error) || (error instanceof ApiError && error.status === 404)
  if (missing) return (staticData.notFoundTitle ?? m.platform_not_found_title)()
  if (error instanceof ApiError && error.status === 403) return m.platform_forbidden_title()
  return m.platform_error_title()
}

/**
 * The page's name for the root's document title. The deepest route with a title names the document; a route's own
 * head may still override it. A page that could not show its object says so instead, as the page itself does
 * («Пользователь не найден», else «Страница не найдена»; «Нет доступа»), not the name of its tab. A tab names its
 * section too («Учащиеся · Аналитика»): its parent route's title follows its own.
 */
export const pageTitle = (matches: readonly HeadMatch[]): string | undefined => {
  const failed = matches.find(match => match.status === 'notFound' || match.status === 'error')
  if (failed) return failedTitle(failed)
  const page = matches.findLast(match => match.staticData.title)
  const name = page?.staticData.title?.()
  const section = page ? matches[matches.indexOf(page) - 1]?.staticData.title?.() : undefined
  return name && section ? `${name} · ${section}` : name
}

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
