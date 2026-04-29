'use client';

import {
  AlertTriangle,
  Archive,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  Eye,
  FileUp,
  ListTodo,
  LoaderCircle,
  Send,
  TextCursorInput,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import type { ElementType } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import {
  ASSIGNMENT_STATUS_LABELS,
  buildAssignmentStudioViewModel,
  getAssignmentTotalPoints,
  normalizeAssignmentTasks,
  pointsToPercent,
  type AssignmentRead,
  type AssignmentTaskRead,
  type AssignmentTaskType,
} from '@/features/assignments/domain';
import { getTaskTypeEditor } from './task-editors/registry';
import { patchEditorValue, taskToEditorValue, type AssignmentTaskEditorValue } from './task-editors/types';
import { AssignmentProvider, useAssignments } from '@components/Contexts/Assignments/AssignmentContext';
import {
  archiveAssignment,
  createAssignmentTask,
  deleteAssignmentTask,
  publishAssignment,
  updateAssignment,
  updateAssignmentTask,
} from '@services/courses/assignments';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import BreadCrumbs from '@components/Dashboard/Misc/BreadCrumbs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import Link from '@components/ui/AppLink';
import { cn } from '@/lib/utils';

interface AssignmentStudioRouteProps {
  assignmentUuid: string;
}

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

const TASK_ICONS: Record<AssignmentTaskType, ElementType> = {
  FILE_SUBMISSION: FileUp,
  QUIZ: ListTodo,
  FORM: TextCursorInput,
  OTHER: BookOpen,
};

export default function AssignmentStudioRoute({ assignmentUuid }: AssignmentStudioRouteProps) {
  return (
    <AssignmentProvider assignment_uuid={`assignment_${assignmentUuid}`}>
      <AssignmentStudioShell assignmentUuid={`assignment_${assignmentUuid}`} />
    </AssignmentProvider>
  );
}

function AssignmentStudioShell({ assignmentUuid }: { assignmentUuid: string }) {
  const assignments = useAssignments();
  const assignment = assignments.assignment_object as AssignmentRead | null;
  const tasks = useMemo(() => normalizeAssignmentTasks(assignments.assignment_tasks), [assignments.assignment_tasks]);
  const [selectedTaskUuid, setSelectedTaskUuid] = useState<string | null>(tasks[0]?.assignment_task_uuid ?? null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!selectedTaskUuid && tasks[0]) setSelectedTaskUuid(tasks[0].assignment_task_uuid);
    if (selectedTaskUuid && tasks.length > 0 && !tasks.some((task) => task.assignment_task_uuid === selectedTaskUuid)) {
      setSelectedTaskUuid(tasks[0]?.assignment_task_uuid ?? null);
    }
  }, [selectedTaskUuid, tasks]);

  if (!assignment) {
    return null;
  }

  const viewModel = buildAssignmentStudioViewModel(assignment, tasks);
  const selectedTask = tasks.find((task) => task.assignment_task_uuid === selectedTaskUuid) ?? tasks[0] ?? null;
  const publishIssues = getPublishIssues(assignment, tasks);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.assignments.detail(assignmentUuid) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.assignments.tasks(assignmentUuid) }),
    ]);
  };

  return (
    <div className="bg-background min-h-screen">
      <AssignmentStudioTopBar
        assignment={assignment}
        courseUuid={assignments.course_object?.course_uuid ?? assignment.course_uuid ?? null}
        activityUuid={assignments.activity_object?.activity_uuid ?? assignment.activity_uuid ?? null}
        publishIssues={publishIssues}
        onPublished={refresh}
      />

      <main className="grid min-h-[calc(100vh-88px)] grid-cols-1 gap-0 lg:grid-cols-[18rem_minmax(0,1fr)] xl:grid-cols-[18rem_minmax(0,1fr)_22rem]">
        <TaskOutlineRail
          assignmentUuid={assignmentUuid}
          tasks={tasks}
          selectedTaskUuid={selectedTask?.assignment_task_uuid ?? null}
          totalPoints={viewModel.totalPoints}
          taskIssues={getTaskIssues(tasks)}
          onSelectTask={setSelectedTaskUuid}
          onCreated={async (taskUuid) => {
            setSelectedTaskUuid(taskUuid);
            await refresh();
          }}
        />

        <section className="min-w-0 border-t lg:border-t-0 lg:border-l">
          <UnifiedTaskEditor
            assignmentUuid={assignmentUuid}
            task={selectedTask}
            totalPoints={viewModel.totalPoints}
            disabled={!viewModel.isEditable}
            onDeleted={async () => {
              setSelectedTaskUuid(null);
              await refresh();
            }}
            onSaved={refresh}
          />
        </section>

        <aside className="border-t xl:border-t-0 xl:border-l">
          <AssignmentPolicyInspector
            assignment={assignment}
            tasks={tasks}
            publishIssues={publishIssues}
            onSaved={refresh}
          />
        </aside>
      </main>
    </div>
  );
}

