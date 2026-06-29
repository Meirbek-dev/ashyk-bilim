'use client'

import { useCallback, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import { courseGradebookExportUrl, courseGradebookQueryOptions } from '@/features/grading/queries/grading.query'
import {
  buildGradebookRollups,
  emptyGradebookCell,
  filterGradebookStudents,
  gradebookCellKey,
  gradebookLearnerName,
} from '@/features/grading/domain'
import type {
  ActivityProgressCell,
  CourseGradebookResponse,
  GradebookFilters,
  GradebookRollupKind,
  TeacherAction,
} from '@/features/grading/domain'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import GradebookToolbar, { labelActivityType } from './GradebookToolbar'
import GradebookActivityCell, { progressStateLabelKey } from './GradebookActivityCell'

interface CourseGradebookCommandCenterProps {
  courseUuid: string
}

const ROLLUP_KINDS: GradebookRollupKind[] = ['activity_category', 'cohort', 'learner', 'activity']
const PAGE_SIZE = 100

export default function CourseGradebookCommandCenter({ courseUuid }: CourseGradebookCommandCenterProps) {
  const t = useTranslations('Features.Grading.Gradebook')
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [page, setPage] = useState(() => normalizePage(searchParams.get('page')))
  const [filters, setFilters] = useState<GradebookFilters>({
    savedFilter: normalizeSavedFilter(searchParams.get('filter')),
    search: searchParams.get('search') ?? '',
    activityType: searchParams.get('activityType') ?? 'all',
  })
  const gradebookQueryParams = useMemo(() => {
    const trimmedSearch = filters.search.trim()
    return {
      page,
      pageSize: PAGE_SIZE,
      activityType: filters.activityType,
      savedFilter: filters.savedFilter,
      ...(trimmedSearch ? { search: trimmedSearch } : {}),
    }
  }, [filters.activityType, filters.savedFilter, filters.search, page])
  const { data, error, isError, isLoading, refetch } = useQuery(
    courseGradebookQueryOptions(courseUuid, gradebookQueryParams),
  )
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())

  const handleFiltersChange = useCallback(
    (newFilters: GradebookFilters) => {
      setFilters(newFilters)
      const params = new URLSearchParams(searchParams.toString())
      setParam(params, 'filter', newFilters.savedFilter === 'needs_grading' ? '' : newFilters.savedFilter)
      setParam(params, 'search', newFilters.search)
      setParam(params, 'activityType', newFilters.activityType === 'all' ? '' : newFilters.activityType)
      params.delete('page')
      const next = params.toString()
      const current = searchParams.toString()
      setPage(1)
      if (next !== current) {
        router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false })
      }
    },
    [pathname, router, searchParams],
  )

  const cellMap = useMemo(
    () => new Map((data?.cells ?? []).map(cell => [gradebookCellKey(cell.user_id, cell.activity_id), cell])),
    [data?.cells],
  )
  const activityTypes = useMemo(
    () =>
      data?.page_info?.activity_types ??
      [...new Set((data?.activities ?? []).map(activity => activity.activity_type))].toSorted(),
    [data?.activities, data?.page_info?.activity_types],
  )
  const visibleActivities = useMemo(
    () =>
      (data?.activities ?? []).filter(
        activity => filters.activityType === 'all' || activity.activity_type === filters.activityType,
      ),
    [data?.activities, filters.activityType],
  )
  const visibleStudents = useMemo(() => {
    if (!data) return []
    return filterGradebookStudents(data, visibleActivities, cellMap, filters)
  }, [cellMap, data, filters, visibleActivities])

  const visibleKeySet = useMemo(
    () =>
      new Set(
        visibleStudents.flatMap(student =>
          visibleActivities.map(activity => gradebookCellKey(student.id, activity.id)),
        ),
      ),
    [visibleActivities, visibleStudents],
  )
  const selectedCells = useMemo(
    () =>
      [...selectedKeys]
        .filter(key => visibleKeySet.has(key))
        .map(key => cellMap.get(key))
        .filter((cell): cell is ActivityProgressCell => Boolean(cell)),
    [cellMap, selectedKeys, visibleKeySet],
  )

  if (isLoading) return <div className="text-muted-foreground text-sm">{t('loading')}</div>

  if (isError) {
    return (
      <div role="alert" className="text-destructive text-sm">
        {error instanceof Error ? error.message : t('loadError')}
      </div>
    )
  }

  if (!data) return <div className="text-muted-foreground text-sm">{t('unavailable')}</div>

  const openReview = (activityId: number, submissionUuid?: string | null) => {
    const activity = data.activities.find(item => item.id === activityId)
    if (!activity?.activity_uuid) return
    const cleanCourse = courseUuid.replace(/^course_/, '')
    const cleanActivity = activity.activity_uuid.replace(/^activity_/, '')
    const query = submissionUuid ? `?submission=${submissionUuid}` : ''
    router.push(`/dash/courses/${cleanCourse}/activity/${cleanActivity}/review${query}`)
  }

  const openCell = (cell: ActivityProgressCell) => {
    if (!cell.latest_submission_uuid) return
    openReview(cell.activity_id, cell.latest_submission_uuid)
  }

  const openTeacherAction = (action: TeacherAction) => {
    openReview(action.activity_id, action.submission_uuid)
  }

  const openActivityReview = (activityId: number) => {
    const activity = data.activities.find(item => item.id === activityId)
    if (!activity?.activity_uuid) return
    const cleanCourse = courseUuid.replace(/^course_/, '')
    const cleanActivity = activity.activity_uuid.replace(/^activity_/, '')
    router.push(`/dash/courses/${cleanCourse}/activity/${cleanActivity}/review`)
  }

  return (
    <div className="space-y-5">
      <GradebookToolbar
        data={data}
        filters={filters}
        activityTypes={activityTypes}
        selectedCount={selectedCells.length}
        onFiltersChange={handleFiltersChange}
        onExport={() => {
          globalThis.location.assign(courseGradebookExportUrl(courseUuid))
        }}
        onRefresh={() => void refetch()}
      />

      <RollupPanel data={data} />

      <TeacherActionsPanel data={data} onOpenAction={openTeacherAction} onOpenActivity={openActivityReview} />

      <div className="border-border overflow-x-auto rounded-lg border">
        <Table className="min-w-[980px] table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="bg-background sticky left-0 z-10 w-64">{t('learner')}</TableHead>
              {visibleActivities.map(activity => (
                <TableHead key={activity.id} className="w-44 align-bottom">
                  <button
                    type="button"
                    className="hover:text-primary focus-visible:ring-ring block w-full rounded-sm text-left outline-none focus-visible:ring-2"
                    onClick={() => openActivityReview(activity.id)}
                  >
                    <span className="line-clamp-2 text-xs font-semibold">{activity.name}</span>
                    <span className="text-muted-foreground mt-1 block text-[11px]">
                      {labelActivityType(t, activity.activity_type)}
                    </span>
                  </button>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleStudents.length === 0 ? (
              <TableRow>
                <TableCell colSpan={visibleActivities.length + 1} className="h-32 text-center">
                  <div className="text-sm font-medium">{t('emptyTitle')}</div>
                  <div className="text-muted-foreground mt-1 text-xs">{t('emptyDescription')}</div>
                </TableCell>
              </TableRow>
            ) : null}
            {visibleStudents.map(student => (
              <TableRow key={student.id}>
                <TableCell className="bg-background sticky left-0 z-10 w-64">
                  <span className="block truncate text-sm font-medium">{gradebookLearnerName(student)}</span>
                  <span className="text-muted-foreground block truncate text-xs">{student.email}</span>
                </TableCell>
                {visibleActivities.map(activity => {
                  const key = gradebookCellKey(student.id, activity.id)
                  const cell = cellMap.get(key) ?? emptyGradebookCell(student.id, activity.id)
                  const selected = selectedKeys.has(key)
                  return (
                    <GradebookActivityCell
                      key={key}
                      cell={cell}
                      selected={selected}
                      labels={{
                        actionRequired: t('actionRequired'),
                        attempts: t('attempts', { count: cell.attempt_count }),
                        late: t('late'),
                        selectCell: t('selectCell'),
                        state: t(progressStateLabelKey(cell.state)),
                      }}
                      onOpen={() => openCell(cell)}
                      onSelect={checked => {
                        setSelectedKeys(current => {
                          const next = new Set(current)
                          if (checked) next.add(key)
                          else next.delete(key)
                          return next
                        })
                      }}
                    />
                  )
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {data.page_info ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-muted-foreground text-sm">
            {t('pageStatus', {
              page: data.page_info.page,
              totalPages: Math.max(1, Math.ceil(data.page_info.total_students / data.page_info.page_size)),
            })}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label={t('previousPage')}
              disabled={!data.page_info.has_previous}
              onClick={() => {
                setPage(page - 1)
                setGradebookPage(searchParams, pathname, router, page - 1)
              }}
            >
              {t('previousPage')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label={t('nextPage')}
              disabled={!data.page_info.has_next}
              onClick={() => {
                setPage(page + 1)
                setGradebookPage(searchParams, pathname, router, page + 1)
              }}
            >
              {t('nextPage')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function TeacherActionsPanel({
  data,
  onOpenAction,
  onOpenActivity,
}: {
  data: CourseGradebookResponse
  onOpenAction: (action: TeacherAction) => void
  onOpenActivity: (activityId: number) => void
}) {
  const t = useTranslations('Features.Grading.Gradebook')
  const actions = data.teacher_actions.slice(0, 6)
  if (actions.length === 0) return null

  return (
    <section className="rounded-lg border p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">{t('summary.needsGrading')}</h2>
        <span className="text-muted-foreground text-xs">{data.teacher_actions.length}</span>
      </div>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {actions.map(action => (
          <button
            key={`${action.user_id}:${action.activity_id}:${action.submission_uuid}`}
            type="button"
            className="hover:bg-muted/60 focus-visible:ring-ring rounded-md border p-3 text-left outline-none focus-visible:ring-2"
            onClick={() => onOpenAction(action)}
          >
            <span className="block truncate text-sm font-medium">{action.student_name}</span>
            <span className="text-muted-foreground mt-1 block truncate text-xs">{action.activity_name}</span>
            <span className="mt-2 inline-flex text-xs font-medium">{t('submissionReview')}</span>
          </button>
        ))}
      </div>
      {data.teacher_actions.length > actions.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {uniqueActionActivities(data.teacher_actions).map(activity => (
            <Button
              key={activity.activity_id}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenActivity(activity.activity_id)}
            >
              {activity.activity_name}
            </Button>
          ))}
        </div>
      ) : null}
    </section>
  )
}

function uniqueActionActivities(actions: TeacherAction[]) {
  const byActivity = new Map<number, Pick<TeacherAction, 'activity_id' | 'activity_name'>>()
  for (const action of actions) {
    byActivity.set(action.activity_id, {
      activity_id: action.activity_id,
      activity_name: action.activity_name,
    })
  }
  return [...byActivity.values()]
}

function RollupPanel({ data }: { data: CourseGradebookResponse }) {
  const t = useTranslations('Features.Grading.Gradebook')
  const [kind, setKind] = useState<GradebookRollupKind>('activity_category')
  const rows = useMemo(() => buildGradebookRollups(data, kind), [data, kind])

  return (
    <Tabs value={kind} onValueChange={value => setKind(value as GradebookRollupKind)} className="rounded-lg border p-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-sm font-semibold">{t('rollups.title')}</h2>
          <p className="text-muted-foreground text-xs">{t('rollups.description')}</p>
        </div>
        <TabsList>
          {ROLLUP_KINDS.map(item => (
            <TabsTrigger key={item} value={item}>
              {t(`rollups.${item}`)}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {ROLLUP_KINDS.map(item => (
        <TabsContent key={item} value={item} className="mt-3">
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {rows.map(row => (
              <div key={row.id} className="rounded-md border p-3">
                <div className="truncate text-sm font-semibold">{labelRollupRow(t, kind, row.label)}</div>
                <div className="text-muted-foreground mt-1 text-xs">
                  {row.averageScore === null
                    ? t('noScore')
                    : t('averageScore', { score: Math.round(row.averageScore) })}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <RollupMetric label={t('summary.needsGrading')} value={row.needsGrading} />
                  <RollupMetric label={t('summary.overdue')} value={row.overdue} />
                  <RollupMetric label={t('summary.notStarted')} value={row.notStarted} />
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      ))}
    </Tabs>
  )
}

function RollupMetric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="font-semibold">{value}</div>
      <div className="text-muted-foreground truncate">{label}</div>
    </div>
  )
}

function labelRollupRow(t: (key: string) => string, kind: GradebookRollupKind, label: string) {
  if (kind === 'activity_category') return labelActivityType(t, label)
  if (kind === 'cohort' && label === '__default_cohort__') return t('defaultCohort')
  return label
}

function setParam(params: URLSearchParams, key: string, value: string) {
  if (value) params.set(key, value)
  else params.delete(key)
}

function normalizeSavedFilter(value: string | null): GradebookFilters['savedFilter'] {
  if (
    value === 'all' ||
    value === 'needs_grading' ||
    value === 'overdue' ||
    value === 'returned' ||
    value === 'failed' ||
    value === 'not_started'
  ) {
    return value
  }
  return 'needs_grading'
}

function normalizePage(value: string | null) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1
}

function setGradebookPage(
  searchParams: { toString: () => string },
  pathname: string,
  router: ReturnType<typeof useRouter>,
  nextPage: number,
) {
  const params = new URLSearchParams(searchParams.toString())
  if (nextPage <= 1) params.delete('page')
  else params.set('page', String(nextPage))
  const next = params.toString()
  router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false })
}
