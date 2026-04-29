'use client';

import { Download, Filter, RefreshCcw, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

import { courseGradebookQueryOptions } from '@/features/grading/queries/grading.query';
import {
  ACTIVITY_PROGRESS_STATE_CLASSES,
  buildGradebookRollups,
  emptyGradebookCell,
  filterGradebookStudents,
  formatGradebookStateKey,
  gradebookCellKey,
  gradebookLearnerName,
  GRADEBOOK_SAVED_FILTERS,
  type ActivityProgressCell,
  type CourseGradebookResponse,
  type GradebookFilters,
  type GradebookRollupKind,
  type GradebookSavedFilterId,
} from '@/features/grading/domain';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface CourseGradebookCommandCenterProps {
  courseUuid: string;
}

const ROLLUP_KINDS: GradebookRollupKind[] = ['assignment_group', 'cohort', 'learner', 'activity'];

function storageKey(courseUuid: string) {
  return `gradebook:v2:${courseUuid}:filters`;
}

export default function CourseGradebookCommandCenter({ courseUuid }: CourseGradebookCommandCenterProps) {
  const t = useTranslations('Features.Grading.Gradebook');
  const router = useRouter();
  const { data, error, isError, isLoading, refetch } = useQuery(courseGradebookQueryOptions(courseUuid));
  const [filters, setFilters] = useState<GradebookFilters>({
    savedFilter: 'needs_grading',
    search: '',
    activityType: 'all',
  });
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey(courseUuid));
      if (stored) setFilters((current) => ({ ...current, ...JSON.parse(stored) }));
    } catch {
      // Local storage is an enhancement; invalid saved state should not block the gradebook.
    }
  }, [courseUuid]);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey(courseUuid), JSON.stringify(filters));
    } catch {
      // Ignore storage failures in private browsing or restricted contexts.
    }
  }, [courseUuid, filters]);

  const cellMap = useMemo(
    () => new Map((data?.cells ?? []).map((cell) => [gradebookCellKey(cell.user_id, cell.activity_id), cell])),
    [data?.cells],
  );
  const activityTypes = useMemo(
    () => Array.from(new Set((data?.activities ?? []).map((activity) => activity.activity_type))).sort(),
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
      Array.from(selectedKeys)
        .map((key) => cellMap.get(key))
        .filter((cell): cell is ActivityProgressCell => Boolean(cell)),
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
      <CommandHeader
        data={data}
        selectedCount={selectedCells.length}
        onExport={() => exportGradebookCsv(data, t)}
        onRefresh={() => void refetch()}
      />

      <RollupPanel data={data} />

      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="grid min-w-0 flex-1 gap-2 md:grid-cols-3 xl:grid-cols-5">
          <div className="relative md:col-span-2 xl:col-span-1">
            <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              value={filters.search}
              onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
              placeholder={t('searchLearner')}
              className="pl-9"
            />
          </div>
          <NativeSelect
            value={filters.activityType}
            onChange={(event) => setFilters((current) => ({ ...current, activityType: event.target.value }))}
            aria-label={t('activityType')}
          >
            <NativeSelectOption value="all">{t('allActivityTypes')}</NativeSelectOption>
            {activityTypes.map((type) => (
              <NativeSelectOption
                key={type}
                value={type}
              >
                {labelActivityType(t, type)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="text-muted-foreground size-4" />
          {GRADEBOOK_SAVED_FILTERS.map((filter) => (
            <Button
              key={filter}
              type="button"
              variant={filters.savedFilter === filter ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilters((current) => ({ ...current, savedFilter: filter }))}
            >
              {t(`savedFilters.${filter}`)}
            </Button>
          ))}
        </div>
      </div>

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
                    <TableCell
                      key={key}
                      className="h-24 align-top"
                    >
                      <div
                        role={cell.latest_submission_uuid ? 'button' : undefined}
                        tabIndex={cell.latest_submission_uuid ? 0 : undefined}
                        aria-disabled={!cell.latest_submission_uuid}
                        onClick={() => openCell(cell)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') openCell(cell);
                        }}
                        className={cn(
                          'h-full w-full rounded-md border p-2 text-left transition-colors',
                          cell.latest_submission_uuid ? 'cursor-pointer hover:bg-muted/60' : 'cursor-default',
                          ACTIVITY_PROGRESS_STATE_CLASSES[cell.state],
                          selected && 'ring-ring ring-2',
                        )}
                      >
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <Checkbox
                            checked={selected}
                            onCheckedChange={(checked) => {
                              setSelectedKeys((current) => {
                                const next = new Set(current);
                                if (checked === true) next.add(key);
                                else next.delete(key);
                                return next;
                              });
                            }}
                            onClick={(event) => event.stopPropagation()}
                            aria-label={t('selectCell')}
                          />
                          {cell.teacher_action_required ? <Badge variant="warning">{t('actionRequired')}</Badge> : null}
                        </div>
                        <div className="truncate text-xs font-semibold">
                          {t(`states.${formatGradebookStateKey(cell.state)}`)}
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-xs">
                          <span>
                            {cell.score === null || cell.score === undefined ? '--' : `${Math.round(cell.score)}%`}
                          </span>
                          {cell.is_late ? <span className="font-medium text-rose-700">{t('late')}</span> : null}
                        </div>
                        <div className="mt-1 text-[11px] opacity-80">
                          {t('attempts', { count: cell.attempt_count })}
                        </div>
                      </div>
                    </TableCell>
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

function CommandHeader({
  data,
  selectedCount,
  onExport,
  onRefresh,
}: {
  data: CourseGradebookResponse;
  selectedCount: number;
  onExport: () => void;
  onRefresh: () => void;
}) {
  const t = useTranslations('Features.Grading.Gradebook');
  return (
    <div className="flex flex-col gap-4 border-b pb-4 xl:flex-row xl:items-end xl:justify-between">
      <div>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-muted-foreground text-sm">{data.course_name}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-5">
        <SummaryTile
          label={t('summary.learners')}
          value={data.summary.student_count}
        />
        <SummaryTile
          label={t('summary.activities')}
          value={data.summary.activity_count}
        />
        <SummaryTile
          label={t('summary.needsGrading')}
          value={data.summary.needs_grading_count}
          tone="amber"
        />
        <SummaryTile
          label={t('summary.overdue')}
          value={data.summary.overdue_count}
          tone="rose"
        />
        <SummaryTile
          label={t('summary.selected')}
          value={selectedCount}
        />
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRefresh}
        >
          <RefreshCcw className="size-4" />
          {t('refresh')}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onExport}
        >
          <Download className="size-4" />
          {t('export')}
        </Button>
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

function SummaryTile({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number;
  tone?: 'default' | 'amber' | 'rose';
}) {
  return (
    <div
      className={cn(
        'border-border rounded-md border px-3 py-2',
        tone === 'amber' && 'border-amber-200 bg-amber-50/60',
        tone === 'rose' && 'border-rose-200 bg-rose-50/60',
      )}
    >
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
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
    .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `course-gradebook-${data.course_uuid}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function labelActivityType(t: (key: string) => string, type: string) {
  const key = type.toLowerCase();
  if (key === 'type_assignment' || key === 'assignment') return t('activityTypes.assignment');
  if (key === 'type_exam' || key === 'exam') return t('activityTypes.exam');
  if (key === 'type_code_challenge' || key === 'code_challenge') return t('activityTypes.codeChallenge');
  if (key === 'type_dynamic' || key === 'quiz') return t('activityTypes.quiz');
  if (key === 'type_form' || key === 'form') return t('activityTypes.form');
  if (key === 'type_file' || key === 'file') return t('activityTypes.file');
  return type.replace('TYPE_', '').replaceAll('_', ' ');
}

function labelRollupRow(t: (key: string) => string, kind: GradebookRollupKind, label: string) {
  if (kind === 'assignment_group') return labelActivityType(t, label);
  if (kind === 'cohort' && label === '__default_cohort__') return t('defaultCohort');
  return label;
}
