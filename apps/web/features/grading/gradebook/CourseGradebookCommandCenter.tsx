'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { courseGradebookQueryOptions } from '@/features/grading/queries/grading.query';
import {
  buildGradebookRollups,
  emptyGradebookCell,
  filterGradebookStudents,
  formatGradebookStateKey,
  gradebookCellKey,
  gradebookLearnerName,
} from '@/features/grading/domain';
import type {
  ActivityProgressCell,
  CourseGradebookResponse,
  GradebookFilters,
  GradebookRollupKind,
} from '@/features/grading/domain';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import GradebookToolbar, { labelActivityType } from './GradebookToolbar';
import GradebookActivityCell, { progressStateLabelKey } from './GradebookActivityCell';

interface CourseGradebookCommandCenterProps {
  courseUuid: string;
}

const ROLLUP_KINDS: GradebookRollupKind[] = ['assignment_group', 'cohort', 'learner', 'activity'];

export default function CourseGradebookCommandCenter({ courseUuid }: CourseGradebookCommandCenterProps) {
  const t = useTranslations('Features.Grading.Gradebook');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data, error, isError, isLoading, refetch } = useQuery(courseGradebookQueryOptions(courseUuid));
  const [filters, setFilters] = useState<GradebookFilters>({
    savedFilter: normalizeSavedFilter(searchParams.get('filter')),
    search: searchParams.get('search') ?? '',
    activityType: searchParams.get('activityType') ?? 'all',
  });
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    setFilters((prev) => {
      const nextSavedFilter = normalizeSavedFilter(searchParams.get('filter'));
      const nextSearch = searchParams.get('search') ?? '';
      const nextActivityType = searchParams.get('activityType') ?? 'all';

      if (
        prev.savedFilter === nextSavedFilter &&
        prev.search === nextSearch &&
        prev.activityType === nextActivityType
      ) {
        return prev;
      }

      return {
        savedFilter: nextSavedFilter,
        search: nextSearch,
        activityType: nextActivityType,
      };
    });
  }, [searchParams]);

  const handleFiltersChange = useCallback(
    (newFilters: GradebookFilters) => {
      setFilters(newFilters);
      const params = new URLSearchParams(searchParams.toString());
      setParam(params, 'filter', newFilters.savedFilter === 'needs_grading' ? '' : newFilters.savedFilter);
      setParam(params, 'search', newFilters.search);
      setParam(params, 'activityType', newFilters.activityType === 'all' ? '' : newFilters.activityType);
      const next = params.toString();
      const current = searchParams.toString();
      if (next !== current) {
        router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
      }
    },
    [pathname, router, searchParams],
  );

  const cellMap = useMemo(
    () => new Map((data?.cells ?? []).map((cell) => [gradebookCellKey(cell.user_id, cell.activity_id), cell])),
    [data?.cells],
  );
  const activityTypes = useMemo(
    () => [...new Set((data?.activities ?? []).map((activity) => activity.activity_type))].toSorted(),
    [data?.activities],
  );
  const visibleActivities = useMemo(
    () =>
      (data?.activities ?? []).filter(
        (activity) => filters.activityType === 'all' || activity.activity_type === filters.activityType,
      ),
    [data?.activities, filters.activityType],
  );
  const visibleStudents = useMemo(() => {
    if (!data) return [];
    return filterGradebookStudents(data, visibleActivities, cellMap, filters);
  }, [cellMap, data, filters, visibleActivities]);

  const selectedCells = useMemo(
    () =>
      [...selectedKeys].map((key) => cellMap.get(key)).filter((cell): cell is ActivityProgressCell => Boolean(cell)),
    [cellMap, selectedKeys],
  );

  if (isLoading) return <div className="text-muted-foreground text-sm">{t('loading')}</div>;

  if (isError) {
    return (
      <div
        role="alert"
        className="text-destructive text-sm"
      >
        {error instanceof Error ? error.message : t('loadError')}
      </div>
    );
  }

  if (!data) return <div className="text-muted-foreground text-sm">{t('unavailable')}</div>;

  const openCell = (cell: ActivityProgressCell) => {
    if (!cell.latest_submission_uuid) return;
    const activity = data.activities.find((item) => item.id === cell.activity_id);
    if (!activity?.activity_uuid) return;
    const cleanCourse = courseUuid.replace(/^course_/, '');
    const cleanActivity = activity.activity_uuid.replace(/^activity_/, '');
    router.push(
      `/dash/courses/${cleanCourse}/activity/${cleanActivity}/review?submission=${cell.latest_submission_uuid}`,
    );
  };

  return (
    <div className="space-y-5">
      <GradebookToolbar
        data={data}
        filters={filters}
        activityTypes={activityTypes}
        selectedCount={selectedCells.length}
        onFiltersChange={handleFiltersChange}
        onExport={() => exportGradebookCsv(data, t)}
        onRefresh={() => void refetch()}
      />

      <RollupPanel data={data} />

      <div className="border-border overflow-x-auto rounded-lg border">
        <Table className="min-w-[980px] table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="bg-background sticky left-0 z-10 w-64">{t('learner')}</TableHead>
              {visibleActivities.map((activity) => (
                <TableHead
                  key={activity.id}
                  className="w-44 align-bottom"
                >
                  <span className="line-clamp-2 text-xs font-semibold">{activity.name}</span>
                  <span className="text-muted-foreground mt-1 block text-[11px]">
                    {labelActivityType(t, activity.activity_type)}
                  </span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleStudents.map((student) => (
              <TableRow key={student.id}>
                <TableCell className="bg-background sticky left-0 z-10 w-64">
                  <span className="block truncate text-sm font-medium">{gradebookLearnerName(student)}</span>
                  <span className="text-muted-foreground block truncate text-xs">{student.email}</span>
                </TableCell>
                {visibleActivities.map((activity) => {
                  const key = gradebookCellKey(student.id, activity.id);
                  const cell = cellMap.get(key) ?? emptyGradebookCell(student.id, activity.id);
                  const selected = selectedKeys.has(key);
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
                      onSelect={(checked) => {
                        setSelectedKeys((current) => {
                          const next = new Set(current);
                          if (checked) next.add(key);
                          else next.delete(key);
                          return next;
                        });
                      }}
                    />
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function RollupPanel({ data }: { data: CourseGradebookResponse }) {
  const t = useTranslations('Features.Grading.Gradebook');
  const [kind, setKind] = useState<GradebookRollupKind>('assignment_group');
  const rows = useMemo(() => buildGradebookRollups(data, kind), [data, kind]);

  return (
    <Tabs
      value={kind}
      onValueChange={(value) => setKind(value as GradebookRollupKind)}
      className="rounded-lg border p-3"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-sm font-semibold">{t('rollups.title')}</h2>
          <p className="text-muted-foreground text-xs">{t('rollups.description')}</p>
        </div>
        <TabsList>
          {ROLLUP_KINDS.map((item) => (
            <TabsTrigger
              key={item}
              value={item}
            >
              {t(`rollups.${item}`)}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {ROLLUP_KINDS.map((item) => (
        <TabsContent
          key={item}
          value={item}
          className="mt-3"
        >
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {rows.map((row) => (
              <div
                key={row.id}
                className="rounded-md border p-3"
              >
                <div className="truncate text-sm font-semibold">{labelRollupRow(t, kind, row.label)}</div>
                <div className="text-muted-foreground mt-1 text-xs">
                  {row.averageScore === null
                    ? t('noScore')
                    : t('averageScore', { score: Math.round(row.averageScore) })}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <RollupMetric
                    label={t('summary.needsGrading')}
                    value={row.needsGrading}
                  />
                  <RollupMetric
                    label={t('summary.overdue')}
                    value={row.overdue}
                  />
                  <RollupMetric
                    label={t('summary.notStarted')}
                    value={row.notStarted}
                  />
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      ))}
    </Tabs>
  );
}

function RollupMetric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="font-semibold">{value}</div>
      <div className="text-muted-foreground truncate">{label}</div>
    </div>
  );
}

function exportGradebookCsv(
  data: CourseGradebookResponse,
  t: (key: string, values?: Record<string, string | number>) => string,
) {
  const cellMap = new Map(data.cells.map((cell) => [gradebookCellKey(cell.user_id, cell.activity_id), cell]));
  const header = [t('learner'), t('email'), ...data.activities.map((activity) => activity.name)];
  const rows = data.students.map((student) => [
    gradebookLearnerName(student),
    student.email,
    ...data.activities.map((activity) => {
      const cell = cellMap.get(gradebookCellKey(student.id, activity.id));
      if (!cell) return t('states.not_started');
      const score = cell.score === null || cell.score === undefined ? '' : ` ${cell.score}%`;
      return `${t(`states.${formatGradebookStateKey(cell.state)}`)}${score}`;
    }),
  ]);
  const csv = [header, ...rows]
    .map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `course-gradebook-${data.course_uuid}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function labelRollupRow(t: (key: string) => string, kind: GradebookRollupKind, label: string) {
  if (kind === 'assignment_group') return labelActivityType(t, label);
  if (kind === 'cohort' && label === '__default_cohort__') return t('defaultCohort');
  return label;
}

function setParam(params: URLSearchParams, key: string, value: string) {
  if (value) params.set(key, value);
  else params.delete(key);
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
    return value;
  }
  return 'needs_grading';
}
