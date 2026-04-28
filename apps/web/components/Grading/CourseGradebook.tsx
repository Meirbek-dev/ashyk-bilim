'use client';

import { ExternalLink, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { courseGradebookQueryOptions } from '@/features/grading/queries/grading.query';
import GradebookToolbar from '@/components/Grading/GradebookToolbar';
import {
  ACTIVITY_PROGRESS_STATE_CLASSES,
  ACTIVITY_PROGRESS_STATE_LABELS,
  activityProgressNeedsTeacherAction,
  isActivityProgressOverdue,
  type ActivityProgressCell,
  type ActivityProgressState,
  type CourseGradebookResponse,
  type GradebookActivity,
  type GradebookStudent,
  type TeacherAction,
} from '@/types/grading';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
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

function cellKey(userId: number, activityId: number) {
  return `${userId}:${activityId}`;
}

function learnerName(student: GradebookStudent) {
  return `${student.first_name ?? ''} ${student.last_name ?? ''}`.trim() || student.username;
}

function activityKind(activity: GradebookActivity) {
  return activity.activity_type.replace('TYPE_', '').replaceAll('_', ' ');
}

function emptyCell(userId: number, activityId: number): ActivityProgressCell {
  return {
    user_id: userId,
    activity_id: activityId,
    state: 'NOT_STARTED',
    is_late: false,
    teacher_action_required: false,
    attempt_count: 0,
  };
}

function exportGradebookCsv(data: CourseGradebookResponse) {
  const cellMap = new Map(data.cells.map((cell) => [cellKey(cell.user_id, cell.activity_id), cell]));
  const header = ['Student', 'Email', ...data.activities.map((activity) => activity.name)];
  const rows = data.students.map((student) => [
    learnerName(student),
    student.email,
    ...data.activities.map((activity) => {
      const cell = cellMap.get(cellKey(student.id, activity.id));
      if (!cell) return 'Not started';
      const score = cell.score === null || cell.score === undefined ? '' : ` ${cell.score}%`;
      return `${ACTIVITY_PROGRESS_STATE_LABELS[cell.state]}${score}`;
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
  const { data, error, isError, isLoading, refetch } = useQuery(courseGradebookQueryOptions(courseUuid));
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ActivityProgressState | 'all'>('all');
  const [activityTypeFilter, setActivityTypeFilter] = useState('all');
  const [overdueFilter, setOverdueFilter] = useState<BooleanFilter>('all');
  const [needsGradingFilter, setNeedsGradingFilter] = useState<BooleanFilter>('all');
  const [notStartedFilter, setNotStartedFilter] = useState<BooleanFilter>('all');
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [activeCell, setActiveCell] = useState<ActivityProgressCell | null>(null);
  const [studentDrawerId, setStudentDrawerId] = useState<number | null>(null);
  const [activityDrawerId, setActivityDrawerId] = useState<number | null>(null);

  const cellMap = useMemo(
    () => new Map((data?.cells ?? []).map((cell) => [cellKey(cell.user_id, cell.activity_id), cell])),
    [data?.cells],
  );
  const studentMap = useMemo(
    () => new Map((data?.students ?? []).map((student) => [student.id, student])),
    [data?.students],
  );
  const activityMap = useMemo(
    () => new Map((data?.activities ?? []).map((activity) => [activity.id, activity])),
    [data?.activities],
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
        if (overdueFilter === 'yes' && !isActivityProgressOverdue(cell)) return false;
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
        return cell ? activityProgressNeedsTeacherAction(cell) : false;
      }).length,
    [cellMap, selectedKeys],
  );
  const selectedCells = useMemo(
    () =>
      Array.from(selectedKeys)
        .map((key) => cellMap.get(key))
        .filter((cell): cell is ActivityProgressCell => Boolean(cell)),
    [cellMap, selectedKeys],
  );

  const selectedStudent = studentDrawerId === null ? null : (studentMap.get(studentDrawerId) ?? null);
  const selectedActivity = activityDrawerId === null ? null : (activityMap.get(activityDrawerId) ?? null);

  if (isLoading) {
    return <div className="text-muted-foreground text-sm">Loading gradebook...</div>;
  }

  if (isError) {
    return (
      <div
        role="alert"
        className="text-destructive text-sm"
      >
        {error instanceof Error ? error.message : 'Failed to load gradebook.'}
      </div>
    );
  }

  if (!data) {
    return <div className="text-muted-foreground text-sm">Gradebook is unavailable.</div>;
  }

  const openCell = (cell: ActivityProgressCell) => {
    setActiveCell(cell);
    setStudentDrawerId(cell.user_id);
    setActivityDrawerId(null);
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryTile
          label="Learners"
          value={data.summary.student_count}
        />
        <SummaryTile
          label="Activities"
          value={data.summary.activity_count}
        />
        <SummaryTile
          label="Needs grading"
          value={data.summary.needs_grading_count}
          tone="amber"
        />
        <SummaryTile
          label="Overdue"
          value={data.summary.overdue_count}
          tone="rose"
        />
        <SummaryTile
          label="Not started"
          value={data.summary.not_started_count}
        />
      </div>

      <TeacherActionQueue
        actions={data.teacher_actions}
        onOpen={(action) => {
          const cell = cellMap.get(cellKey(action.user_id, action.activity_id));
          if (cell) openCell(cell);
        }}
      />

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
          <NativeSelect
            value="all"
            aria-label="Cohort"
          >
            <NativeSelectOption value="all">All cohorts</NativeSelectOption>
          </NativeSelect>
          <NativeSelect
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as ActivityProgressState | 'all')}
            aria-label="Status"
          >
            <NativeSelectOption value="all">All statuses</NativeSelectOption>
            {Object.entries(ACTIVITY_PROGRESS_STATE_LABELS).map(([state, label]) => (
              <NativeSelectOption
                key={state}
                value={state}
              >
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
              <NativeSelectOption
                key={type}
                value={type}
              >
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

        <GradebookToolbar
          activities={data.activities}
          students={data.students}
          selectedCells={selectedCells}
          selectedGradeableCount={selectedGradeableCount}
          notStartedOnly={notStartedFilter === 'yes'}
          onToggleNotStarted={() => setNotStartedFilter((value) => (value === 'yes' ? 'all' : 'yes'))}
          onGradeSelected={() => {
            const first = selectedCells.find(activityProgressNeedsTeacherAction);
            if (first) openCell(first);
          }}
          onExport={() => exportGradebookCsv(data)}
          onRefresh={() => void refetch()}
        />
      </div>

      <div className="border-border overflow-x-auto rounded-lg border">
        <Table className="min-w-[980px] table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="bg-background sticky left-0 z-10 w-64">Learner</TableHead>
              {visibleActivities.map((activity) => (
                <TableHead
                  key={activity.id}
                  className="w-44 align-bottom"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setStudentDrawerId(null);
                      setActivityDrawerId(activity.id);
                    }}
                    className="hover:text-primary block w-full text-left"
                  >
                    <span className="line-clamp-2 text-xs font-semibold">{activity.name}</span>
                    <span className="text-muted-foreground mt-1 block text-[11px]">{activityKind(activity)}</span>
                  </button>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleStudents.map((student) => (
              <TableRow key={student.id}>
                <TableCell className="bg-background sticky left-0 z-10 w-64">
                  <button
                    type="button"
                    className="block min-w-0 text-left"
                    onClick={() => {
                      setActivityDrawerId(null);
                      setStudentDrawerId(student.id);
                    }}
                  >
                    <span className="block truncate text-sm font-medium">{learnerName(student)}</span>
                    <span className="text-muted-foreground block truncate text-xs">{student.email}</span>
                  </button>
                </TableCell>
                {visibleActivities.map((activity) => {
                  const key = cellKey(student.id, activity.id);
                  const cell = cellMap.get(key) ?? emptyCell(student.id, activity.id);
                  const selected = selectedKeys.has(key);
                  return (
                    <TableCell
                      key={key}
                      className="h-24 align-top"
                    >
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => openCell(cell)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') openCell(cell);
                        }}
                        className={cn(
                          'h-full w-full cursor-pointer rounded-md border p-2 text-left transition-colors hover:bg-muted/60',
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
                          />
                          {cell.teacher_action_required ? <Badge variant="warning">Action</Badge> : null}
                        </div>
                        <div className="truncate text-xs font-semibold">
                          {ACTIVITY_PROGRESS_STATE_LABELS[cell.state]}
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-xs">
                          <span>
                            {cell.score === null || cell.score === undefined ? '--' : `${Math.round(cell.score)}%`}
                          </span>
                          {cell.is_late || isActivityProgressOverdue(cell) ? (
                            <span className="font-medium text-rose-700">Late</span>
                          ) : null}
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

      <Sheet
        open={Boolean(selectedStudent)}
        onOpenChange={(open) => !open && setStudentDrawerId(null)}
      >
        <SheetContent className="overflow-y-auto sm:max-w-xl">
          {selectedStudent ? (
            <StudentProgressDrawer
              student={selectedStudent}
              activities={data.activities}
              cellMap={cellMap}
              activeCell={activeCell}
              onSelectCell={setActiveCell}
            />
          ) : null}
        </SheetContent>
      </Sheet>

      <Sheet
        open={Boolean(selectedActivity)}
        onOpenChange={(open) => !open && setActivityDrawerId(null)}
      >
        <SheetContent className="overflow-y-auto sm:max-w-xl">
          {selectedActivity ? (
            <ActivityProgressDrawer
              activity={selectedActivity}
              students={data.students}
              cellMap={cellMap}
              onSelectCell={(cell) => {
                setActiveCell(cell);
                setStudentDrawerId(cell.user_id);
                setActivityDrawerId(null);
              }}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function TeacherActionQueue({
  actions,
  onOpen,
}: {
  actions: TeacherAction[];
  onOpen: (action: TeacherAction) => void;
}) {
  return (
    <div className="border-border rounded-lg border">
      <div className="flex items-center justify-between gap-3 border-b px-3 py-2">
        <div>
          <div className="text-sm font-semibold">Teacher action queue</div>
          <div className="text-muted-foreground text-xs">{actions.length} submissions need attention</div>
        </div>
        <Badge variant={actions.length ? 'warning' : 'secondary'}>{actions.length}</Badge>
      </div>
      {actions.length ? (
        <div className="divide-y">
          {actions.slice(0, 6).map((action) => (
            <button
              key={`${action.submission_uuid}:${action.user_id}:${action.activity_id}`}
              type="button"
              onClick={() => onOpen(action)}
              className="hover:bg-muted/60 flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{action.student_name}</span>
                <span className="text-muted-foreground block truncate text-xs">{action.activity_name}</span>
              </span>
              <span className="text-muted-foreground shrink-0 text-xs">{formatDate(action.submitted_at)}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="text-muted-foreground px-3 py-4 text-sm">No grading actions are waiting.</div>
      )}
    </div>
  );
}

function StudentProgressDrawer({
  student,
  activities,
  cellMap,
  activeCell,
  onSelectCell,
}: {
  student: GradebookStudent;
  activities: GradebookActivity[];
  cellMap: Map<string, ActivityProgressCell>;
  activeCell: ActivityProgressCell | null;
  onSelectCell: (cell: ActivityProgressCell) => void;
}) {
  const cells = activities.map((activity) => ({
    activity,
    cell: cellMap.get(cellKey(student.id, activity.id)) ?? emptyCell(student.id, activity.id),
  }));
  return (
    <>
      <SheetHeader>
        <SheetTitle>{learnerName(student)}</SheetTitle>
        <SheetDescription>{student.email}</SheetDescription>
      </SheetHeader>
      <div className="space-y-3 px-4 pb-4">
        {activeCell && activeCell.user_id === student.id ? <CellDetails cell={activeCell} /> : null}
        <div className="divide-y rounded-lg border">
          {cells.map(({ activity, cell }) => (
            <button
              key={activity.id}
              type="button"
              onClick={() => onSelectCell(cell)}
              className={cn(
                'flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted/60',
                activeCell?.activity_id === activity.id && 'bg-muted/70',
              )}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{activity.name}</span>
                <span className="text-muted-foreground block truncate text-xs">{activityKind(activity)}</span>
              </span>
              <ProgressBadge cell={cell} />
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

function ActivityProgressDrawer({
  activity,
  students,
  cellMap,
  onSelectCell,
}: {
  activity: GradebookActivity;
  students: GradebookStudent[];
  cellMap: Map<string, ActivityProgressCell>;
  onSelectCell: (cell: ActivityProgressCell) => void;
}) {
  return (
    <>
      <SheetHeader>
        <SheetTitle>{activity.name}</SheetTitle>
        <SheetDescription>
          {activityKind(activity)}
          {activity.due_at ? ` - due ${formatDate(activity.due_at)}` : ''}
        </SheetDescription>
      </SheetHeader>
      <div className="space-y-3 px-4 pb-4">
        <div className="divide-y rounded-lg border">
          {students.map((student) => {
            const cell = cellMap.get(cellKey(student.id, activity.id)) ?? emptyCell(student.id, activity.id);
            return (
              <button
                key={student.id}
                type="button"
                onClick={() => onSelectCell(cell)}
                className="hover:bg-muted/60 flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{learnerName(student)}</span>
                  <span className="text-muted-foreground block truncate text-xs">{student.email}</span>
                </span>
                <ProgressBadge cell={cell} />
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

function CellDetails({ cell }: { cell: ActivityProgressCell }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Activity history</div>
          <div className="text-muted-foreground text-xs">
            {ACTIVITY_PROGRESS_STATE_LABELS[cell.state]} - {cell.attempt_count} attempts
          </div>
        </div>
        {cell.latest_submission_uuid ? (
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<a href={`/dash/grading/submissions/${cell.latest_submission_uuid}`} />}
          >
            <ExternalLink className="size-4" />
            Open
          </Button>
        ) : null}
      </div>
      <div className="grid gap-2 text-sm sm:grid-cols-2">
        <HistoryItem
          label="Score"
          value={cell.score === null || cell.score === undefined ? '--' : `${cell.score}%`}
        />
        <HistoryItem
          label="Submitted"
          value={formatDate(cell.submitted_at)}
        />
        <HistoryItem
          label="Graded"
          value={formatDate(cell.graded_at)}
        />
        <HistoryItem
          label="Completed"
          value={formatDate(cell.completed_at)}
        />
      </div>
    </div>
  );
}

function ProgressBadge({ cell }: { cell: ActivityProgressCell }) {
  return (
    <span className="flex shrink-0 items-center gap-2">
      {cell.teacher_action_required ? <Badge variant="warning">Action</Badge> : null}
      <Badge variant="secondary">{ACTIVITY_PROGRESS_STATE_LABELS[cell.state]}</Badge>
    </span>
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
