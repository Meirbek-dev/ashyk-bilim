'use client'

import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { useTranslations } from 'next-intl'
import * as Si from '@icons-pack/react-simple-icons'
import { cn } from '@/lib/utils'
import { EMBED_CATEGORIES, EMBED_PROVIDERS } from '@components/Objects/Editor/Extensions/EmbedBlock/embed-options'
import type {
  EmbedCategoryId,
  EmbedProvider,
  EmbedType,
} from '@components/Objects/Editor/Extensions/EmbedBlock/embed-options'

interface EmbedTypeSelectorProps {
  selectedType: EmbedType | null
  onSelect: (type: EmbedType) => void
  error?: string | null
}

export function EmbedTypeSelector({ selectedType, onSelect, error }: EmbedTypeSelectorProps) {
  const t = useTranslations('DashPage.Editor.EmbedPanel')
  const [activeCategory, setActiveCategory] = useState<EmbedCategoryId>('visual')
  const [query, setQuery] = useState('')

  const filteredProviders = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return EMBED_PROVIDERS.filter(provider => {
      if (!(provider.categories as readonly EmbedCategoryId[]).includes(activeCategory)) return false
      if (!normalizedQuery) return true

      const translatedLabel = t(`providers.${provider.type}.label`)
      const translatedDescription = t(`providers.${provider.type}.description`)

      return (
        translatedLabel.toLowerCase().includes(normalizedQuery) ||
        translatedDescription.toLowerCase().includes(normalizedQuery)
      )
    })
  }, [activeCategory, query, t])

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
        <div
          role="tablist"
          aria-label={t('categoryLabel')}
          className="border-border bg-muted/30 flex max-h-[360px] flex-col gap-1 overflow-y-auto rounded-lg border p-1"
        >
          {EMBED_CATEGORIES.map(category => {
            const isActive = category.id === activeCategory
            return (
              <button
                key={category.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveCategory(category.id)}
                className={cn(
                  'rounded-md px-3 py-2 text-left text-sm transition-colors',
                  isActive
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-background/70 hover:text-foreground',
                )}
              >
                <span className="block font-medium">{t(category.label)}</span>
                <span className="line-clamp-2 text-xs leading-4">{t(category.description)}</span>
              </button>
            )
          })}
        </div>

        <div className="min-w-0 space-y-3">
          <label className="border-input bg-background focus-within:ring-ring flex items-center gap-2 rounded-md border px-3 py-2 focus-within:ring-2">
            <Search className="text-muted-foreground size-4" />
            <span className="sr-only">{t('searchPlaceholder')}</span>
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder={t('searchPlaceholder')}
              className="placeholder:text-muted-foreground w-full bg-transparent text-sm outline-none"
            />
          </label>

          <div
            role="radiogroup"
            aria-label={t('serviceLabel')}
            className="grid max-h-[360px] grid-cols-1 gap-2 overflow-y-auto pr-1 md:grid-cols-2"
          >
            {filteredProviders.map(p => {
              const provider = p as unknown as EmbedProvider
              const isSelected = selectedType === provider.type
              const Icon = provider.iconName ? (Si as Record<string, any>)[provider.iconName] : null

              return (
                <button
                  key={provider.type}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => onSelect(provider.type as EmbedType)}
                  className={cn(
                    'border-border bg-background hover:bg-accent/60 hover:text-foreground group flex items-start gap-3 rounded-lg border p-3 text-left transition-colors',
                    'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
                    isSelected && 'border-primary bg-primary/5 text-foreground ring-primary/25 ring-2',
                    !isSelected && error && 'border-destructive/60',
                  )}
                >
                  <div className="bg-muted/50 group-hover:bg-background flex size-10 shrink-0 items-center justify-center rounded-md border transition-colors">
                    {Icon ? (
                      <Icon className="size-5" />
                    ) : (
                      <div className="bg-muted-foreground/20 size-4 rounded-full" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-semibold">{t(`providers.${provider.type}.label`)}</span>
                    <span className="text-muted-foreground mt-0.5 line-clamp-2 block text-xs leading-4">
                      {t(`providers.${provider.type}.description`)}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </div>
  )
}
