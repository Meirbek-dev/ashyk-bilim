'use client'

import { getContentUrl } from '@services/media/media'
import type { SearchResults } from '@/lib/api/generated/zod'
import { Book, GraduationCap, Search, Users } from 'lucide-react'
import { useSearchContent } from '@/features/search/hooks/useSearch'
import { useRouter, useSearchParams } from 'next/navigation'
import { getAbsoluteUrl } from '@services/config/config'
import UserAvatar from '@components/Objects/UserAvatar'
import NextImage from '@components/ui/NextImage'
import { Skeleton } from '@components/ui/skeleton'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import Link from '@components/ui/AppLink'
import { extractMarkdownSummary } from '@/features/content-markdown'
import { InlineError } from '@/components/ui/error-state'
import { useApiError } from '@/hooks/useApiError'

type ContentType = 'all' | 'courses' | 'collections' | 'users'

function FilterButton({
  type,
  count,
  icon: Icon,
  selectedType,
  onTypeChange,
  t,
}: {
  type: ContentType
  /** `null` while the first result set is loading (no false «(0)»). */
  count: number | null
  icon: AppIcon
  selectedType: ContentType
  onTypeChange: (type: ContentType) => void
  t: (key: string) => string
}) {
  return (
    <Button
      type="button"
      variant={selectedType === type ? 'secondary' : 'ghost'}
      size="sm"
      onClick={() => {
        onTypeChange(type)
      }}
      className="shrink-0"
    >
      <Icon data-icon="inline-start" />
      <span>{t(`filter${type.charAt(0).toUpperCase() + type.slice(1)}`)}</span>
      {count === null ? null : (
        <span className={selectedType === type ? 'text-primary/70' : 'text-muted-foreground/60'}>({count})</span>
      )}
    </Button>
  )
}

