'use client';

import { CalendarClock } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { updateAssignment } from '@services/courses/assignments';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { useAssignmentStudioContext } from './AssignmentStudioContext';
import SaveStateBadge from './SaveStateBadge';
import type { SaveState } from './SaveStateBadge';
import {
  getAssignmentTotalPoints,
  pointsToPercent,
  type AssignmentRead,
} from './studio-compat';

export default function AssignmentInspector() {
  const { assignment, tasks, isEditable, refresh } = useAssignmentStudioContext();
  return (
    <AssignmentInspectorForm
      key={assignment.assignment_uuid}
      assignment={assignment}
      tasks={tasks}
      isEditable={isEditable}
      onSaved={refresh}
    />
  );
}

// ── Form (keyed so it re-mounts on assignment change) ─────────────────────────

function AssignmentInspectorForm({
  assignment,
  tasks,
  isEditable,
  onSaved,
}: {
  assignment: AssignmentRead;
  tasks: ReturnType<typeof useAssignmentStudioContext>['tasks'];
  isEditable: boolean;
  onSaved: () => Promise<void>;
}) {
  const [title, setTitle] = useState(assignment.title);
  const [description, setDescription] = useState(assignment.description ?? '');
  const [dueAt, setDueAt] = useState(toDateTimeLocal(assignment.due_at));
  const [gradingType, setGradingType] = useState(assignment.grading_type);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const lastSavedRef = useRef(
    serialize(assignment.title, assignment.description ?? '', assignment.due_at, assignment.grading_type),
  );
  const totalPoints = getAssignmentTotalPoints(tasks);

  const save = useCallback(async () => {
    setSaveState('saving');
    try {
      const dueAtIso = dueAt ? new Date(dueAt).toISOString() : null;
      await updateAssignment(
        { title, description, due_at: dueAtIso, grading_type: gradingType },
        assignment.assignment_uuid,
      );
      lastSavedRef.current = serialize(title, description, dueAtIso, gradingType);
      setSaveState('saved');
      await onSaved();
    } catch (error) {
      setSaveState('error');
      toast.error(error instanceof Error ? error.message : 'Failed to save assignment settings');
    }
  }, [assignment.assignment_uuid, description, dueAt, gradingType, onSaved, title]);

  useEffect(() => {
    if (!isEditable) return;
    const dueAtIso = dueAt ? new Date(dueAt).toISOString() : null;
    const serialized = serialize(title, description, dueAtIso, gradingType);
    if (serialized === lastSavedRef.current) return;
    setSaveState('dirty');
    const timeout = setTimeout(() => void save(), 900);
    return () => clearTimeout(timeout);
  }, [description, dueAt, gradingType, isEditable, save, title]);

  // Publish readiness
  const publishIssues: string[] = [];
  if (!title.trim()) publishIssues.push('Assignment title is required.');
  if (tasks.length === 0) publishIssues.push('At least one task is required.');
  if (totalPoints <= 0) publishIssues.push('Assignment must have a positive total point value.');

  return (
    <div className="space-y-6 p-4 xl:sticky xl:top-[88px] xl:h-[calc(100vh-88px)] xl:overflow-y-auto">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Assignment policy</h2>
          <p className="text-muted-foreground text-xs">Settings, grading, release, and score summary.</p>
        </div>
        <SaveStateBadge state={saveState} />
      </div>

      {/* Metadata */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="assignment-title">Title</Label>
          <Input
            id="assignment-title"
            value={title}
            disabled={!isEditable}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="assignment-description">Description</Label>
          <Textarea
            id="assignment-description"
            value={description}
            disabled={!isEditable}
            className="min-h-28"
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="assignment-due">Due date</Label>
          <Input
            id="assignment-due"
            type="datetime-local"
            value={dueAt}
            disabled={!isEditable}
            onChange={(e) => setDueAt(e.target.value)}
          />
        </div>
      </div>

      <Separator />

      {/* Grading */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="grading-type">Grading mode</Label>
          <NativeSelect
            id="grading-type"
            value={gradingType}
            disabled={!isEditable}
            onChange={(e) => setGradingType(e.target.value as AssignmentRead['grading_type'])}
          >
            <NativeSelectOption value="NUMERIC">Numeric</NativeSelectOption>
            <NativeSelectOption value="PERCENTAGE">Percentage</NativeSelectOption>
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label>Attempts</Label>
          <NativeSelect
            value="policy"
            disabled
          >
            <NativeSelectOption value="policy">Per task or backend policy</NativeSelectOption>
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label>Release mode</Label>
          <NativeSelect
            value="manual"
            disabled
          >
            <NativeSelectOption value="manual">Manual release after grading</NativeSelectOption>
          </NativeSelect>
        </div>
      </div>

      <Separator />

      {/* Score summary */}
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Score summary</h3>
          <p className="text-muted-foreground text-xs">{totalPoints} raw points → 100% final grade.</p>
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
              <div className="bg-muted mt-1 h-1.5 overflow-hidden rounded-full">
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

      <Separator />

      {/* Publish readiness */}
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

// ── helpers ───────────────────────────────────────────────────────────────────

function toDateTimeLocal(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function serialize(
  title: string,
  description: string,
  dueAt: string | null | undefined,
  gradingType: AssignmentRead['grading_type'],
) {
  return JSON.stringify({ title, description, dueAt, gradingType });
}