function AssignmentStudioTopBar({
  assignment,
  courseUuid,
  activityUuid,
  publishIssues,
  onPublished,
}: {
  assignment: AssignmentRead;
  courseUuid: string | null;
  activityUuid: string | null;
  publishIssues: string[];
  onPublished: () => Promise<void>;
}) {
  const [isPending, startTransition] = useTransition();
  const canPublish = assignment.status === 'DRAFT' || assignment.status === 'SCHEDULED';
  const canArchive = assignment.status !== 'ARCHIVED';
  const previewHref =
    courseUuid && activityUuid
      ? `/course/${courseUuid.replace('course_', '')}/activity/${activityUuid.replace('activity_', '')}`
      : null;

  const handlePublish = () => {
    if (publishIssues.length > 0) {
      toast.error('Fix validation issues before publishing.');
      return;
    }

    startTransition(async () => {
      try {
        await publishAssignment(assignment.assignment_uuid);
        toast.success('Assignment published');
        await onPublished();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to publish assignment');
      }
    });
  };

  const handleArchive = () => {
    startTransition(async () => {
      try {
        await archiveAssignment(assignment.assignment_uuid);
        toast.success('Assignment archived');
        await onPublished();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to archive assignment');
      }
    });
  };

  return (
    <header className="bg-card/95 sticky top-0 z-30 border-b backdrop-blur">
      <div className="flex flex-col gap-3 px-4 py-3 lg:px-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0 space-y-1">
            <BreadCrumbs
              type="assignments"
              last_breadcrumb={assignment.title}
            />
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="truncate text-xl font-semibold md:text-2xl">{assignment.title}</h1>
              <Badge variant={assignment.status === 'PUBLISHED' ? 'default' : 'secondary'}>
                {ASSIGNMENT_STATUS_LABELS[assignment.status]}
              </Badge>
            </div>
            <p className="text-muted-foreground truncate text-sm">{courseUuid ?? 'No course linked'}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {previewHref ? (
              <Button
                variant="outline"
                size="sm"
                render={<Link href={previewHref} target="_blank" />}
              >
                <Eye className="size-4" />
                Preview
              </Button>
            ) : null}
            {canArchive ? (
              <Button
                variant="outline"
                size="sm"
                disabled={isPending}
                onClick={handleArchive}
              >
                <Archive className="size-4" />
                Archive
              </Button>
            ) : null}
            {canPublish ? (
              <Button
                size="sm"
                disabled={isPending || publishIssues.length > 0}
                onClick={handlePublish}
              >
                {isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}
                Publish
              </Button>
            ) : null}
          </div>
        </div>

        {publishIssues.length > 0 ? (
          <Alert className="py-2">
            <AlertTriangle className="size-4" />
            <AlertDescription className="text-sm">
              Publish validation: {publishIssues.slice(0, 3).join(' ')}
              {publishIssues.length > 3 ? ` +${publishIssues.length - 3} more.` : ''}
            </AlertDescription>
          </Alert>
        ) : null}
      </div>
    </header>
  );
}

