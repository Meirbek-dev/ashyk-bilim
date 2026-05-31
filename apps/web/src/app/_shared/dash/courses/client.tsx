'use client'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  buildCourseCreationPath,
  buildCourseWorkspacePath,
  courseNeedsAttention,
  getCourseContentStats,
  getCourseReadinessSummary,
} from '@/lib/course-management'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { AlertTriangle, LayoutGrid, List, MoreHorizontal, Search, Sparkles, Trash2, Workflow, X } from 'lucide-react'
import { CourseStatusBadge } from '@components/Dashboard/Courses/courseWorkflowUi'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import CourseThumbnail, { removeCoursePrefix } from '@components/Objects/Thumbnails/CourseThumbnail'
import { deleteCourseFromBackend, updateCourseAccess } from '@services/courses/courses'
import { useTrailCurrent } from '@/features/trail/hooks/useTrail'
import { Actions, Resources, Scopes } from '@/components/Security'
import { useSession } from '@/hooks/useSession'
import { useCallback, useEffect, useMemo, useOptimistic, useState, useTransition } from 'react'
import type { Course } from '@components/Objects/Thumbnails/CourseThumbnail'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import DashHeader from '@/components/Dashboard/Misc/DashHeader'
import type { ColumnDef } from '@tanstack/react-table'
import { Checkbox } from '@/components/ui/checkbox'
import { extractMarkdownSummary } from '@/features/content-markdown'
import DataTable from '@/components/ui/data-table'
import { Button } from '@/components/ui/button'
import AppLink from '@/components/ui/AppLink'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { getAbsoluteUrl } from '@services/config/config'

interface ManageableCourse extends Course {
  public?: boolean
}

interface CourseProps {
  courses: ManageableCourse[]
  totalCourses: number
  currentPage: number
  searchQuery: string
  sortBy: 'updated' | 'name'
  pageSize: number
  preset: string
  summaryCounts: {
    total: number
    ready: number
    private: number
    attention: number
  }
}

type BulkActionKind = 'publish' | 'private' | 'delete'

