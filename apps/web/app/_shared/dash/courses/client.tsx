'use client';

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
} from '@/components/ui/alert-dialog';
import {
  buildCourseCreationPath,
  buildCourseWorkspacePath,
  courseNeedsAttention,
  getCourseContentStats,
  getCourseReadinessSummary,
} from '@/lib/course-management';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AlertTriangle, LayoutGrid, List, MoreHorizontal, Search, Sparkles, Trash2, Workflow, X } from 'lucide-react';
import { CourseStatusBadge, courseWorkflowSummaryCardClass } from '@components/Dashboard/Courses/courseWorkflowUi';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import CourseThumbnail, { removeCoursePrefix } from '@components/Objects/Thumbnails/CourseThumbnail';
import { deleteCourseFromBackend, updateCourseAccess } from '@services/courses/courses';
import { useTrailCurrent } from '@/features/trail/hooks/useTrail';
import { Actions, Resources, Scopes } from '@/components/Security';
import { useSession } from '@/hooks/useSession';
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import type { Course } from '@components/Objects/Thumbnails/CourseThumbnail';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import BreadCrumbs from '@components/Dashboard/Misc/BreadCrumbs';
import type { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import DataTable from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import AppLink from '@/components/ui/AppLink';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { getAbsoluteUrl } from '@services/config/config';

interface ManageableCourse extends Course {
  public?: boolean;
}

interface CourseProps {
  courses: ManageableCourse[];
  totalCourses: number;
  currentPage: number;
  searchQuery: string;
  sortBy: 'updated' | 'name';
  pageSize: number;
  preset: string;
  summaryCounts: {
    total: number;
    ready: number;
    private: number;
    attention: number;
  };
}

type BulkActionKind = 'publish' | 'private' | 'delete';

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
  const t = useTranslations('DashPage.CourseManagement.Dashboard');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [searchInput, setSearchInput] = useState(searchQuery);
  const viewMode = searchParams.get('view') === 'table' ? 'table' : 'cards';
  const { can, isAuthenticated } = useSession();
  const canCreateCourse = can(Resources.COURSE, Actions.CREATE, Scopes.PLATFORM);
  const [selectedCourseUuids, setSelectedCourseUuids] = useState<string[]>([]);
  const [isBulkPending, startBulkTransition] = useTransition();
  const [pendingBulkAction, setPendingBulkAction] = useState<BulkActionKind | null>(null);
  const { data: trailData } = useTrailCurrent({ enabled: isAuthenticated });

  const isTrailLoading = isAuthenticated && !trailData;

  const totalPages = Math.max(1, Math.ceil(totalCourses / pageSize));
  const hasPagination = totalPages > 1;
  const hasQuery = searchQuery.length > 0;

  const updateRoute = (updates: Record<string, string | null>) => {
    const nextParams = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === '') {
        nextParams.delete(key);
      } else {
        nextParams.set(key, value);
      }
    });

    const nextQuery = nextParams.toString();
    router.push(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  };

  const courseReadinessMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const course of courses) {
      map.set(course.course_uuid, getCourseReadinessSummary(course, null).readyToPublish);
    }
    return map;
  }, [courses]);

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
    ];
  }, [summaryCounts, t]);

  const canManageCourse = useCallback(
    (course: ManageableCourse) =>
      can(Resources.COURSE, Actions.MANAGE, Scopes.PLATFORM) ||
      Boolean(course.is_owner && can(Resources.COURSE, Actions.MANAGE, Scopes.OWN)),
    [can],
  );

  const canDeleteCourse = useCallback(
    (course: ManageableCourse) =>
      can(Resources.COURSE, Actions.DELETE, Scopes.PLATFORM) ||
      Boolean(course.is_owner && can(Resources.COURSE, Actions.DELETE, Scopes.OWN)),
    [can],
  );

  const visibleCourseUuids = useMemo(() => courses.map((course) => course.course_uuid), [courses]);
  const visibleCourseUuidSet = useMemo(() => new Set(visibleCourseUuids), [visibleCourseUuids]);
  const selectedCourseUuidSet = useMemo(() => new Set(selectedCourseUuids), [selectedCourseUuids]);

  useEffect(() => {
    setSelectedCourseUuids((current) => current.filter((courseUuid) => visibleCourseUuidSet.has(courseUuid)));
  }, [visibleCourseUuidSet]);

  const selectedCourses = useMemo(
    () => courses.filter((course) => selectedCourseUuidSet.has(course.course_uuid)),
    [courses, selectedCourseUuidSet],
  );

  const selectableVisibleCourses = useMemo(
    () => courses.filter((course) => canManageCourse(course) || canDeleteCourse(course)),
    [canDeleteCourse, canManageCourse, courses],
  );

  const allVisibleSelected =
    selectableVisibleCourses.length > 0 &&
    selectableVisibleCourses.every((course) => selectedCourseUuidSet.has(course.course_uuid));

  const someVisibleSelected =
    !allVisibleSelected && selectableVisibleCourses.some((course) => selectedCourseUuidSet.has(course.course_uuid));

  const headerCheckboxState = allVisibleSelected ? true : someVisibleSelected ? ('indeterminate' as const) : false;

  const toggleCourseSelection = (courseUuid: string, checked: boolean) => {
    setSelectedCourseUuids((current) => {
      if (checked) {
        if (current.includes(courseUuid)) {
          return current;
        }
        return [...current, courseUuid];
      }
      return current.filter((value) => value !== courseUuid);
    });
  };

  const toggleAllVisibleCourses = useCallback(
    (checked: boolean) => {
      if (!checked) {
        setSelectedCourseUuids((current) => current.filter((courseUuid) => !visibleCourseUuidSet.has(courseUuid)));
        return;
      }

      setSelectedCourseUuids((current) => {
        const next = new Set(current);
        selectableVisibleCourses.forEach((course) => next.add(course.course_uuid));
        return [...next];
      });
    },
    [selectableVisibleCourses, visibleCourseUuidSet],
  );

  const runBulkVisibility = (nextPublic: boolean) => {
    if (!(selectedCourses.length > 0)) {
      return;
    }

    const targetCourses = selectedCourses.filter((course) => canManageCourse(course));
    if (targetCourses.length === 0) {
      toast.error(t('errors.cannotUpdateSelection'));
      return;
    }

    startBulkTransition(() => {
      void (async () => {
        const results = await Promise.allSettled(
          targetCourses.map((course) =>
            updateCourseAccess(
              course.course_uuid,
              { public: nextPublic },
              {
                lastKnownUpdateDate: course.update_date,
              },
            ),
          ),
        );

        const successCount = results.filter(
          (result): result is PromiseFulfilledResult<any> => result.status === 'fulfilled' && result.value?.success,
        ).length;
        const failedCount = targetCourses.length - successCount;

        if (successCount > 0) {
          toast.success(
            nextPublic
              ? t('toasts.published', { count: successCount })
              : t('toasts.movedPrivate', { count: successCount }),
          );
          setSelectedCourseUuids([]);
          router.refresh();
        }

        if (failedCount > 0) {
          toast.error(t('toasts.updateFailed', { count: failedCount }));
        }
      })();
    });
  };

  const runBulkDelete = () => {
    if (!(selectedCourses.length > 0)) {
      return;
    }

    const targetCourses = selectedCourses.filter((course) => canDeleteCourse(course));
    if (targetCourses.length === 0) {
      toast.error(t('errors.cannotDeleteSelection'));
      return;
    }

    startBulkTransition(() => {
      void (async () => {
        const results = await Promise.allSettled(
          targetCourses.map((course) => deleteCourseFromBackend(course.course_uuid)),
        );

        const successCount = results.filter((result) => result.status === 'fulfilled').length;
        const failedCount = targetCourses.length - successCount;

        if (successCount > 0) {
          toast.success(t('toasts.deleted', { count: successCount }));
          setSelectedCourseUuids([]);
          router.refresh();
        }

        if (failedCount > 0) {
          toast.error(t('toasts.deleteFailed', { count: failedCount }));
        }
      })();
    });
  };

  const confirmBulkAction = () => {
    if (pendingBulkAction === 'publish') {
      setPendingBulkAction(null);
      runBulkVisibility(true);
      return;
    }

    if (pendingBulkAction === 'private') {
      setPendingBulkAction(null);
      runBulkVisibility(false);
      return;
    }

    if (pendingBulkAction === 'delete') {
      setPendingBulkAction(null);
      runBulkDelete();
    }
  };

  const bulkActionMeta =
    pendingBulkAction === 'publish'
      ? {
          title: t('dialogs.publish.title'),
          description: t('dialogs.publish.description', { count: selectedCourses.length }),
          confirmLabel: t('dialogs.publish.confirm'),
          variant: 'default' as const,
          mediaClassName: 'bg-muted text-foreground',
        }
      : pendingBulkAction === 'private'
        ? {
            title: t('dialogs.private.title'),
            description: t('dialogs.private.description', { count: selectedCourses.length }),
            confirmLabel: t('dialogs.private.confirm'),
            variant: 'default' as const,
            mediaClassName: 'bg-muted text-foreground',
          }
        : pendingBulkAction === 'delete'
          ? {
              title: t('dialogs.delete.title'),
              description: t('dialogs.delete.description', { count: selectedCourses.length }),
              confirmLabel: t('dialogs.delete.confirm'),
              variant: 'destructive' as const,
              mediaClassName: 'bg-destructive/10 text-destructive',
            }
          : null;

  const bulkToolbar =
    selectedCourses.length > 0 ? (
      <div className="bg-muted flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2">
        <Badge variant="outline">{t('bulk.selectedCount', { count: selectedCourses.length })}</Badge>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isBulkPending || !selectedCourses.some((course) => canManageCourse(course))}
          onClick={() => setPendingBulkAction('publish')}
        >
          {t('bulk.publish')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isBulkPending || !selectedCourses.some((course) => canManageCourse(course))}
          onClick={() => setPendingBulkAction('private')}
        >
          {t('bulk.movePrivate')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isBulkPending || !selectedCourses.some((course) => canDeleteCourse(course))}
          onClick={() => setSelectedCourseUuids([])}
        >
          {t('bulk.clearSelection')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="destructive"
          disabled={isBulkPending || !selectedCourses.some((course) => canDeleteCourse(course))}
          onClick={() => setPendingBulkAction('delete')}
        >
          {t('bulk.delete')}
        </Button>
      </div>
    ) : null;

  const columns = useMemo<ColumnDef<ManageableCourse>[]>(
    () => [
      {
        id: 'select',
        header: () => (
          <Checkbox
            checked={headerCheckboxState === true}
            indeterminate={headerCheckboxState === 'indeterminate'}
            onCheckedChange={(checked) => toggleAllVisibleCourses(checked)}
            aria-label={t('table.selectVisibleAria')}
          />
        ),
        enableSorting: false,
        enableHiding: false,
        meta: { label: t('table.select'), exportable: false },
        cell: ({ row }) => {
          const course = row.original;
          const disabled = !(canManageCourse(course) || canDeleteCourse(course));
          return (
            <Checkbox
              checked={selectedCourseUuidSet.has(course.course_uuid)}
              disabled={disabled}
              onCheckedChange={(checked) => toggleCourseSelection(course.course_uuid, checked)}
              aria-label={t('table.selectCourseAria', { courseName: course.name })}
            />
          );
        },
      },
      {
        accessorKey: 'name',
        header: t('table.course'),
        meta: { label: t('table.course') },
        cell: ({ row }) => {
          const course = row.original;
          const stats = getCourseContentStats(course);

          return (
            <div className="space-y-1">
              <AppLink
                href={buildCourseWorkspacePath(removeCoursePrefix(course.course_uuid))}
                className="text-foreground hover:text-foreground/70 font-semibold"
              >
                {course.name}
              </AppLink>
              <div className="text-muted-foreground line-clamp-2 text-sm">
                {course.description?.trim() || t('table.noDescription')}
              </div>
              <div className="text-muted-foreground text-xs">
                {t('table.structureSummary', {
                  chapters: stats.chapters,
                  activities: stats.activities,
                })}
              </div>
            </div>
          );
        },
      },
      {
        id: 'status',
        header: t('table.status'),
        meta: { label: t('table.status') },
        cell: ({ row }) => {
          const course = row.original;
          const ready = courseReadinessMap.get(course.course_uuid) ?? false;

          return (
            <div className="flex flex-wrap gap-2">
              <CourseStatusBadge status={course.public ? 'public' : 'private'} />
              <CourseStatusBadge status={ready ? 'ready' : 'needs-review'} />
              {courseNeedsAttention(course) ? <CourseStatusBadge status="attention" /> : null}
            </div>
          );
        },
      },
      {
        id: 'updated',
        accessorFn: (course) => course.update_date,
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
        cell: ({ row }) => <CourseRowActions course={row.original} />,
      },
    ],
    [
      headerCheckboxState,
      canDeleteCourse,
      canManageCourse,
      courseReadinessMap,
      selectedCourseUuidSet,
      t,
      toggleAllVisibleCourses,
    ],
  );

  const presets = [
    { key: 'all', label: t('presets.all') },
    { key: 'drafts', label: t('presets.drafts') },
    { key: 'published', label: t('presets.published') },
    { key: 'private', label: t('presets.private') },
    { key: 'recent', label: t('presets.recent') },
    { key: 'attention', label: t('presets.attention') },
  ];

  return (
    <div className="bg-background min-h-screen w-full px-4 py-6 lg:px-8">
      <div className="mb-6">
        <BreadCrumbs type="courses" />

        <div className="bg-card mt-4 rounded-xl border p-6 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl">
              <h1 className="text-foreground mt-2 text-4xl font-semibold tracking-tight">{t('header.title')}</h1>
              <p className="text-muted-foreground mt-3 text-sm leading-6">{t('header.description')}</p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                onClick={() => updateRoute({ view: viewMode === 'table' ? null : 'table' })}
              >
                {viewMode === 'table' ? <LayoutGrid className="size-4" /> : <List className="size-4" />}
                {viewMode === 'table' ? t('viewMode.cards') : t('viewMode.table')}
              </Button>
              {canCreateCourse ? (
                <Button
                  nativeButton={false}
                  render={<AppLink href={buildCourseCreationPath()} />}
                >
                  <Sparkles className="size-4" />
                  {t('guidedSetup')}
                </Button>
              ) : null}
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {summaryCards.map((card) => (
              <div
                key={card.label}
                className={courseWorkflowSummaryCardClass}
              >
                <div className="text-muted-foreground text-xs font-semibold tracking-[0.18em] uppercase">
                  {card.label}
                </div>
                <div className="text-foreground mt-2 text-3xl font-semibold">{card.value}</div>
                <div className="text-muted-foreground mt-1 text-sm">{card.detail}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {presets.map((item) => (
            <Button
              key={item.key}
              type="button"
              variant={preset === item.key ? 'default' : 'outline'}
              size="sm"
              onClick={() => updateRoute({ preset: item.key === 'all' ? null : item.key, page: '1' })}
            >
              {item.label}
            </Button>
          ))}
        </div>

        <div className="bg-card mt-4 flex flex-col gap-4 rounded-xl border p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <form
            className="flex w-full max-w-2xl items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              updateRoute({ q: searchInput.trim() || null, page: '1' });
            }}
          >
            <div className="relative flex-1">
              <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
              <Input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder={t('search.placeholder')}
                className="pl-9"
              />
            </div>
            <Button type="submit">{t('search.submit')}</Button>
            {hasQuery ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setSearchInput('');
                  updateRoute({ q: null, page: '1' });
                }}
              >
                <X className="mr-2 h-4 w-4" />
                {t('search.clear')}
              </Button>
            ) : null}
          </form>

          <div className="flex items-center gap-3">
            <label className="text-muted-foreground text-sm font-medium">{t('sort.label')}</label>
            <NativeSelect
              value={sortBy}
              onChange={(event) => updateRoute({ sort: event.target.value, page: '1' })}
              className="w-[180px]"
              aria-label={t('sortBy')}
            >
              <NativeSelectOption value="updated">{t('sort.updated')}</NativeSelectOption>
              <NativeSelectOption value="name">{t('sort.name')}</NativeSelectOption>
            </NativeSelect>
          </div>
        </div>

        <div className="text-muted-foreground mt-3 text-sm">
          {t('resultsSummary', { visible: courses.length, total: totalCourses })}
        </div>
      </div>

      {courses.length === 0 ? (
        <div className="bg-card rounded-xl border border-dashed py-12 shadow-sm">
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <h2 className="text-muted-foreground mb-2 text-2xl font-bold">{t('empty.title')}</h2>
              <p className="text-muted-foreground text-lg">
                {hasQuery ? t('empty.withQuery') : t('empty.withoutQuery')}
              </p>
              {canCreateCourse ? (
                <div className="mt-6 flex justify-center">
                  <Button
                    nativeButton={false}
                    render={<AppLink href={buildCourseCreationPath()} />}
                  >
                    <Sparkles className="size-4" />
                    {t('empty.createAction')}
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : viewMode === 'cards' ? (
        <div className="grid w-full grid-cols-1 gap-6 pb-8 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4">
          {courses.map((course) => (
            <div
              key={course.course_uuid}
              className="w-full"
            >
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
        <div className="bg-card rounded-xl border p-4 shadow-sm">
          <DataTable
            columns={columns}
            data={courses}
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
        <div className="flex items-center justify-between border-t py-6">
          <div className="text-muted-foreground text-sm">
            {t('pagination.page', { current: currentPage, total: totalPages })}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              disabled={currentPage <= 1}
              onClick={() => updateRoute({ page: String(Math.max(1, currentPage - 1)) })}
            >
              {t('pagination.previous')}
            </Button>
            <Button
              variant="outline"
              disabled={currentPage >= totalPages}
              onClick={() => updateRoute({ page: String(Math.min(totalPages, currentPage + 1)) })}
            >
              {t('pagination.next')}
            </Button>
          </div>
        </div>
      ) : null}

      <AlertDialog
        open={pendingBulkAction !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingBulkAction(null);
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
  );
};

function CourseRowActions({ course }: { course: ManageableCourse }) {
  const t = useTranslations('DashPage.CourseManagement.Dashboard');
  const router = useRouter();
  const { can } = useSession();
  const [isPending, startTransition] = useTransition();

  const canManageCourse =
    can(Resources.COURSE, Actions.MANAGE, Scopes.PLATFORM) ||
    Boolean(course.is_owner && can(Resources.COURSE, Actions.MANAGE, Scopes.OWN));
  const canDeleteCourse =
    can(Resources.COURSE, Actions.DELETE, Scopes.PLATFORM) ||
    Boolean(course.is_owner && can(Resources.COURSE, Actions.DELETE, Scopes.OWN));

  const handleDelete = () => {
    if (!canDeleteCourse) return;

    startTransition(() => {
      void (async () => {
        try {
          await deleteCourseFromBackend(course.course_uuid);
          toast.success(t('rowActions.deleteSuccess'));
          router.refresh();
        } catch {
          toast.error(t('rowActions.deleteError'));
        }
      })();
    });
  };

  const handleToggleVisibility = () => {
    if (!canManageCourse) return;

    startTransition(() => {
      void (async () => {
        try {
          await updateCourseAccess(
            course.course_uuid,
            { public: !course.public },
            {
              lastKnownUpdateDate: course.update_date,
            },
          );
          toast.success(course.public ? t('rowActions.visibilityMovedPrivate') : t('rowActions.visibilityPublished'));
          router.refresh();
        } catch {
          toast.error(t('rowActions.visibilityError'));
        }
      })();
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="icon"
            disabled={isPending}
          >
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
          <DropdownMenuItem
            onClick={handleDelete}
            variant="destructive"
          >
            <Trash2 className="size-4" />
            {t('rowActions.delete')}
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default CoursesHome;