function TaskOutlineRail({
  assignmentUuid,
  tasks,
  selectedTaskUuid,
  totalPoints,
  taskIssues,
  onSelectTask,
  onCreated,
}: {
  assignmentUuid: string;
  tasks: AssignmentTaskRead[];
  selectedTaskUuid: string | null;
  totalPoints: number;
  taskIssues: Map<string, string[]>;
  onSelectTask: (taskUuid: string) => void;
  onCreated: (taskUuid: string) => Promise<void>;
}) {
  const [isCreating, startTransition] = useTransition();

  const createTask = (type: AssignmentTaskType) => {
    const module = getTaskTypeEditor(type);
    startTransition(async () => {
      try {
        const res = await createAssignmentTask(
          {
            title: 'Untitled task',
            description: '',
            hint: '',
            reference_file: null,
            assignment_type: type,
            contents: module.buildDefaultContents(),
            max_grade_value: 1,
          },
          assignmentUuid,
        );
        const taskUuid = typeof res.data?.assignment_task_uuid === 'string' ? res.data.assignment_task_uuid : null;
        toast.success('Task created');
        if (taskUuid) await onCreated(taskUuid);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to create task');
      }
    });
  };

  return (
    <aside className="bg-muted/20 p-4 lg:sticky lg:top-[88px] lg:h-[calc(100vh-88px)] lg:overflow-y-auto">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Task outline</h2>
          <p className="text-muted-foreground text-xs">{totalPoints} total points</p>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2">
        {(['QUIZ', 'FILE_SUBMISSION', 'FORM'] as const).map((type) => {
          const module = getTaskTypeEditor(type);
          const Icon = TASK_ICONS[type];
          return (
            <Button
              key={type}
              type="button"
              variant="outline"
              size="sm"
              disabled={isCreating}
              className="h-10 px-2"
              onClick={() => createTask(type)}
              title={`Add ${module.label}`}
            >
              <Icon className="size-4" />
            </Button>
          );
        })}
      </div>

      {tasks.length === 0 ? (
        <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">Add a task to begin.</div>
      ) : (
        <div className="space-y-2">
          {tasks.map((task, index) => {
            const Icon = TASK_ICONS[task.assignment_type];
            const issues = taskIssues.get(task.assignment_task_uuid) ?? [];
            const selected = task.assignment_task_uuid === selectedTaskUuid;
            return (
              <button
                key={task.assignment_task_uuid}
                type="button"
                onClick={() => onSelectTask(task.assignment_task_uuid)}
                className={cn(
                  'w-full rounded-md border bg-background p-3 text-left transition hover:bg-muted/60',
                  selected && 'border-primary ring-primary/20 ring-2',
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Icon className="text-muted-foreground size-4 shrink-0" />
                      <span className="truncate text-sm font-medium">
                        {index + 1}. {task.title || 'Untitled task'}
                      </span>
                    </div>
                    <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <span>{task.max_grade_value || 0} pts</span>
                      <span>{pointsToPercent(task.max_grade_value || 0, totalPoints) ?? 0}% weight</span>
                    </div>
                  </div>
                  {issues.length > 0 ? (
                    <AlertTriangle className="size-4 shrink-0 text-amber-600" />
                  ) : (
                    <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
                  )}
                </div>
                {issues.length > 0 ? <p className="mt-2 text-xs text-amber-700">{issues[0]}</p> : null}
              </button>
            );
          })}
        </div>
      )}
    </aside>
  );
}

function UnifiedTaskEditor({
  assignmentUuid,
  task,
  totalPoints,
  disabled,
  onSaved,
  onDeleted,
}: {
  assignmentUuid: string;
  task: AssignmentTaskRead | null;
  totalPoints: number;
  disabled: boolean;
  onSaved: () => Promise<void>;
  onDeleted: () => Promise<void>;
}) {
  const [value, setValue] = useState<AssignmentTaskEditorValue | null>(task ? taskToEditorValue(task) : null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [isDeleting, startDeleteTransition] = useTransition();
  const lastSavedRef = useRef('');
  const taskUuid = task?.assignment_task_uuid ?? '';

  useEffect(() => {
    const nextValue = task ? taskToEditorValue(task) : null;
    setValue(nextValue);
    lastSavedRef.current = nextValue ? serializeTaskEditorValue(nextValue) : '';
    setSaveState('idle');
  }, [taskUuid, task]);

  const saveTask = useCallback(
    async (nextValue: AssignmentTaskEditorValue) => {
      const module = getTaskTypeEditor(nextValue.assignment_type);
      setSaveState('saving');
      try {
        await updateAssignmentTask({
          assignmentUUID: assignmentUuid,
          assignmentTaskUUID: nextValue.assignment_task_uuid,
          body: {
            title: nextValue.title,
            description: nextValue.description,
            hint: nextValue.hint,
            max_grade_value: nextValue.max_grade_value,
            contents: module.getPreviewPayload(nextValue),
          },
        });
        lastSavedRef.current = serializeTaskEditorValue(nextValue);
        setSaveState('saved');
        await onSaved();
      } catch (error) {
        setSaveState('error');
        toast.error(error instanceof Error ? error.message : 'Failed to autosave task');
      }
    },
    [assignmentUuid, onSaved],
  );

  useEffect(() => {
    if (!value || disabled) return;
    const serialized = serializeTaskEditorValue(value);
    if (serialized === lastSavedRef.current) return;
    setSaveState('dirty');
    const timeout = setTimeout(() => void saveTask(value), 900);
    return () => clearTimeout(timeout);
  }, [disabled, saveTask, value]);

  if (!task || !value) {
    return (
      <div className="flex min-h-[520px] items-center justify-center p-8">
        <div className="max-w-sm text-center">
          <BookOpen className="text-muted-foreground mx-auto size-10" />
          <h2 className="mt-3 text-lg font-semibold">No task selected</h2>
          <p className="text-muted-foreground mt-1 text-sm">Create or select a task from the outline.</p>
        </div>
      </div>
    );
  }

  const module = getTaskTypeEditor(value.assignment_type);
  const TypeEditor = module.Component;
  const issues = module.validate(value);

  const handleDelete = () => {
    startDeleteTransition(async () => {
      try {
        await deleteAssignmentTask(value.assignment_task_uuid, assignmentUuid);
        toast.success('Task deleted');
        await onDeleted();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to delete task');
      }
    });
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{module.label}</Badge>
            <SaveStateBadge state={saveState} />
            {disabled ? <Badge variant="secondary">Read only</Badge> : null}
          </div>
          <h2 className="mt-2 text-xl font-semibold">{value.title || 'Untitled task'}</h2>
          <p className="text-muted-foreground text-sm">{module.description}</p>
        </div>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={disabled || isDeleting}
          onClick={handleDelete}
        >
          {isDeleting ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
          Delete
        </Button>
      </div>

      {issues.length > 0 ? (
        <Alert>
          <AlertTriangle className="size-4" />
          <AlertDescription>{issues.map((issue) => issue.message).join(' ')}</AlertDescription>
        </Alert>
      ) : null}

      <section className="rounded-lg border bg-card p-4 md:p-5">
        <div className="mb-4">
          <h3 className="text-sm font-semibold">Task metadata</h3>
          <p className="text-muted-foreground text-xs">Shared title, instructions, hint, and point value.</p>
        </div>
        <div className="grid gap-4">
          <div className="space-y-2">
            <Label htmlFor="task-title">Title</Label>
            <Input
              id="task-title"
              value={value.title}
              disabled={disabled}
              onChange={(event) => setValue(patchEditorValue(value, { title: event.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="task-description">Instructions</Label>
            <Textarea
              id="task-description"
              value={value.description}
              disabled={disabled}
              className="min-h-24"
              onChange={(event) => setValue(patchEditorValue(value, { description: event.target.value }))}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-[1fr_12rem]">
            <div className="space-y-2">
              <Label htmlFor="task-hint">Hint</Label>
              <Input
                id="task-hint"
                value={value.hint}
                disabled={disabled}
                onChange={(event) => setValue(patchEditorValue(value, { hint: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-points">Points</Label>
              <Input
                id="task-points"
                type="number"
                min={0.01}
                step={0.5}
                value={value.max_grade_value}
                disabled={disabled}
                onChange={(event) =>
                  setValue(
                    patchEditorValue(value, {
                      max_grade_value: event.target.value ? Number(event.target.value) : 0,
                    }),
                  )
                }
              />
              <p className="text-muted-foreground text-xs">
                {pointsToPercent(value.max_grade_value, totalPoints) ?? 0}% of assignment
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-lg border bg-card p-4 md:p-5">
        <div className="mb-4">
          <h3 className="text-sm font-semibold">Task content</h3>
          <p className="text-muted-foreground text-xs">Type-specific authoring using the shared editor contract.</p>
        </div>
        <TypeEditor
          value={value}
          disabled={disabled}
          onChange={setValue}
        />
      </section>
    </div>
  );
}

function AssignmentPolicyInspector({
  assignment,
  tasks,
  publishIssues,
  onSaved,
}: {
  assignment: AssignmentRead;
  tasks: AssignmentTaskRead[];
  publishIssues: string[];
  onSaved: () => Promise<void>;
}) {
  const [title, setTitle] = useState(assignment.title);
  const [description, setDescription] = useState(assignment.description);
  const [dueAt, setDueAt] = useState(toDateTimeLocal(assignment.due_at));
  const [gradingType, setGradingType] = useState(assignment.grading_type);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const lastSavedRef = useRef('');
  const editable = assignment.status === 'DRAFT' || assignment.status === 'SCHEDULED';
  const totalPoints = getAssignmentTotalPoints(tasks);

  useEffect(() => {
    setTitle(assignment.title);
    setDescription(assignment.description);
    setDueAt(toDateTimeLocal(assignment.due_at));
    setGradingType(assignment.grading_type);
    lastSavedRef.current = serializeAssignmentSettings(assignment.title, assignment.description, assignment.due_at, assignment.grading_type);
    setSaveState('idle');
  }, [assignment.assignment_uuid, assignment.description, assignment.due_at, assignment.grading_type, assignment.title]);

  const saveAssignment = useCallback(async () => {
    setSaveState('saving');
    try {
      const dueAtIso = dueAt ? new Date(dueAt).toISOString() : null;
      await updateAssignment(
        {
          title,
          description,
          due_at: dueAtIso,
          grading_type: gradingType,
        },
        assignment.assignment_uuid,
      );
      lastSavedRef.current = serializeAssignmentSettings(title, description, dueAtIso, gradingType);
      setSaveState('saved');
      await onSaved();
    } catch (error) {
      setSaveState('error');
      toast.error(error instanceof Error ? error.message : 'Failed to autosave assignment settings');
    }
  }, [assignment.assignment_uuid, description, dueAt, gradingType, onSaved, title]);

  useEffect(() => {
    if (!editable) return;
    const dueAtIso = dueAt ? new Date(dueAt).toISOString() : null;
    const serialized = serializeAssignmentSettings(title, description, dueAtIso, gradingType);
    if (serialized === lastSavedRef.current) return;
    setSaveState('dirty');
    const timeout = setTimeout(() => void saveAssignment(), 900);
    return () => clearTimeout(timeout);
  }, [description, dueAt, editable, gradingType, saveAssignment, title]);

  return (
    <div className="space-y-6 p-4 xl:sticky xl:top-[88px] xl:h-[calc(100vh-88px)] xl:overflow-y-auto">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Assignment policy</h2>
          <p className="text-muted-foreground text-xs">Settings, grading, release, and score summary.</p>
        </div>
        <SaveStateBadge state={saveState} />
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="assignment-title">Title</Label>
          <Input
            id="assignment-title"
            value={title}
            disabled={!editable}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="assignment-description">Description</Label>
          <Textarea
            id="assignment-description"
            value={description}
            disabled={!editable}
            className="min-h-28"
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="assignment-due">Due date</Label>
          <Input
            id="assignment-due"
            type="datetime-local"
            value={dueAt}
            disabled={!editable}
            onChange={(event) => setDueAt(event.target.value)}
          />
        </div>
      </div>

      <Separator />

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="grading-type">Grading mode</Label>
          <NativeSelect
            id="grading-type"
            value={gradingType}
            disabled={!editable}
            onChange={(event) => setGradingType(event.target.value as AssignmentRead['grading_type'])}
          >
            <NativeSelectOption value="NUMERIC">Numeric</NativeSelectOption>
            <NativeSelectOption value="PERCENTAGE">Percentage</NativeSelectOption>
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="attempt-policy">Attempts</Label>
          <NativeSelect
            id="attempt-policy"
            value="policy"
            disabled
          >
            <NativeSelectOption value="policy">Per task or backend policy</NativeSelectOption>
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="release-mode">Release mode</Label>
          <NativeSelect
            id="release-mode"
            value="manual"
            disabled
          >
            <NativeSelectOption value="manual">Manual release after grading</NativeSelectOption>
          </NativeSelect>
        </div>
      </div>

      <Separator />

      <ScoreSummary tasks={tasks} />

      <Separator />

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <CalendarClock className="text-muted-foreground size-4" />
          <h3 className="text-sm font-semibold">Publish readiness</h3>
        </div>
        {publishIssues.length === 0 ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            Ready to publish. {totalPoints} total points will normalize to 100%.
          </div>
        ) : (
          <div className="space-y-2">
            {publishIssues.map((issue) => (
              <div
                key={issue}
                className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800"
              >
                {issue}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ScoreSummary({ tasks }: { tasks: AssignmentTaskRead[] }) {
  const totalPoints = getAssignmentTotalPoints(tasks);
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">Score summary</h3>
        <p className="text-muted-foreground text-xs">{totalPoints} raw points normalize to a 100% final grade.</p>
      </div>
      <div className="space-y-2">
        {tasks.map((task) => (
          <div
            key={task.assignment_task_uuid}
            className="rounded-md border p-2"
          >
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate font-medium">{task.title || 'Untitled task'}</span>
              <span className="shrink-0">{task.max_grade_value || 0} pts</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="bg-primary h-full"
                style={{ width: `${pointsToPercent(task.max_grade_value || 0, totalPoints) ?? 0}%` }}
              />
            </div>
            <div className="text-muted-foreground mt-1 text-xs">
              {pointsToPercent(task.max_grade_value || 0, totalPoints) ?? 0}% final weight
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SaveStateBadge({ state }: { state: SaveState }) {
  if (state === 'idle') return null;
  if (state === 'dirty') return <Badge variant="secondary">Unsaved</Badge>;
  if (state === 'saving') {
    return (
      <Badge variant="secondary">
        <LoaderCircle className="size-3 animate-spin" />
        Saving
      </Badge>
    );
  }
  if (state === 'error') return <Badge variant="destructive">Save failed</Badge>;
  return <Badge variant="success">Saved</Badge>;
}

function getTaskIssues(tasks: AssignmentTaskRead[]) {
  const result = new Map<string, string[]>();
  for (const task of tasks) {
    const module = getTaskTypeEditor(task.assignment_type);
    const value = taskToEditorValue(task);
    const issues = module.validate(value).map((issue) => issue.message);
    if (!task.title.trim()) issues.unshift('Task title is required.');
    if (issues.length > 0) result.set(task.assignment_task_uuid, issues);
  }
  return result;
}

function getPublishIssues(assignment: AssignmentRead, tasks: AssignmentTaskRead[]) {
  const issues: string[] = [];
  if (!assignment.title.trim()) issues.push('Assignment title is required.');
  if (tasks.length === 0) issues.push('At least one task is required.');
  if (getAssignmentTotalPoints(tasks) <= 0) issues.push('Assignment must have a positive total point value.');
  for (const task of tasks) {
    const module = getTaskTypeEditor(task.assignment_type);
    const value = taskToEditorValue(task);
    const taskIssues = module.validate(value);
    if (!task.title.trim()) taskIssues.unshift({ code: 'TITLE_REQUIRED', message: 'Task title is required.' });
    for (const issue of taskIssues) {
      issues.push(`${task.title || 'Untitled task'}: ${issue.message}`);
    }
  }
  return issues;
}

function serializeTaskEditorValue(value: AssignmentTaskEditorValue) {
  return JSON.stringify({
    title: value.title,
    description: value.description,
    hint: value.hint,
    max_grade_value: value.max_grade_value,
    contents: value.contents,
  });
}

function serializeAssignmentSettings(
  title: string,
  description: string,
  dueAt: string | null | undefined,
  gradingType: AssignmentRead['grading_type'],
) {
  return JSON.stringify({ title, description, dueAt, gradingType });
}

function toDateTimeLocal(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}
