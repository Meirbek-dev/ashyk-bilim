'use client';

import { Download, ExternalLink, Filter, MessageSquare, Search, SquarePen } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { courseGradebookQueryOptions } from '@/features/grading/queries/grading.query';
import type { ActivityProgressState, GradebookCell, GradebookResponse } from '@/types/grading';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface CourseGradebookProps {
  courseUuid: string;
}

type BooleanFilter = 'all' | 'yes';

const stateLabels: Record<ActivityProgressState, string> = {
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'In progress',
  SUBMITTED: 'Submitted',
  NEEDS_GRADING: 'Needs grading',
  RETURNED: 'Returned',
  GRADED: 'Graded',
  PASSED: 'Passed',
  FAILED: 'Failed',
  COMPLETED: 'Completed',
};

const stateClasses: Record<ActivityProgressState, string> = {
  NOT_STARTED: 'border-slate-200 bg-slate-50 text-slate-700',
  IN_PROGRESS: 'border-blue-200 bg-blue-50 text-blue-700',
  SUBMITTED: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  NEEDS_GRADING: 'border-amber-200 bg-amber-50 text-amber-800',
  RETURNED: 'border-violet-200 bg-violet-50 text-violet-800',
  GRADED: 'border-teal-200 bg-teal-50 text-teal-800',
  PASSED: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  FAILED: 'border-rose-200 bg-rose-50 text-rose-800',
  COMPLETED: 'border-emerald-200 bg-emerald-50 text-emerald-800',
};

function isOverdue(cell: GradebookCell) {
  if (!cell.due_at) return false;
  if (cell.state === 'PASSED' || cell.state === 'COMPLETED') return false;
  return new Date(cell.due_at).getTime() < Date.now();
}

function cellKey(userId: number, activityId: number) {
  return `${userId}:${activityId}`;
}

