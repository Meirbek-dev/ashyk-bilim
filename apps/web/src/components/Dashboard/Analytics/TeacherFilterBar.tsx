'use client'

import { getAnalyticsBucketLabel, getAnalyticsCompareLabel } from '@/lib/analytics/labels'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import type { AnalyticsFilterOption, AnalyticsQuery } from '@/types/analytics'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Filter, Globe2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

// Common IANA timezone identifiers for the select. These cover almost all deployed users.
const COMMON_TIMEZONES = [
  'Asia/Almaty',
  'UTC',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Moscow',
  'Asia/Kolkata',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Australia/Sydney',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
] as const

interface TeacherFilterBarProps {
  path?: string
  query: AnalyticsQuery
  courseCount: number
  courseOptions?: AnalyticsFilterOption[]
  cohortOptions?: AnalyticsFilterOption[]
}

const windows: NonNullable<AnalyticsQuery['window']>[] = ['7d', '28d', '90d']

const compareOptions: NonNullable<AnalyticsQuery['compare']>[] = ['previous_period', 'none']
const bucketOptions: NonNullable<AnalyticsQuery['bucket']>[] = ['day', 'week']
const EMPTY_FILTER_OPTIONS: AnalyticsFilterOption[] = []

export default function TeacherFilterBar({
  path,
  query,
  courseCount,
  courseOptions = EMPTY_FILTER_OPTIONS,
  cohortOptions = EMPTY_FILTER_OPTIONS,
}: TeacherFilterBarProps) {
  const t = useTranslations('TeacherAnalytics')
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  const basePath = path || pathname || '/dash/analytics'
  const [formState, setFormState] = useState({
    window: query.window || '28d',
    compare: query.compare || 'previous_period',
    bucket: query.bucket || 'day',
    course_ids: query.course_ids || '',
    cohort_ids: query.cohort_ids || '',
    timezone: query.timezone || 'UTC',
    sort_by: query.sort_by || '',
    sort_order: query.sort_order || 'desc',
  })

  useEffect(() => {
    setFormState({
      window: query.window || '28d',
      compare: query.compare || 'previous_period',
      bucket: query.bucket || 'day',
      course_ids: query.course_ids || '',
      cohort_ids: query.cohort_ids || '',
      timezone: query.timezone || 'UTC',
      sort_by: query.sort_by || '',
      sort_order: query.sort_order || 'desc',
    })
  }, [
    query.window,
    query.compare,
    query.bucket,
    query.course_ids,
    query.cohort_ids,
    query.timezone,
    query.sort_by,
    query.sort_order,
  ])

  const sortOptions = [
    { value: '', label: t('filters.sortDefault') },
    { value: 'risk', label: t('filters.sortRisk') },
    { value: 'health', label: t('filters.sortHealth') },
    { value: 'completion', label: t('filters.sortCompletion') },
    { value: 'active', label: t('filters.sortActiveLearners') },
    { value: 'difficulty', label: t('filters.sortDifficulty') },
    { value: 'signals', label: t('filters.sortSignals') },
  ]

  const buildHref = (windowValue: string, nextState = formState) => {
    const params = new URLSearchParams()
    params.set('window', windowValue)
    params.set('compare', nextState.compare || 'previous_period')
    params.set('bucket', nextState.bucket || 'day')
    if (nextState.course_ids) params.set('course_ids', nextState.course_ids)
    if (nextState.cohort_ids) params.set('cohort_ids', nextState.cohort_ids)
    if (query.teacher_user_id) params.set('teacher_user_id', String(query.teacher_user_id))
    if (nextState.sort_by) params.set('sort_by', nextState.sort_by)
    if (nextState.sort_order) params.set('sort_order', nextState.sort_order)
    if (nextState.timezone) params.set('timezone', nextState.timezone)
    params.set('page', '1')
    return `${basePath}?${params.toString()}`
  }

  const applyFilters = (nextState = formState) => {
    startTransition(() => {
      router.push(buildHref(nextState.window, nextState), { scroll: false })
    })
  }

  const resetHref = useMemo(() => basePath, [basePath])

  return (
    <section
      aria-label={t('filters.sectionAriaLabel')}
      className="border-border/60 mb-6 flex w-full flex-col gap-4 border-b pb-6"
    >
      <div className="w-full space-y-4">
        {/* Active badges bar */}
        <div className="bg-muted/30 border-border/40 flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-muted-foreground flex items-center gap-2 text-xs font-bold tracking-wider uppercase">
            <Filter className="text-primary h-3.5 w-3.5" />
            {t('filters.label')}
          </div>
          <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs font-semibold">
            <Badge variant="outline" className="bg-background">
              {t('filters.scopedCourses', { count: courseCount })}
            </Badge>
            <Badge variant="outline" className="bg-background">
              {t('filters.buckets', {
                bucket: getAnalyticsBucketLabel(t, query.bucket || 'day'),
              })}
            </Badge>
            <Badge variant="outline" className="bg-background">
              {getAnalyticsCompareLabel(t, query.compare || 'previous_period')}
            </Badge>
            <Badge variant="outline" className="bg-background">
              <Globe2 className="mr-1 h-3 w-3" />
              {query.timezone || 'UTC'}
            </Badge>
          </div>
        </div>

        {/* Filters Selectors Grid */}
        <form
          onSubmit={event => {
            event.preventDefault()
            applyFilters()
          }}
          className="bg-card grid grid-cols-1 gap-4 rounded-2xl border p-5 shadow-2xs sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
        >
          <div className="space-y-1">
            <Label className="text-muted-foreground text-[10px] font-bold tracking-wider uppercase">
              {t('filters.windowSelect')}
            </Label>
            <NativeSelect
              value={formState.window}
              onChange={event =>
                setFormState(state => ({
                  ...state,
                  window: event.target.value as NonNullable<AnalyticsQuery['window']>,
                }))
              }
              className="h-9 w-full text-sm"
            >
              {windows.map(windowValue => (
                <NativeSelectOption key={windowValue} value={windowValue}>
                  {t('filters.windowPrefix', { window: windowValue })}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>

          <div className="space-y-1">
            <Label className="text-muted-foreground text-[10px] font-bold tracking-wider uppercase">
              {t('filters.compareSelect')}
            </Label>
            <NativeSelect
              value={formState.compare}
              onChange={event =>
                setFormState(state => ({
                  ...state,
                  compare: event.target.value as NonNullable<AnalyticsQuery['compare']>,
                }))
              }
              className="h-9 w-full text-sm"
            >
              {compareOptions.map(compareValue => (
                <NativeSelectOption key={compareValue} value={compareValue}>
                  {t('filters.comparePrefix', {
                    compare: getAnalyticsCompareLabel(t, compareValue),
                  })}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>

          <div className="space-y-1">
            <Label className="text-muted-foreground text-[10px] font-bold tracking-wider uppercase">
              {t('filters.bucketSelect')}
            </Label>
            <NativeSelect
              value={formState.bucket}
              onChange={event =>
                setFormState(state => ({
                  ...state,
                  bucket: event.target.value as NonNullable<AnalyticsQuery['bucket']>,
                }))
              }
              className="h-9 w-full text-sm"
            >
              {bucketOptions.map(bucketValue => (
                <NativeSelectOption key={bucketValue} value={bucketValue}>
                  {t('filters.bucketPrefix', {
                    bucket: getAnalyticsBucketLabel(t, bucketValue),
                  })}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>

          <div className="space-y-1">
            <Label className="text-muted-foreground text-[10px] font-bold tracking-wider uppercase">
              {t('filters.courseSelect')}
            </Label>
            <NativeSelect
              value={formState.course_ids}
              onChange={event =>
                setFormState(state => ({
                  ...state,
                  course_ids: event.target.value,
                }))
              }
              className="h-9 w-full text-sm"
            >
              <NativeSelectOption value="">{t('filters.allCourses')}</NativeSelectOption>
              {courseOptions.map(option => (
                <NativeSelectOption key={option.value} value={option.value}>
                  {option.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>

          <div className="space-y-1">
            <Label className="text-muted-foreground text-[10px] font-bold tracking-wider uppercase">
              {t('filters.cohortSelect')}
            </Label>
            <NativeSelect
              value={formState.cohort_ids}
              onChange={event =>
                setFormState(state => ({
                  ...state,
                  cohort_ids: event.target.value,
                }))
              }
              className="h-9 w-full text-sm"
            >
              <NativeSelectOption value="">{t('filters.allCohorts')}</NativeSelectOption>
              {cohortOptions.map(option => (
                <NativeSelectOption key={option.value} value={option.value}>
                  {option.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>

          <div className="space-y-1">
            <Label className="text-muted-foreground text-[10px] font-bold tracking-wider uppercase">
              {t('filters.timezoneSelect')}
            </Label>
            <NativeSelect
              value={formState.timezone}
              onChange={event =>
                setFormState(state => ({
                  ...state,
                  timezone: event.target.value,
                }))
              }
              className="h-9 w-full text-sm"
            >
              {COMMON_TIMEZONES.map(tz => (
                <NativeSelectOption key={tz} value={tz}>
                  {tz}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>

          <div className="space-y-1">
            <Label className="text-muted-foreground text-[10px] font-bold tracking-wider uppercase">
              {t('filters.sortBySelect')}
            </Label>
            <NativeSelect
              value={formState.sort_by}
              onChange={event => setFormState(state => ({ ...state, sort_by: event.target.value }))}
              className="h-9 w-full text-sm"
            >
              {sortOptions.map(option => (
                <NativeSelectOption key={option.value || 'default'} value={option.value}>
                  {option.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>

          <div className="space-y-1">
            <Label className="text-muted-foreground text-[10px] font-bold tracking-wider uppercase">
              {t('filters.sortOrderSelect')}
            </Label>
            <NativeSelect
              value={formState.sort_order}
              onChange={event =>
                setFormState(state => ({
                  ...state,
                  sort_order: event.target.value as NonNullable<AnalyticsQuery['sort_order']>,
                }))
              }
              className="h-9 w-full text-sm"
            >
              <NativeSelectOption value="desc">{t('filters.descending')}</NativeSelectOption>
              <NativeSelectOption value="asc">{t('filters.ascending')}</NativeSelectOption>
            </NativeSelect>
          </div>

          <div className="flex justify-end gap-2 pt-2 sm:col-span-2 md:col-span-3 lg:col-span-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 px-4"
              onClick={() => startTransition(() => router.push(resetHref, { scroll: false }))}
            >
              {t('filters.reset')}
            </Button>
            <Button type="submit" variant="default" size="sm" className="h-9 px-5" disabled={isPending}>
              {t('filters.applyFilters')}
            </Button>
          </div>
        </form>
      </div>
    </section>
  )
}
