'use client';

import { AlertTriangle, BookOpen, CheckCircle2, FileUp, ListTodo, LoaderCircle, TextCursorInput } from 'lucide-react';
import { useTransition } from 'react';
import type { ElementType } from 'react';
import { toast } from 'sonner';

import { createAssignmentTask } from '@services/courses/assignments';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { useAssignmentStudioContext } from './AssignmentStudioContext';
import { getTaskTypeEditor, pointsToPercent, taskToEditorValue } from './studio-compat';
import type { AssignmentTaskRead, AssignmentTaskType } from './studio-compat';

const TASK_ICONS: Record<AssignmentTaskType, ElementType> = {
  FILE_SUBMISSION: FileUp,
  QUIZ: ListTodo,
  FORM: TextCursorInput,
  OTHER: BookOpen,
};

export default function AssignmentTaskOutline() {
  const { assignmentUuid, tasks, selectedTaskUuid, totalPoints, setSelectedTaskUuid, refresh, isEditable } =
    useAssignmentStudioContext();

  const [isCreating, startTransition] = useTransition();

  const taskIssues = getTaskIssuesMap(tasks);

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
        const taskUuid =
          typeof (res.data as { assignment_task_uuid?: string } | undefined)?.assignment_task_uuid === 'string'
            ? (res.data as { assignment_task_uuid: string }).assignment_task_uuid
            : null;
        toast.success('Task created');
        await refresh();
        if (taskUuid) setSelectedTaskUuid(taskUuid);
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

      {isEditable && (
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
                {isCreating ? <LoaderCircle className="size-4 animate-spin" /> : <Icon className="size-4" />}
              </Button>
            );
          })}
        </div>
      )}

      {tasks.length === 0 ? (
        <div className="text-muted-foreground rounded-md border border-dashed p-4 text-sm">Add a task to begin.</div>
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
                onClick={() => setSelectedTaskUuid(task.assignment_task_uuid)}
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

// ── helpers ───────────────────────────────────────────────────────────────────

function getTaskIssuesMap(tasks: AssignmentTaskRead[]): Map<string, string[]> {
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
