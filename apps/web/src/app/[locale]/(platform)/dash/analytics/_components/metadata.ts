import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

/** Page `title` from a `TeacherAnalytics` key; the dash layout template appends the app name. */
export async function analyticsPageMetadata(key: string): Promise<Metadata> {
  const t = await getTranslations('TeacherAnalytics')
  return { title: t(key) }
}
