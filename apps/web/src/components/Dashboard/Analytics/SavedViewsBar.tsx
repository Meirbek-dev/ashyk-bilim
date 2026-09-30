'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import type { AnalyticsQuery, SavedAnalyticsViewRow } from '@/types/analytics'
import { deleteAnalyticsView, getSavedAnalyticsViews, saveAnalyticsView } from '@services/analytics/teacher'
import { useApiError } from '@/hooks/useApiError'
import { Save, Search, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'

export const ANALYTICS_VIEW_TYPES = ['overview', 'watchlist', 'performance', 'operations', 'admin'] as const
export type AnalyticsViewType = (typeof ANALYTICS_VIEW_TYPES)[number]

interface SavedViewsBarProps {
  query: AnalyticsQuery
  /** The page the view is saved from and restored to (UX-106). */
  viewType: AnalyticsViewType
}

/**
 * UX-106: a chip restores the page it was saved on (`view_type`) with its
 * whole query, `sort_by` included — the page normalizes the keys it honours.
 */
export const savedViewHref = (view: Pick<SavedAnalyticsViewRow, 'view_type' | 'query'>) => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(view.query)) {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value))
    }
  }
  const tab = (ANALYTICS_VIEW_TYPES as readonly string[]).includes(view.view_type) ? view.view_type : 'overview'
  const serialized = params.toString()
  return `/dash/analytics/${tab}${serialized ? `?${serialized}` : ''}`
}

export default function SavedViewsBar({ query, viewType }: SavedViewsBarProps) {
  const router = useRouter()
  const t = useTranslations('Components.DashboardAnalytics')
  const { toastApiError } = useApiError()
  const [name, setName] = useState('')
  const [views, setViews] = useState<SavedAnalyticsViewRow[]>([])
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    let mounted = true
    getSavedAnalyticsViews(query)
      .then(response => {
        if (mounted) setViews(response.items)
        return response
      })
      .catch(() => undefined)
    return () => {
      mounted = false
    }
  }, [query])

  const handleSave = async () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      toast.error(t('savedViewsBar.nameFirst'))
      return
    }
    setIsSaving(true)
    try {
      const saved = await saveAnalyticsView(
        {
          name: trimmedName,
          view_type: viewType,
          query: { ...query },
        },
        query,
      )
      setViews(current => [saved, ...current.filter(item => item.id !== saved.id)])
      setName('')
      toast.success(t('savedViewsBar.saved'))
    } catch (error) {
      toastApiError(error, { fallback: t('savedViewsBar.couldNotSave') })
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (view: SavedAnalyticsViewRow) => {
    try {
      await deleteAnalyticsView(view.id, query)
      setViews(current => current.filter(item => item.id !== view.id))
      toast.success(t('savedViewsBar.deleted'))
    } catch (error) {
      toastApiError(error, { fallback: t('savedViewsBar.couldNotDelete') })
    }
  }

  return (
    <Card className="shadow-sm">
      <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-1 flex-wrap gap-2">
          {views.map(view => (
            <div key={view.id} className="inline-flex items-center">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-r-none"
                onClick={() => router.push(savedViewHref(view))}
              >
                <Search className="h-3.5 w-3.5" />
                {view.name}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-l-none border-l-0 px-2"
                aria-label={t('savedViewsBar.deleteView', { name: view.name })}
                onClick={() => handleDelete(view)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          {!views.length ? (
            <span className="text-muted-foreground text-sm">{t('savedViewsBar.noSavedViews')}</span>
          ) : null}
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <Input
            value={name}
            onChange={event => setName(event.target.value)}
            placeholder={t('savedViewsBar.namePlaceholder')}
            className="sm:w-[220px]"
          />
          <Button type="button" onClick={handleSave} disabled={isSaving}>
            <Save className="h-4 w-4" />
            {t('savedViewsBar.save')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
