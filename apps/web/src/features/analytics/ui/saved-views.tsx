import { useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'

import { savedViewsOptions } from '../queries'
import { SavedViewItem } from './saved-view-item'

/** The caller's saved views: each a link that applies its tab and filters through the URL. */
export function SavedViews() {
  const { data } = useSuspenseQuery(savedViewsOptions())
  if (data.items.length === 0) return null
  return (
    <section aria-label={m.analytics_views_title()} className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">{m.analytics_views_title()}</span>
      {data.items.map(view => (
        <SavedViewItem key={view.id} view={view} />
      ))}
    </section>
  )
}