function LoadingState() {
  return (
    <div className="grid w-full grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-4">
      {[1, 2, 3, 4, 5, 6].map(i => (
        <div key={i} className="bg-card rounded-lg border p-4">
          <Skeleton className="mb-4 h-32 w-full rounded-lg" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyState({ query, t }: { query: string; t: (key: string, params?: AppTranslationValues) => string }) {
  return (
    <div className="text-muted-foreground flex flex-col items-center justify-center py-16 text-center">
      <div className="bg-primary/10 mb-4 rounded-full p-4">
        <Search className="text-primary h-8 w-8" />
      </div>
      <h3 className="text-foreground mb-2 text-lg font-medium">{t('noResultsTitle')}</h3>
      <p className="text-muted-foreground max-w-md text-sm">{t('noResultsMessage', { query })}</p>
    </div>
  )
}

function SearchPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useTranslations('SearchPage')
  const { handleApiError } = useApiError()

  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '')

  // URL parameters
  const query = searchParams.get('q') || ''
  const type = (searchParams.get('type') as ContentType) || 'all'
  const selectedType = type
  const searchResultsQuery = useSearchContent(query, { limit: 30 })
  const searchResults: SearchResults = searchResultsQuery.data?.data ?? { courses: [], collections: [], users: [] }
  const isLoading = query.trim().length > 0 && searchResultsQuery.isPending
  // BUG-249: a failed search is an error, not «Ищем…» forever or «Ничего не найдено».
  const searchError = query.trim().length > 0 ? searchResultsQuery.error : null

  const updateSearchParams = (updates: Record<string, string>) => {
    const current = new URLSearchParams([...searchParams.entries()])
    Object.entries(updates).forEach(([key, value]) => {
      if (value) {
        current.set(key, value)
      } else {
        current.delete(key)
      }
    })
    router.push(`?${current.toString()}`)
  }

  const handleSearch = (formData: FormData) => {
    const submittedQuery = String(formData.get('q') ?? '').trim()

    if (submittedQuery) {
      updateSearchParams({ q: submittedQuery, page: '1' })
    }
  }

  const [prevQuery, setPrevQuery] = useState(query)

  if (query !== prevQuery) {
    setPrevQuery(query)
    setSearchQuery(query)
  }

  const totalResults = searchResults.courses.length + searchResults.collections.length + searchResults.users.length
  // UX-119: a filter with 0 hits gets its own empty copy, not a blank list.
  const visibleResults = selectedType === 'all' ? totalResults : searchResults[selectedType].length
  // UX-109: no «Найдено 0 результатов» / «(0)» before the first result set.
  const countOf = (n: number) => (isLoading ? null : n)

  return (
    <div className="bg-background text-foreground min-h-screen">
      {/* Search Header */}
      <div className="border-border bg-card text-card-foreground border-b">
        <div className="container mx-auto px-4 py-6">
          <div className="mx-auto max-w-2xl">
            <h1 className="text-foreground mb-6 text-2xl font-semibold">{t('searchTitle')}</h1>

            {/* Search Input */}
            <form action={handleSearch} className="group relative mb-6">
              <Input
                name="q"
                type="text"
                value={searchQuery}
                onChange={e => {
                  setSearchQuery(e.target.value)
                }}
                placeholder={t('searchInputPlaceholder')}
                className="h-12 w-full rounded-lg pr-4 pl-12"
              />
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                <Search
                  className="text-muted-foreground group-focus-within:text-foreground transition-colors"
                  size={20}
                />
              </div>
              <Button type="submit" variant="ghost" size="sm" className="absolute inset-y-1 right-1">
                {t('searchButton')}
              </Button>
            </form>

            {/* Filters */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2">
              <FilterButton
                type="all"
                count={countOf(totalResults)}
                icon={Search}
                selectedType={selectedType}
                onTypeChange={selectedTypeKey => {
                  updateSearchParams({
                    type: selectedTypeKey === 'all' ? '' : selectedTypeKey,
                    page: '1',
                  })
                }}
                t={t}
              />
              <FilterButton
                type="courses"
                count={countOf(searchResults.courses.length)}
                icon={GraduationCap}
                selectedType={selectedType}
                onTypeChange={selectedTypeKey => {
                  updateSearchParams({
                    type: selectedTypeKey === 'all' ? '' : selectedTypeKey,
                    page: '1',
                  })
                }}
                t={t}
              />
              <FilterButton
                type="collections"
                count={countOf(searchResults.collections.length)}
                icon={Book}
                selectedType={selectedType}
                onTypeChange={selectedTypeKey => {
                  updateSearchParams({
                    type: selectedTypeKey === 'all' ? '' : selectedTypeKey,
                    page: '1',
                  })
                }}
                t={t}
              />
              <FilterButton
                type="users"
                count={countOf(searchResults.users.length)}
                icon={Users}
                selectedType={selectedType}
                onTypeChange={selectedTypeKey => {
                  updateSearchParams({
                    type: selectedTypeKey === 'all' ? '' : selectedTypeKey,
                    page: '1',
                  })
                }}
                t={t}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Search Results */}
      <div className="container mx-auto px-4 py-8">
        <div className="mx-auto max-w-7xl">
          {query && !searchError ? (
            <div className="text-muted-foreground mb-6 text-sm" aria-live="polite">
              {isLoading ? t('searching', { query }) : t('resultsFound', { count: totalResults, query })}
            </div>
          ) : null}

          {searchError ? (
            <InlineError description={handleApiError(searchError).message} error={searchError} />
          ) : isLoading ? (
            <LoadingState />
          ) : totalResults === 0 && query ? (
            <EmptyState query={query} t={t} />
          ) : visibleResults === 0 && selectedType !== 'all' ? (
            <p className="text-muted-foreground py-16 text-center text-sm">
              {t(`noFilterResults.${selectedType}`, { query })}
            </p>
          ) : (
            <div className="space-y-12">
              {/* Courses Grid */}
              {(selectedType === 'all' || selectedType === 'courses') && searchResults.courses.length > 0 && (
                <div>
                  <h2 className="text-foreground mb-4 flex items-center gap-2 text-lg font-medium">
                    <GraduationCap size={20} className="text-muted-foreground" />
                    {t('courses')} ({searchResults.courses.length})
                  </h2>
                  <div className="grid w-full grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-4">
                    {searchResults.courses.map(course => (
                      <Link
                        key={course.id}
                        href={getAbsoluteUrl(`/course/${course.id}`)}
                        className="group bg-card text-card-foreground overflow-hidden rounded-lg border shadow-sm transition-shadow hover:shadow-md"
                      >
                        <div className="relative aspect-video w-full overflow-hidden">
                          <NextImage
                            src="/empty_thumbnail.avif"
                            alt={course.name}
                            fill
                            className="object-cover"
                            sizes="100vw"
                          />
                        </div>
                        <div className="p-4">
                          <h3 className="text-foreground mb-1 text-sm font-medium">{course.name}</h3>
                          <p className="text-muted-foreground line-clamp-2 text-xs">
                            {extractMarkdownSummary(course.description, 140)}
                          </p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Collections Grid */}
              {(selectedType === 'all' || selectedType === 'collections') && searchResults.collections.length > 0 && (
                <div>
                  <h2 className="text-foreground mb-4 flex items-center gap-2 text-lg font-medium">
                    <Book size={20} className="text-muted-foreground" />
                    {t('collections')} ({searchResults.collections.length})
                  </h2>
                  <div className="grid w-full grid-cols-1 gap-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4">
                    {searchResults.collections.map(collection => (
                      <Link
                        key={collection.id}
                        href={getAbsoluteUrl(`/collection/${collection.id}`)}
                        className="bg-card text-card-foreground flex items-start gap-4 rounded-lg border p-4 shadow-sm transition-shadow hover:shadow-md"
                      >
                        <div className="bg-muted flex size-12 shrink-0 items-center justify-center rounded-lg">
                          <Book size={24} className="text-muted-foreground" />
                        </div>
                        <div>
                          <h3 className="text-foreground mb-1 text-sm font-medium">{collection.name}</h3>
                          <p className="text-muted-foreground line-clamp-2 text-xs">
                            {extractMarkdownSummary(collection.description, 140)}
                          </p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Users Grid */}
              {(selectedType === 'all' || selectedType === 'users') && searchResults.users.length > 0 && (
                <div>
                  <h2 className="text-foreground mb-4 flex items-center gap-2 text-lg font-medium">
                    <Users size={20} className="text-muted-foreground" />
                    {t('users')} ({searchResults.users.length})
                  </h2>
                  <div className="grid w-full grid-cols-1 gap-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4">
                    {searchResults.users.map(user => (
                      <Link
                        key={user.id}
                        href={getAbsoluteUrl(`/user/${user.username}`)}
                        className="bg-card text-card-foreground flex items-center gap-4 rounded-lg border p-4 shadow-sm transition-shadow hover:shadow-md"
                      >
                        <UserAvatar
                          size="lg"
                          avatar_url={user.avatar_key ? getContentUrl(user.avatar_key) : ''}
                          {...(!user.avatar_key ? { predefined_avatar: 'empty' } : {})}
                          user={user}
                          use_with_session={false}
                          showProfilePopup={false}
                        />
                        <div>
                          <h3 className="text-foreground text-sm font-medium">{user.display_name}</h3>
                          <p className="text-muted-foreground text-xs">@{user.username}</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default SearchPage
