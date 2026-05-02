'use client';

import { AlertTriangle, BookOpen, LoaderCircle, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { deleteAssignmentTask, updateAssignmentTask } from '@services/courses/assignments';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

import { useAssignmentStudioContext } from './AssignmentStudioContext';
import SaveStateBadge from './SaveStateBadge';
import type { SaveState } from './SaveStateBadge';
import {
  getTaskTypeEditor,
  patchEditorValue,
  pointsToPercent,
  taskToEditorValue,
  type AssignmentTaskEditorValue,
} from './studio-compat';

export default function AssignmentTaskEditor() {
  const { assignmentUuid, tasks, selectedTaskUuid, setSelectedTaskUuid, refresh, isEditable, totalPoints } =
    useAssignmentStudioContext();

  const task = tasks.find((t) => t.assignment_task_uuid === selectedTaskUuid) ?? tasks[0] ?? null;

  const [value, setValue] = useState<AssignmentTaskEditorValue | null>(task ? taskToEditorValue(task) : null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [isDeleting, startDeleteTransition] = useTransition();
  const lastSavedRef = useRef('');
  const taskUuid = task?.assignment_task_uuid ?? '';

  useEffect(() => {
    const nextValue = task ? taskToEditorValue(task) : null;
    setValue(nextValue);
    lastSavedRef.current = nextValue ? serializeValue(nextValue) : '';
    setSaveState('idle');
  }, [taskUuid]); // eslint-disable-line react-hooks/exhaustive-deps

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
        lastSavedRef.current = serializeValue(nextValue);
        setSaveState('saved');
        await refresh();
      } catch (error) {
        setSaveState('error');
        toast.error(error instanceof Error ? error.message : 'Failed to autosave task');
      }
    },
    [assignmentUuid, refresh],
  );

  useEffect(() => {
    if (!value || !isEditable) return;
    const serialized = serializeValue(value);
    if (serialized === lastSavedRef.current) return;
    setSaveState('dirty');
    const timeout = setTimeout(() => void saveTask(value), 900);
    return () => clearTimeout(timeout);
  }, [isEditable, saveTask, value]);

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
        setSelectedTaskUuid(null);
        await refresh();
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
            {!isEditable && <Badge variant="secondary">Read only</Badge>}
          </div>
          <h2 className="mt-2 text-xl font-semibold">{value.title || 'Untitled task'}</h2>
          <p className="text-muted-foreground text-sm">{module.description}</p>
        </div>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={!isEditable || isDeleting}
          onClick={handleDelete}
        >
          {isDeleting ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
          Delete
        </Button>
      </div>

      {issues.length > 0 && (
        <Alert>
          <AlertTriangle className="size-4" />
          <AlertDescription>{issues.map((i) => i.message).join(' ')}</AlertDescription>
        </Alert>
      )}

      <section className="bg-card rounded-lg border p-4 md:p-5">
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
              disabled={!isEditable}
              onChange={(e) => setValue(patchEditorValue(value, { title: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="task-description">Instructions</Label>
            <Textarea
              id="task-description"
              value={value.description}
              disabled={!isEditable}
              className="min-h-24"
              onChange={(e) => setValue(patchEditorValue(value, { description: e.target.value }))}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-[1fr_12rem]">
            <div className="space-y-2">
              <Label htmlFor="task-hint">Hint</Label>
              <Input
                id="task-hint"
                value={value.hint}
                disabled={!isEditable}
                onChange={(e) => setValue(patchEditorValue(value, { hint: e.target.value }))}
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
                disabled={!isEditable}
                onChange={(e) =>
                  setValue(patchEditorValue(value, { max_grade_value: e.target.value ? Number(e.target.value) : 0 }))
                }
              />
              <p className="text-muted-foreground text-xs">
                {pointsToPercent(value.max_grade_value, totalPoints) ?? 0}% of assignment
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-card rounded-lg border p-4 md:p-5">
        <div className="mb-4">
          <h3 className="text-sm font-semibold">Task content</h3>
          <p className="text-muted-foreground text-xs">Type-specific authoring.</p>
        </div>
        <TypeEditor
          value={value}
          disabled={!isEditable}
          onChange={setValue}
        />
      </section>
    </div>
  );
}

function serializeValue(value: AssignmentTaskEditorValue) {
  return JSON.stringify({
    title: value.title,
    description: value.description,
    hint: value.hint,
    max_grade_value: value.max_grade_value,
    contents: value.contents,
  });
}
