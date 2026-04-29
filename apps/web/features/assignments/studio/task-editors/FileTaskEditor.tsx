'use client';

import { FileUp } from 'lucide-react';
import * as v from 'valibot';

import { FileContentsSchema } from '@/schemas/assignmentTaskContents';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import type { AssignmentTaskEditorValue, TaskEditorValidationIssue, TaskTypeEditorModule } from './types';

function normalizeFileContents(value: AssignmentTaskEditorValue) {
  const raw = value.contents;
  return {
    kind: 'FILE_SUBMISSION' as const,
    allowed_mime_types: Array.isArray(raw.allowed_mime_types)
      ? raw.allowed_mime_types.filter((item): item is string => typeof item === 'string')
      : [],
    max_file_size_mb: typeof raw.max_file_size_mb === 'number' ? raw.max_file_size_mb : null,
    max_files: typeof raw.max_files === 'number' ? raw.max_files : 1,
  };
}

function validate(value: AssignmentTaskEditorValue): TaskEditorValidationIssue[] {
  const issues: TaskEditorValidationIssue[] = [];
  if (value.max_grade_value <= 0) issues.push({ code: 'POINTS_REQUIRED', message: 'Points must be greater than 0.' });
  const parsed = v.safeParse(FileContentsSchema, normalizeFileContents(value));
  if (!parsed.success) {
    issues.push({ code: 'FILE_CONFIG_INVALID', message: parsed.issues[0]?.message ?? 'File settings are invalid.' });
  }
  return issues;
}

function FileTaskEditorComponent({ value, disabled, onChange }: Parameters<TaskTypeEditorModule['Component']>[0]) {
  const contents = normalizeFileContents(value);
  const mimeText = contents.allowed_mime_types.join(', ');

  return (
    <div className="space-y-4">
      <div className="rounded-md border bg-muted/40 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <FileUp className="size-4" />
          File submission
        </div>
        <p className="text-muted-foreground mt-1 text-sm">
          Students upload one or more files. Reference files stay in the common task metadata section.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="file-max-files">Max files</Label>
          <Input
            id="file-max-files"
            type="number"
            min={1}
            value={contents.max_files}
            disabled={disabled}
            onChange={(event) =>
              onChange({
                ...value,
                contents: { ...contents, max_files: Math.max(1, Number(event.target.value) || 1) },
              })
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="file-max-size">Max size, MB</Label>
          <Input
            id="file-max-size"
            type="number"
            min={1}
            value={contents.max_file_size_mb ?? ''}
            placeholder="No limit"
            disabled={disabled}
            onChange={(event) =>
              onChange({
                ...value,
                contents: {
                  ...contents,
                  max_file_size_mb: event.target.value ? Math.max(1, Number(event.target.value) || 1) : null,
                },
              })
            }
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="file-mime-types">Allowed MIME types</Label>
        <Input
          id="file-mime-types"
          value={mimeText}
          placeholder="application/pdf, image/png"
          disabled={disabled}
          onChange={(event) =>
            onChange({
              ...value,
              contents: {
                ...contents,
                allowed_mime_types: event.target.value
                  .split(',')
                  .map((item) => item.trim())
                  .filter(Boolean),
              },
            })
          }
        />
      </div>
    </div>
  );
}

export const FileTaskEditor: TaskTypeEditorModule = {
  type: 'FILE_SUBMISSION',
  label: 'File task',
  description: 'Upload-based task with file constraints.',
  buildDefaultContents: () => ({ kind: 'FILE_SUBMISSION', allowed_mime_types: [], max_file_size_mb: null, max_files: 1 }),
  validate,
  getPreviewPayload: normalizeFileContents,
  Component: FileTaskEditorComponent,
};
