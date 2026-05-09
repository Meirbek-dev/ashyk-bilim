'use client';

import { getAnalyticsBucketLabel, getAnalyticsCompareLabel } from '@/lib/analytics/labels';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import type { AnalyticsFilterOption, AnalyticsQuery } from '@/types/analytics';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Filter, Globe2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

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
] as const;

interface TeacherFilterBarProps {
  path?: string;
  query: AnalyticsQuery;
  courseCount: number;
  courseOptions?: AnalyticsFilterOption[];
  cohortOptions?: AnalyticsFilterOption[];
}

const windows: NonNullable<AnalyticsQuery['window']>[] = ['7d', '28d', '90d'];

const compareOptions: NonNullable<AnalyticsQuery['compare']>[] = ['previous_period', 'none'];
const bucketOptions: NonNullable<AnalyticsQuery['bucket']>[] = ['day', 'week'];

export default function TeacherFilterBar({
  path,
  query,
  courseCount,
  courseOptions = [],
  cohortOptions = [],
}: TeacherFilterBarProps) {
  const t = useTranslations('TeacherAnalytics');
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const basePath = path || pathname || '/dash/analytics';
  const [formState, setFormState] = useState({
    window: query.window || '28d',
    compare: query.compare || 'previous_period',
    bucket: query.bucket || 'day',
    course_ids: query.course_ids || '',
    cohort_ids: query.cohort_ids || '',
    timezone: query.timezone || 'UTC',
    sort_by: query.sort_by || '',
    sort_order: query.sort_order || 'desc',
  });

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
    });
  }, [
    query.window,
    query.compare,
    query.bucket,
    query.course_ids,
    query.cohort_ids,
    query.timezone,
    query.sort_by,
    query.sort_order,
  ]);

  const sortOptions = [
    { value: '', label: t('filters.sortDefault') },
    { value: 'risk', label: t('filters.sortRisk') },
    { value: 'health', label: t('filters.sortHealth') },
    { value: 'completion', label: t('filters.sortCompletion') },
    { value: 'active', label: t('filters.sortActiveLearners') },
    { value: 'difficulty', label: t('filters.sortDifficulty') },
    { value: 'signals', label: t('filters.sortSignals') },
  ];

  const buildHref = (windowValue: string, nextState = formState) => {
    const params = new URLSearchParams();
    params.set('window', windowValue);
    params.set('compare', nextState.compare || 'previous_period');
    params.set('bucket', nextState.bucket || 'day');
    if (nextState.course_ids) params.set('course_ids', nextState.course_ids);
    if (nextState.cohort_ids) params.set('cohort_ids', nextState.cohort_ids);
    if (query.teacher_user_id) params.set('teacher_user_id', String(query.teacher_user_id));
    if (nextState.sort_by) params.set('sort_by', nextState.sort_by);
    if (nextState.sort_order) params.set('sort_order', nextState.sort_order);
    if (nextState.timezone) params.set('timezone', nextState.timezone);
    params.set('page', '1');
    return `${basePath}?${params.toString()}`;
  };

  const applyFilters = (nextState = formState) => {
    startTransition(() => {
      router.push(buildHref(nextState.window, nextState), { scroll: false });
    });
  };

  const resetHref = useMemo(() => basePath, [basePath]);

  return (
    <section
      aria-label={t('filters.sectionAriaLabel')}
      className="bg-card mb-6 flex flex-col gap-4 rounded-xl border border-slate-200 p-4 shadow-sm md:flex-row md:items-center md:justify-between dark:border-slate-700 dark:bg-slate-800"
    >
      <div className="min-w-0 flex-1">
        <div className="text-muted-foreground flex items-center gap-2 text-xs font-semibold tracking-wider uppercase">
          <Filter className="h-3.5 w-3.5" />
          {t('filters.label')}
        </div>
        <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="outline">{t('filters.scopedCourses', { count: courseCount })}</Badge>
          <Badge variant="outline">
            {t('filters.buckets', { bucket: getAnalyticsBucketLabel(t, query.bucket || 'day') })}
          </Badge>
          <Badge variant="outline">{getAnalyticsCompareLabel(t, query.compare || 'previous_period')}</Badge>
          <Badge variant="outline">
            <Globe2 className="mr-1 h-3.5 w-3.5" />
            {query.timezone || 'UTC'}
          </Badge>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            applyFilters();
          }}
          className="mt-4 grid gap-3 lg:grid-cols-6"
        >
          <NativeSelect
            value={formState.window}
            onChange={(event) =>
              setFormState((state) => ({
                ...state,
                window: event.target.value as NonNullable<AnalyticsQuery['window']>,
              }))
            }
            className="w-full"
            aria-label={t('filters.windowSelect')}
          >
            {windows.map((windowValue) => (
              <NativeSelectOption
                key={windowValue}
                value={windowValue}
              >
                {t('filters.windowPrefix', { window: windowValue })}
              </NativeSelectOption>
            ))}
          </NativeSelect>

          <NativeSelect
            value={formState.compare}
            onChange={(event) =>
              setFormState((state) => ({
                ...state,
                compare: event.target.value as NonNullable<AnalyticsQuery['compare']>,
              }))
            }
            className="w-full"
            aria-label={t('filters.compareSelect')}
          >
            {compareOptions.map((compareValue) => (
              <NativeSelectOption
                key={compareValue}
                value={compareValue}
              >
                {t('filters.comparePrefix', { compare: getAnalyticsCompareLabel(t, compareValue) })}
              </NativeSelectOption>
            ))}
          </NativeSelect>

          <NativeSelect
            value={formState.bucket}
            onChange={(event) =>
              setFormState((state) => ({
                ...state,
                bucket: event.target.value as NonNullable<AnalyticsQuery['bucket']>,
              }))
            }
            className="w-full"
            aria-label={t('filters.bucketSelect')}
          >
            {bucketOptions.map((bucketValue) => (
              <NativeSelectOption
                key={bucketValue}
                value={bucketValue}
              >
                {t('filters.bucketPrefix', { bucket: getAnalyticsBucketLabel(t, bucketValue) })}
              </NativeSelectOption>
            ))}
          </NativeSelect>

          <NativeSelect
            value={formState.course_ids}
            onChange={(event) => setFormState((state) => ({ ...state, course_ids: event.target.value }))}
            className="w-full"
            aria-label={t('filters.courseSelect')}
          >
            <NativeSelectOption value="">{t('filters.allCourses')}</NativeSelectOption>
            {courseOptions.map((option) => (
              <NativeSelectOption
                key={option.value}
                value={option.value}
              >
                {option.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>

          <NativeSelect
            value={formState.cohort_ids}
            onChange={(event) => setFormState((state) => ({ ...state, cohort_ids: event.target.value }))}
            className="w-full"
            aria-label={t('filters.cohortSelect')}
          >
            <NativeSelectOption value="">{t('filters.allCohorts')}</NativeSelectOption>
            {cohortOptions.map((option) => (
              <NativeSelectOption
                key={option.value}
                value={option.value}
              >
                {option.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>

          <NativeSelect
            value={formState.timezone}
            onChange={(event) => setFormState((state) => ({ ...state, timezone: event.target.value }))}
            className="w-full"
            aria-label={t('filters.timezoneSelect')}
          >
            {COMMON_TIMEZONES.map((tz) => (
              <NativeSelectOption
                key={tz}
                value={tz}
              >
                {tz}
              </NativeSelectOption>
            ))}
          </NativeSelect>

          <NativeSelect
            value={formState.sort_by}
            onChange={(event) => setFormState((state) => ({ ...state, sort_by: event.target.value }))}
            className="w-full lg:col-span-2"
            aria-label={t('filters.sortBySelect')}
          >
            {sortOptions.map((option) => (
              <NativeSelectOption
                key={option.value || 'default'}
                value={option.value}
              >
                {option.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>

          <NativeSelect
            value={formState.sort_order}
            onChange={(event) =>
              setFormState((state) => ({
                ...state,
                sort_order: event.target.value as NonNullable<AnalyticsQuery['sort_order']>,
              }))
            }
            className="w-full"
            aria-label={t('filters.sortOrderSelect')}
          >
            <NativeSelectOption value="desc">{t('filters.descending')}</NativeSelectOption>
            <NativeSelectOption value="asc">{t('filters.ascending')}</NativeSelectOption>
          </NativeSelect>

          <div className="flex gap-2 lg:col-span-3 lg:justify-end">
            <Button
              type="submit"
              variant="default"
              disabled={isPending}
            >
              {t('filters.applyFilters')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => startTransition(() => router.push(resetHref, { scroll: false }))}
            >
              {t('filters.reset')}
            </Button>
          </div>
        </form>
      </div>
      <div className="flex flex-wrap gap-2">
        {windows.map((windowValue) => (
          <Button
            key={windowValue}
            variant={formState.window === windowValue ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              const nextState = { ...formState, window: windowValue };
              setFormState(nextState);
              applyFilters(nextState);
            }}
          >
            {windowValue}
          </Button>
        ))}
      </div>
    </section>
  );
}