const CoursesHome = ({
  courses,
  totalCourses,
  currentPage,
  searchQuery,
  sortBy,
  pageSize,
  preset,
  summaryCounts,
}: CourseProps) => {
  const t = useTranslations('DashPage.CourseManagement.Dashboard')
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [searchInput, setSearchInput] = useState(searchQuery)
  const viewMode = searchParams.get('view') === 'table' ? 'table' : 'cards'
  const { can, isAuthenticated } = useSession()
  const canCreateCourse = can(Resources.COURSE, Actions.CREATE, Scopes.APP)
  const [selectedCourseUuids, setSelectedCourseUuids] = useState<string[]>([])
  const [isBulkPending, startBulkTransition] = useTransition()
  const [pendingBulkAction, setPendingBulkAction] = useState<BulkActionKind | null>(null)
  const [optimisticCourses, removeOptimisticCourses] = useOptimistic(
    courses,
    (state: ManageableCourse[], deletedUuids: string[]) => state.filter(c => !deletedUuids.includes(c.course_uuid)),
  )
  const { data: trailData, isLoading: trailQueryLoading } = useTrailCurrent({
    enabled: isAuthenticated,
  })

  const isTrailLoading = isAuthenticated && trailQueryLoading

  const totalPages = Math.max(1, Math.ceil(totalCourses / pageSize))
  const hasPagination = totalPages > 1
  const hasQuery = searchQuery.length > 0

  const updateRoute = (updates: Record<string, string | null>) => {
    const nextParams = new URLSearchParams(searchParams.toString())
    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === '') {
        nextParams.delete(key)
      } else {
        nextParams.set(key, value)
      }
    })

    const nextQuery = nextParams.toString()
    router.push(nextQuery ? `${pathname}?${nextQuery}` : pathname, {
      scroll: false,
    })
  }

  const courseReadinessMap = useMemo(() => {
    const map = new Map<string, boolean>()
    for (const course of optimisticCourses) {
      map.set(course.course_uuid, getCourseReadinessSummary(course, null).readyToPublish)
    }
    return map
  }, [optimisticCourses])

  const summaryCards = useMemo(() => {
    return [
      {
        label: t('summary.total.label'),
        value: summaryCounts.total,
        detail: t('summary.total.detail'),
      },
      {
        label: t('summary.ready.label'),
        value: summaryCounts.ready,
        detail: t('summary.ready.detail'),
      },
      {
        label: t('summary.private.label'),
        value: summaryCounts.private,
        detail: t('summary.private.detail'),
      },
      {
        label: t('summary.attention.label'),
        value: summaryCounts.attention,
        detail: t('summary.attention.detail'),
      },
    ]
  }, [summaryCounts, t])

  const canManageCourse = useCallback(
    (course: ManageableCourse) =>
      can(Resources.COURSE, Actions.MANAGE, Scopes.APP) ||
      Boolean(course.is_owner && can(Resources.COURSE, Actions.MANAGE, Scopes.OWN)),
    [can],
  )

  const canDeleteCourse = useCallback(
    (course: ManageableCourse) =>
      can(Resources.COURSE, Actions.DELETE, Scopes.APP) ||
      Boolean(course.is_owner && can(Resources.COURSE, Actions.DELETE, Scopes.OWN)),
    [can],
  )

  const visibleCourseUuids = useMemo(() => optimisticCourses.map(course => course.course_uuid), [optimisticCourses])
  const visibleCourseUuidSet = useMemo(() => new Set(visibleCourseUuids), [visibleCourseUuids])
  const selectedCourseUuidSet = useMemo(() => new Set(selectedCourseUuids), [selectedCourseUuids])

  useEffect(() => {
    setSelectedCourseUuids(current => current.filter(courseUuid => visibleCourseUuidSet.has(courseUuid)))
  }, [visibleCourseUuidSet])

  const selectedCourses = useMemo(
    () => optimisticCourses.filter(course => selectedCourseUuidSet.has(course.course_uuid)),
    [optimisticCourses, selectedCourseUuidSet],
  )

  const selectableVisibleCourses = useMemo(
    () => optimisticCourses.filter(course => canManageCourse(course) || canDeleteCourse(course)),
    [canDeleteCourse, canManageCourse, optimisticCourses],
  )

  const allVisibleSelected =
    selectableVisibleCourses.length > 0 &&
    selectableVisibleCourses.every(course => selectedCourseUuidSet.has(course.course_uuid))

  const someVisibleSelected =
    !allVisibleSelected && selectableVisibleCourses.some(course => selectedCourseUuidSet.has(course.course_uuid))

  const headerCheckboxState = allVisibleSelected ? true : someVisibleSelected ? ('indeterminate' as const) : false

  const toggleCourseSelection = (courseUuid: string, checked: boolean) => {
    setSelectedCourseUuids(current => {
      if (checked) {
        if (current.includes(courseUuid)) {
          return current
        }
        return [...current, courseUuid]
      }
      return current.filter(value => value !== courseUuid)
    })
  }

  const toggleAllVisibleCourses = useCallback(
    (checked: boolean) => {
      if (!checked) {
        setSelectedCourseUuids(current => current.filter(courseUuid => !visibleCourseUuidSet.has(courseUuid)))
        return
      }

      setSelectedCourseUuids(current => {
        const next = new Set(current)
        selectableVisibleCourses.forEach(course => next.add(course.course_uuid))
        return [...next]
      })
    },
    [selectableVisibleCourses, visibleCourseUuidSet],
  )

  const runBulkVisibility = (nextPublic: boolean) => {
    if (!(selectedCourses.length > 0)) {
      return
    }

    const targetCourses = selectedCourses.filter(course => canManageCourse(course))
    if (targetCourses.length === 0) {
      toast.error(t('errors.cannotUpdateSelection'))
      return
    }

    startBulkTransition(() => {
      void (async () => {
        const results = await Promise.allSettled(
          targetCourses.map(course =>
            updateCourseAccess(
              course.course_uuid,
              { public: nextPublic },
              {
                lastKnownUpdateDate: course.update_date,
              },
            ),
          ),
        )

        const successCount = results.filter(
          (result): result is PromiseFulfilledResult<any> => result.status === 'fulfilled' && result.value?.success,
        ).length
        const failedCount = targetCourses.length - successCount

        if (successCount > 0) {
          toast.success(
            nextPublic
              ? t('toasts.published', { count: successCount })
              : t('toasts.movedPrivate', { count: successCount }),
          )
          setSelectedCourseUuids([])
          router.refresh()
        }

        if (failedCount > 0) {
          toast.error(t('toasts.updateFailed', { count: failedCount }))
        }
      })()
    })
  }

  const runBulkDelete = () => {
    if (!(selectedCourses.length > 0)) {
      return
    }

    const targetCourses = selectedCourses.filter(course => canDeleteCourse(course))
    if (targetCourses.length === 0) {
      toast.error(t('errors.cannotDeleteSelection'))
      return
    }

    startBulkTransition(async () => {
      removeOptimisticCourses(targetCourses.map(c => c.course_uuid))
      const results = await Promise.allSettled(targetCourses.map(course => deleteCourseFromBackend(course.course_uuid)))

      const successCount = results.filter(result => result.status === 'fulfilled').length
      const failedCount = targetCourses.length - successCount

      if (successCount > 0) {
        toast.success(t('toasts.deleted', { count: successCount }))
        setSelectedCourseUuids([])
        router.refresh()
      }

      if (failedCount > 0) {
        toast.error(t('toasts.deleteFailed', { count: failedCount }))
      }
    })
  }

  const confirmBulkAction = () => {
    if (pendingBulkAction === 'publish') {
      setPendingBulkAction(null)
      runBulkVisibility(true)
      return
    }

    if (pendingBulkAction === 'private') {
      setPendingBulkAction(null)
      runBulkVisibility(false)
      return
    }

    if (pendingBulkAction === 'delete') {
      setPendingBulkAction(null)
      runBulkDelete()
    }
  }

  const bulkActionMeta =
    pendingBulkAction === 'publish'
      ? {
          title: t('dialogs.publish.title'),
          description: t('dialogs.publish.description', {
            count: selectedCourses.length,
          }),
          confirmLabel: t('dialogs.publish.confirm'),
          variant: 'default' as const,
          mediaClassName: 'bg-muted text-foreground',
        }
      : pendingBulkAction === 'private'
        ? {
            title: t('dialogs.private.title'),
            description: t('dialogs.private.description', {
              count: selectedCourses.length,
            }),
            confirmLabel: t('dialogs.private.confirm'),
            variant: 'default' as const,
            mediaClassName: 'bg-muted text-foreground',
          }
        : pendingBulkAction === 'delete'
          ? {
              title: t('dialogs.delete.title'),
              description: t('dialogs.delete.description', {
                count: selectedCourses.length,
              }),
              confirmLabel: t('dialogs.delete.confirm'),
              variant: 'destructive' as const,
              mediaClassName: 'bg-destructive/10 text-destructive',
            }
          : null

  const bulkToolbar =
    selectedCourses.length > 0 ? (
      <div className="bg-muted flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2">
        <Badge variant="outline">{t('bulk.selectedCount', { count: selectedCourses.length })}</Badge>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isBulkPending || !selectedCourses.some(course => canManageCourse(course))}
          onClick={() => setPendingBulkAction('publish')}
        >
          {t('bulk.publish')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isBulkPending || !selectedCourses.some(course => canManageCourse(course))}
          onClick={() => setPendingBulkAction('private')}
        >
          {t('bulk.movePrivate')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isBulkPending || !selectedCourses.some(course => canDeleteCourse(course))}
          onClick={() => setSelectedCourseUuids([])}
        >
          {t('bulk.clearSelection')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="destructive"
          disabled={isBulkPending || !selectedCourses.some(course => canDeleteCourse(course))}
          onClick={() => setPendingBulkAction('delete')}
        >
          {t('bulk.delete')}
        </Button>
      </div>
    ) : null

  const columns = useMemo<ColumnDef<ManageableCourse>[]>(
    () => [
      {
        id: 'select',
        header: () => (
          <Checkbox
            checked={headerCheckboxState === true}
            indeterminate={headerCheckboxState === 'indeterminate'}
            onCheckedChange={checked => toggleAllVisibleCourses(checked)}
            aria-label={t('table.selectVisibleAria')}
          />
        ),
        enableSorting: false,
        enableHiding: false,
        meta: { label: t('table.select'), exportable: false },
        cell: ({ row }) => {
          const course = row.original
          const disabled = !(canManageCourse(course) || canDeleteCourse(course))
          return (
            <Checkbox
              checked={selectedCourseUuidSet.has(course.course_uuid)}
              disabled={disabled}
              onCheckedChange={checked => toggleCourseSelection(course.course_uuid, checked)}
              aria-label={t('table.selectCourseAria', {
                courseName: course.name,
              })}
            />
          )
        },
      },
      {
        accessorKey: 'name',
        header: t('table.course'),
        meta: { label: t('table.course') },
        cell: ({ row }) => {
          const course = row.original
          const stats = getCourseContentStats(course)

          return (
            <div className="space-y-1">
              <AppLink
                href={buildCourseWorkspacePath(removeCoursePrefix(course.course_uuid))}
                className="text-foreground hover:text-foreground/70 font-semibold"
              >
                {course.name}
              </AppLink>
              <div className="text-muted-foreground line-clamp-2 text-sm">
                {course.description?.trim()
                  ? extractMarkdownSummary(course.description, 140)
                  : t('table.noDescription')}
              </div>
              <div className="text-muted-foreground text-xs">
                {t('table.structureSummary', {
                  chapters: stats.chapters,
                  activities: stats.activities,
                })}
              </div>
            </div>
          )
        },
      },
      {
        id: 'status',
        header: t('table.status'),
        meta: { label: t('table.status') },
        cell: ({ row }) => {
          const course = row.original
          const ready = courseReadinessMap.get(course.course_uuid) ?? false

          return (
            <div className="flex flex-wrap gap-2">
              <CourseStatusBadge status={course.public ? 'public' : 'private'} />
              <CourseStatusBadge status={ready ? 'ready' : 'needs-review'} />
              {courseNeedsAttention(course) ? <CourseStatusBadge status="attention" /> : null}
            </div>
          )
        },
      },
      {
        id: 'updated',
        accessorFn: course => course.update_date,
        header: t('table.updated'),
        meta: { label: t('table.updated') },
        cell: ({ row }) => (
          <div className="text-muted-foreground text-sm">
            {row.original.update_date
              ? new Date(row.original.update_date).toLocaleDateString()
              : t('table.unknownDate')}
          </div>
        ),
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        meta: { label: t('table.actions'), exportable: false },
        cell: ({ row }) => <CourseRowActions course={row.original} onOptimisticDelete={removeOptimisticCourses} />,
      },
    ],
    [
      headerCheckboxState,
      canDeleteCourse,
      canManageCourse,
      courseReadinessMap,
      removeOptimisticCourses,
      selectedCourseUuidSet,
      t,
      toggleAllVisibleCourses,
    ],
  )

  const presets = [
    { key: 'all', label: t('presets.all') },
    { key: 'drafts', label: t('presets.drafts') },
    { key: 'published', label: t('presets.published') },
    { key: 'private', label: t('presets.private') },
    { key: 'recent', label: t('presets.recent') },
    { key: 'attention', label: t('presets.attention') },
  ]

  return (
    <div className="bg-background flex min-h-screen w-full flex-col">
      <DashHeader
        breadcrumbType="courses"
        title={t('header.title')}
        description={t('header.description')}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => updateRoute({ view: viewMode === 'table' ? null : 'table' })}
              className="h-9 px-3 text-xs font-semibold"
            >
              {viewMode === 'table' ? <LayoutGrid className="mr-2 size-4" /> : <List className="mr-2 size-4" />}
              {viewMode === 'table' ? t('viewMode.cards') : t('viewMode.table')}
            </Button>
            {canCreateCourse ? (
              <Button
                size="sm"
                nativeButton={false}
                render={<AppLink href={buildCourseCreationPath()} />}
                className="h-9 px-3 text-xs font-semibold"
              >
                <Sparkles className="mr-2 size-4" />
                {t('guidedSetup')}
              </Button>
            ) : null}
          </div>
        }
      />

      <main className="container mx-auto px-4 py-8 lg:px-8 space-y-6 flex-1">
        {/* Summary Cards */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map(card => (
            <div key={card.label} className="bg-card border-border/80 rounded-2xl border p-5 shadow-2xs">
              <div className="text-muted-foreground text-[10px] font-bold tracking-[0.1em] uppercase leading-none">
                {card.label}
              </div>
              <div className="text-foreground mt-2.5 text-3xl font-bold tracking-tight">{card.value}</div>
              <div className="text-muted-foreground mt-1.5 text-xs font-medium leading-relaxed">{card.detail}</div>
            </div>
          ))}
        </div>

        {/* Filter Presets Panel */}
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {presets.map(item => (
              <Button
                key={item.key}
                type="button"
                variant={preset === item.key ? 'default' : 'outline'}
                size="sm"
                className="rounded-full px-4 h-8 text-xs font-medium transition-all"
                onClick={() =>
                  updateRoute({
                    preset: item.key === 'all' ? null : item.key,
                    page: '1',
                  })
                }
              >
                {item.label}
              </Button>
            ))}
          </div>

          <div className="bg-muted/40 border-border/60 flex flex-col gap-4 rounded-2xl border p-4 shadow-2xs lg:flex-row lg:items-center lg:justify-between">
            <form
              className="flex w-full max-w-2xl items-center gap-2"
              onSubmit={event => {
                event.preventDefault()
                updateRoute({ q: searchInput.trim() || null, page: '1' })
              }}
            >
              <div className="relative flex-1">
                <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                <Input
                  value={searchInput}
                  onChange={event => setSearchInput(event.target.value)}
                  placeholder={t('search.placeholder')}
                  className="pl-9 h-9 text-sm"
                />
              </div>
              <Button type="submit" size="sm" className="h-9 px-4">{t('search.submit')}</Button>
              {hasQuery ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 px-3"
                  onClick={() => {
                    setSearchInput('')
                    updateRoute({ q: null, page: '1' })
                  }}
                >
                  <X className="mr-2 h-4 w-4" />
                  {t('search.clear')}
                </Button>
              ) : null}
            </form>

            <div className="flex items-center gap-3 shrink-0">
              <label className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">{t('sort.label')}</label>
              <NativeSelect
                value={sortBy}
                onChange={event => updateRoute({ sort: event.target.value, page: '1' })}
                className="w-[180px] h-9"
                aria-label={t('sort.label')}
              >
                <NativeSelectOption value="updated">{t('sort.updated')}</NativeSelectOption>
                <NativeSelectOption value="name">{t('sort.name')}</NativeSelectOption>
              </NativeSelect>
            </div>
          </div>

          <div className="text-muted-foreground text-xs font-semibold tracking-wide px-1">
            {t('resultsSummary', {
              visible: optimisticCourses.length,
              total: totalCourses,
            })}
          </div>
        </div>

        {/* Content list */}
        {optimisticCourses.length === 0 ? (
          <div className="bg-card rounded-2xl border border-dashed py-16 shadow-2xs">
            <div className="flex items-center justify-center">
              <div className="text-center space-y-4 max-w-sm px-4">
                <h2 className="text-foreground text-xl font-bold">{t('empty.title')}</h2>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {hasQuery ? t('empty.withQuery') : t('empty.withoutQuery')}
                </p>
                {canCreateCourse ? (
                  <div className="flex justify-center pt-2">
                    <Button
                      size="sm"
                      nativeButton={false}
                      render={<AppLink href={buildCourseCreationPath()} />}
                      className="px-4"
                    >
                      <Sparkles className="mr-2 size-4" />
                      {t('empty.createAction')}
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : viewMode === 'cards' ? (
          <div className="grid w-full grid-cols-1 gap-6 pb-8 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4">
            {optimisticCourses.map(course => (
              <div key={course.course_uuid} className="w-full">
                <CourseThumbnail
                  customLink={buildCourseWorkspacePath(removeCoursePrefix(course.course_uuid))}
                  actionLink={getAbsoluteUrl(`/course/${removeCoursePrefix(course.course_uuid)}`)}
                  course={course}
                  trailData={trailData}
                  trailLoading={isTrailLoading}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-card rounded-2xl border p-4 shadow-2xs">
            <DataTable
              columns={columns}
              data={optimisticCourses}
              enableColumnVisibility={false}
              enableCsvExport
              csvFileName={`courses-${new Date().toISOString().slice(0, 10)}.csv`}
              storageKey="course-management"
              serverPaginated
              toolbarContent={bulkToolbar}
              labels={{
                searchPlaceholder: t('table.filterPlaceholder'),
                emptyMessage: t('table.emptyMessage'),
              }}
            />
          </div>
        )}

        {hasPagination ? (
          <div className="flex items-center justify-between border-t border-border/60 pt-6 pb-8">
            <div className="text-muted-foreground text-xs font-semibold">
              {t('pagination.page', { current: currentPage, total: totalPages })}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs px-3"
                disabled={currentPage <= 1}
                onClick={() => updateRoute({ page: String(Math.max(1, currentPage - 1)) })}
              >
                {t('pagination.previous')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs px-3"
                disabled={currentPage >= totalPages}
                onClick={() =>
                  updateRoute({
                    page: String(Math.min(totalPages, currentPage + 1)),
                  })
                }
              >
                {t('pagination.next')}
              </Button>
            </div>
          </div>
        ) : null}
      </main>

      <AlertDialog
        open={pendingBulkAction !== null}
        onOpenChange={open => {
          if (!open) {
            setPendingBulkAction(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className={bulkActionMeta?.mediaClassName}>
              <AlertTriangle className="size-8" />
            </AlertDialogMedia>
            <AlertDialogTitle>{bulkActionMeta?.title}</AlertDialogTitle>
            <AlertDialogDescription>{bulkActionMeta?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkPending} />
            <AlertDialogAction
              variant={bulkActionMeta?.variant}
              disabled={isBulkPending || !bulkActionMeta}
              onClick={confirmBulkAction}
            >
              {bulkActionMeta?.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function CourseRowActions({
  course,
  onOptimisticDelete,
}: {
  course: ManageableCourse
  onOptimisticDelete: (uuids: string[]) => void
}) {
  const t = useTranslations('DashPage.CourseManagement.Dashboard')
  const router = useRouter()
  const { can } = useSession()
  const [isPending, startTransition] = useTransition()

  const canManageCourse =
    can(Resources.COURSE, Actions.MANAGE, Scopes.APP) ||
    Boolean(course.is_owner && can(Resources.COURSE, Actions.MANAGE, Scopes.OWN))
  const canDeleteCourse =
    can(Resources.COURSE, Actions.DELETE, Scopes.APP) ||
    Boolean(course.is_owner && can(Resources.COURSE, Actions.DELETE, Scopes.OWN))

  const handleDelete = () => {
    if (!canDeleteCourse) return

    startTransition(async () => {
      onOptimisticDelete([course.course_uuid])
      try {
        await deleteCourseFromBackend(course.course_uuid)
        toast.success(t('rowActions.deleteSuccess'))
        router.refresh()
      } catch {
        toast.error(t('rowActions.deleteError'))
      }
    })
  }

  const handleToggleVisibility = () => {
    if (!canManageCourse) return

    startTransition(() => {
      void (async () => {
        try {
          await updateCourseAccess(
            course.course_uuid,
            { public: !course.public },
            {
              lastKnownUpdateDate: course.update_date,
            },
          )
          toast.success(course.public ? t('rowActions.visibilityMovedPrivate') : t('rowActions.visibilityPublished'))
          router.refresh()
        } catch {
          toast.error(t('rowActions.visibilityError'))
        }
      })()
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="icon" disabled={isPending}>
            <MoreHorizontal className="size-4" />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => router.push(buildCourseWorkspacePath(removeCoursePrefix(course.course_uuid)))}>
          <List className="size-4" />
          {t('rowActions.openWorkspace')}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => router.push(buildCourseWorkspacePath(removeCoursePrefix(course.course_uuid), 'curriculum'))}
        >
          <Workflow className="size-4" />
          {t('rowActions.openCurriculum')}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => router.push(buildCourseWorkspacePath(removeCoursePrefix(course.course_uuid), 'review'))}
        >
          <Sparkles className="size-4" />
          {t('rowActions.reviewPublish')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push(buildCourseCreationPath(course.course_uuid))}>
          <LayoutGrid className="size-4" />
          {t('rowActions.useAsTemplate')}
        </DropdownMenuItem>
        {canManageCourse ? (
          <DropdownMenuItem onClick={handleToggleVisibility}>
            <Sparkles className="size-4" />
            {course.public ? t('rowActions.movePrivate') : t('rowActions.publish')}
          </DropdownMenuItem>
        ) : null}
        {canDeleteCourse ? (
          <DropdownMenuItem onClick={handleDelete} variant="destructive">
            <Trash2 className="size-4" />
            {t('rowActions.delete')}
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default CoursesHome
