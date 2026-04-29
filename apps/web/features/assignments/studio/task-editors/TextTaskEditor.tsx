'use client';

import { AlignLeft } from 'lucide-react';

import { Textarea } from '@/components/ui/textarea';

import type { AssignmentTaskEditorValue, TaskEditorValidationIssue, TaskTypeEditorModule } from './types';

function normalizeTextContents(value: AssignmentTaskEditorValue) {
  return {
    kind: 'OTHER' as const,
    body: {
      prompt:
        value.contents.body && typeof value.contents.body === 'object'
          ? typeof (value.contents.body as Record<string, unknown>).prompt === 'string'
            ? ((value.contents.body as Record<string, unknown>).prompt as string)
            : ''
          : '',
    },
  };
}

function validate(value: AssignmentTaskEditorValue): TaskEditorValidationIssue[] {
  const issues: TaskEditorValidationIssue[] = [];
  if (value.max_grade_value <= 0) issues.push({ code: 'POINTS_REQUIRED', message: 'Points must be greater than 0.' });
  return issues;
}

function TextTaskEditorComponent({ value, disabled, onChange }: Parameters<TaskTypeEditorModule['Component']>[0]) {
  const contents = normalizeTextContents(value);
  return (
    <div className="space-y-4">
      <div className="rounded-md border bg-muted/40 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <AlignLeft className="size-4" />
          Text task
        </div>
        <p className="text-muted-foreground mt-1 text-sm">Reserved for future open-response authoring.</p>
      </div>
      <Textarea
        value={contents.body.prompt}
        placeholder="Prompt"
        disabled={disabled}
        className="min-h-36"
        onChange={(event) => onChange({ ...value, contents: { ...contents, body: { prompt: event.target.value } } })}
      />
    </div>
  );
}

export const TextTaskEditor: TaskTypeEditorModule = {
  type: 'OTHER',
  label: 'Text task',
  description: 'Future open-response task.',
  buildDefaultContents: () => ({ kind: 'OTHER', body: { prompt: '' } }),
  validate,
  getPreviewPayload: normalizeTextContents,
  Component: TextTaskEditorComponent,
};
