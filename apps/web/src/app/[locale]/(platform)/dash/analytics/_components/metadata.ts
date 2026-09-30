import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { isApiError } from '@/lib/api/assertSuccess'

/** Page `title` from a `TeacherAnalytics` key; the dash layout template appends the app name. */
export async function analyticsPageMetadata(key: string): Promise<Metadata> {
  const t = await getTranslations('TeacherAnalytics')
  return { title: t(key) }
}

/** The not-found page's title (the dash layout template appends the app name). */
export async function notFoundMetadata(): Promise<Metadata> {
  const t = await getTranslations('NotFoundPage')
  return { title: t('title') }
}

/**
 * Title of a detail page from its scoped analytics read, never from a public
 * read: an unknown or out-of-scope id (404) gets the not-found title, as the
 * page renders the not-found page (UX-241). Same request as the page's, so
 * it is memoized for the default filters.
 */
export async function analyticsDetailMetadata(read: () => Promise<string>, fallbackKey: string): Promise<Metadata> {
  try {
    return { title: await read() }
  } catch (error) {
    if (isApiError(error) && error.status === 404) return notFoundMetadata()
    return analyticsPageMetadata(fallbackKey)
  }
}