function exportGradebookCsv(data: GradebookResponse) {
  const cellMap = new Map(data.cells.map((cell) => [cellKey(cell.user_id, cell.activity_id), cell]));
  const header = ['Student', 'Email', ...data.activities.map((activity) => activity.name)];
  const rows = data.students.map((student) => [
    `${student.last_name ?? ''} ${student.first_name ?? ''}`.trim() || student.username,
    student.email,
    ...data.activities.map((activity) => {
      const cell = cellMap.get(cellKey(student.id, activity.id));
      if (!cell) return 'Not started';
      const score = cell.score === null || cell.score === undefined ? '' : ` ${cell.score}%`;
      return `${stateLabels[cell.state]}${score}`;
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

export default function CourseGradebook({ courseUuid }: CourseGradebookProps) {
  const { data, isLoading } = useQuery(courseGradebookQueryOptions(courseUuid));
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ActivityProgressState | 'all'>('all');
  const [activityTypeFilter, setActivityTypeFilter] = useState('all');
  const [overdueFilter, setOverdueFilter] = useState<BooleanFilter>('all');
  const [needsGradingFilter, setNeedsGradingFilter] = useState<BooleanFilter>('all');
  const [notStartedFilter, setNotStartedFilter] = useState<BooleanFilter>('all');
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [activeCell, setActiveCell] = useState<GradebookCell | null>(null);

  const cellMap = useMemo(
    () => new Map((data?.cells ?? []).map((cell) => [cellKey(cell.user_id, cell.activity_id), cell])),
    [data?.cells],
  );
  const activityTypes = useMemo(
    () => Array.from(new Set((data?.activities ?? []).map((activity) => activity.activity_type))).sort(),
    [data?.activities],
  );
  const visibleActivities = useMemo(
    () =>
      (data?.activities ?? []).filter(
        (activity) => activityTypeFilter === 'all' || activity.activity_type === activityTypeFilter,
      ),
    [activityTypeFilter, data?.activities],
  );
  const visibleStudents = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return (data?.students ?? []).filter((student) => {
      const name = `${student.first_name ?? ''} ${student.last_name ?? ''} ${student.username} ${student.email}`
        .trim()
        .toLowerCase();
      if (normalizedSearch && !name.includes(normalizedSearch)) return false;
      return visibleActivities.some((activity) => {
        const cell = cellMap.get(cellKey(student.id, activity.id));
        if (!cell) return notStartedFilter === 'all' || notStartedFilter === 'yes';
        if (statusFilter !== 'all' && cell.state !== statusFilter) return false;
        if (overdueFilter === 'yes' && !isOverdue(cell)) return false;
        if (needsGradingFilter === 'yes' && !cell.teacher_action_required) return false;
        if (notStartedFilter === 'yes' && cell.state !== 'NOT_STARTED') return false;
        return true;
      });
    });
  }, [
    cellMap,
    needsGradingFilter,
    notStartedFilter,
    overdueFilter,
    search,
    statusFilter,
    visibleActivities,
    data?.students,
  ]);

  const selectedGradeableCount = useMemo(
    () =>
      Array.from(selectedKeys).filter((key) => {
        const cell = cellMap.get(key);
        return cell?.teacher_action_required && cell.latest_submission_uuid;
      }).length,
    [cellMap, selectedKeys],
  );

  if (isLoading) {
    return <div className="text-muted-foreground text-sm">Loading gradebook...</div>;
  }

  if (!data) {
    return <div className="text-muted-foreground text-sm">Gradebook is unavailable.</div>;
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryTile label="Learners" value={data.summary.student_count} />
        <SummaryTile label="Activities" value={data.summary.activity_count} />
        <SummaryTile label="Needs grading" value={data.summary.needs_grading_count} tone="amber" />
        <SummaryTile label="Overdue" value={data.summary.overdue_count} tone="rose" />
        <SummaryTile label="Not started" value={data.summary.not_started_count} />
      </div>

      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="grid min-w-0 flex-1 gap-2 md:grid-cols-3 xl:grid-cols-6">
          <div className="relative md:col-span-2 xl:col-span-1">
            <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search learner"
              className="pl-9"
            />
          </div>
          <NativeSelect value="all" aria-label="Cohort">
            <NativeSelectOption value="all">All cohorts</NativeSelectOption>
          </NativeSelect>
          <NativeSelect
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as ActivityProgressState | 'all')}
            aria-label="Status"
          >
            <NativeSelectOption value="all">All statuses</NativeSelectOption>
            {Object.entries(stateLabels).map(([state, label]) => (
              <NativeSelectOption key={state} value={state}>
                {label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <NativeSelect
            value={activityTypeFilter}
            onChange={(event) => setActivityTypeFilter(event.target.value)}
            aria-label="Activity type"
          >
            <NativeSelectOption value="all">All activity types</NativeSelectOption>
            {activityTypes.map((type) => (
              <NativeSelectOption key={type} value={type}>
                {type.replace('TYPE_', '').replaceAll('_', ' ')}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <NativeSelect
            value={overdueFilter}
            onChange={(event) => setOverdueFilter(event.target.value as BooleanFilter)}
            aria-label="Overdue"
          >
            <NativeSelectOption value="all">Any due state</NativeSelectOption>
            <NativeSelectOption value="yes">Overdue only</NativeSelectOption>
          </NativeSelect>
          <NativeSelect
            value={needsGradingFilter}
            onChange={(event) => setNeedsGradingFilter(event.target.value as BooleanFilter)}
            aria-label="Needs grading"
          >
            <NativeSelectOption value="all">Any action</NativeSelectOption>
            <NativeSelectOption value="yes">Needs grading</NativeSelectOption>
          </NativeSelect>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setNotStartedFilter((value) => (value === 'yes' ? 'all' : 'yes'))}
          >
            <Filter className="size-4" />
            Not started
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={selectedGradeableCount === 0}
            onClick={() => {
              const first = Array.from(selectedKeys)
                .map((key) => cellMap.get(key))
                .find((cell) => cell?.teacher_action_required && cell.latest_submission_uuid);
              if (first) setActiveCell(first);
            }}
          >
            <SquarePen className="size-4" />
            Grade selected
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportGradebookCsv(data)}>
            <Download className="size-4" />
            Export
          </Button>
          <Button variant="outline" size="sm" disabled>
            <MessageSquare className="size-4" />
            Message
          </Button>
        </div>
      </div>

      <div className="border-border overflow-x-auto rounded-lg border">
        <Table className="min-w-[980px] table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="bg-background sticky left-0 z-10 w-64">Learner</TableHead>
              {visibleActivities.map((activity) => (
                <TableHead key={activity.id} className="w-44 align-bottom">
                  <div className="line-clamp-2 text-xs font-semibold">{activity.name}</div>
                  <div className="text-muted-foreground mt-1 text-[11px]">
                    {activity.activity_type.replace('TYPE_', '').replaceAll('_', ' ')}
                  </div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleStudents.map((student) => (
              <TableRow key={student.id}>
                <TableCell className="bg-background sticky left-0 z-10 w-64">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {`${student.first_name ?? ''} ${student.last_name ?? ''}`.trim() || student.username}
                    </div>
                    <div className="text-muted-foreground truncate text-xs">{student.email}</div>
                  </div>
                </TableCell>
                {visibleActivities.map((activity) => {
                  const key = cellKey(student.id, activity.id);
                  const cell = cellMap.get(key) ?? {
                    user_id: student.id,
                    activity_id: activity.id,
                    state: 'NOT_STARTED' as ActivityProgressState,
                    is_late: false,
                    teacher_action_required: false,
                    attempt_count: 0,
                  };
                  const selected = selectedKeys.has(key);
                  return (
                    <TableCell key={key} className="h-24 align-top">
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setActiveCell(cell)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') setActiveCell(cell);
                        }}
                        className={cn(
                          'h-full w-full cursor-pointer rounded-md border p-2 text-left transition-colors hover:bg-muted/60',
                          stateClasses[cell.state],
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
                          />
                          {cell.teacher_action_required ? <Badge variant="warning">Action</Badge> : null}
                        </div>
                        <div className="truncate text-xs font-semibold">{stateLabels[cell.state]}</div>
                        <div className="mt-1 flex items-center gap-2 text-xs">
                          <span>
                            {cell.score === null || cell.score === undefined ? '--' : `${Math.round(cell.score)}%`}
                          </span>
                          {cell.is_late || isOverdue(cell) ? <span className="font-medium text-rose-700">Late</span> : null}
                        </div>
                        <div className="mt-1 text-[11px] opacity-80">{cell.attempt_count} attempts</div>
                      </div>
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {activeCell ? (
        <div className="border-border rounded-lg border p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Activity history</div>
              <div className="text-muted-foreground text-xs">
                {stateLabels[activeCell.state]} · {activeCell.attempt_count} attempts
              </div>
            </div>
            {activeCell.latest_submission_uuid ? (
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={<a href={`/dash/grading/submissions/${activeCell.latest_submission_uuid}`} />}
              >
                <ExternalLink className="size-4" />
                Open
              </Button>
            ) : null}
          </div>
          <div className="grid gap-2 text-sm sm:grid-cols-4">
            <HistoryItem
              label="Score"
              value={activeCell.score === null || activeCell.score === undefined ? '--' : `${activeCell.score}%`}
            />
            <HistoryItem label="Submitted" value={formatDate(activeCell.submitted_at)} />
            <HistoryItem label="Graded" value={formatDate(activeCell.graded_at)} />
            <HistoryItem label="Completed" value={formatDate(activeCell.completed_at)} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SummaryTile({ label, value, tone = 'default' }: { label: string; value: number; tone?: 'default' | 'amber' | 'rose' }) {
  return (
    <div
      className={cn(
        'border-border rounded-lg border p-3',
        tone === 'amber' && 'border-amber-200 bg-amber-50/60',
        tone === 'rose' && 'border-rose-200 bg-rose-50/60',
      )}
    >
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function HistoryItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

function formatDate(value?: string | null) {
  if (!value) return '--';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
