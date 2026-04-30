'use client';

import { AlertCircle, Download, File, LoaderCircle, UploadCloud } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import { updateSubFile } from '@services/courses/assignments';
import { getTaskFileSubmissionDir, getTaskRefFileDir } from '@services/media/media';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Link from '@components/ui/AppLink';

import { registerItemKind, type ItemAuthorProps, type ItemAttemptProps, type ItemReviewDetailProps } from '../registry';

export interface FileUploadConstraints {
  kind: 'FILE_UPLOAD' | 'FILE_SUBMISSION';
  allowed_mime_types: string[];
  max_file_size_mb: number | null;
  max_files: number;
}

export interface FileUploadAttemptItem {
  taskUuid: string;
  assignmentUuid: string;
  courseUuid?: string | null;
  activityUuid?: string | null;
  referenceFile?: string | null;
  constraints?: FileUploadConstraints;
}

export interface FileUploadAnswer {
  task_uuid?: string;
  content_type?: 'file';
  file_key?: string | null;
}

export function normalizeFileUploadConstraints(raw: Record<string, unknown> | null | undefined): FileUploadConstraints {
  return {
    kind: 'FILE_UPLOAD',
    allowed_mime_types: Array.isArray(raw?.allowed_mime_types)
      ? raw.allowed_mime_types.filter((item): item is string => typeof item === 'string')
      : [],
    max_file_size_mb: typeof raw?.max_file_size_mb === 'number' ? raw.max_file_size_mb : null,
    max_files: typeof raw?.max_files === 'number' ? raw.max_files : 1,
  };
}

export function FileUploadConstraintsEditor({
  value,
  disabled,
  onChange,
}: ItemAuthorProps<FileUploadConstraints>) {
  const mimeText = value.allowed_mime_types.join(', ');
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="file-max-files">Max files</Label>
          <Input
            id="file-max-files"
            type="number"
            min={1}
            value={value.max_files}
            disabled={disabled}
            onChange={(event) =>
              onChange({ ...value, max_files: Math.max(1, Number(event.target.value) || 1) })
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="file-max-size">Max size, MB</Label>
          <Input
            id="file-max-size"
            type="number"
            min={1}
            value={value.max_file_size_mb ?? ''}
            placeholder="No limit"
            disabled={disabled}
            onChange={(event) =>
              onChange({
                ...value,
                max_file_size_mb: event.target.value ? Math.max(1, Number(event.target.value) || 1) : null,
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
              allowed_mime_types: event.target.value
                .split(',')
                .map((item) => item.trim())
                .filter(Boolean),
            })
          }
        />
      </div>
    </div>
  );
}

export function FileUploadAttempt({
  item,
  answer,
  disabled,
  onAnswerChange,
}: ItemAttemptProps<FileUploadAttemptItem, FileUploadAnswer | null>) {
  const [localFileName, setLocalFileName] = useState('');
  const fileKey = answer?.file_key ?? '';

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const res = await updateSubFile({
        file,
        assignmentTaskUUID: item.taskUuid,
        assignmentUUID: item.assignmentUuid,
      });
      if (!res.success || !res.data?.file_uuid) throw new Error(res.data?.detail || 'Upload failed');
      return res.data.file_uuid as string;
    },
    onSuccess: (nextFileKey) => {
      onAnswerChange({
        task_uuid: item.taskUuid,
        content_type: 'file',
        file_key: nextFileKey,
      });
      toast.success('File attached. Save the draft to keep this change.');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Upload failed'),
  });

  const fileUrl =
    fileKey && item.courseUuid && item.activityUuid
      ? getTaskFileSubmissionDir({
          courseUUID: item.courseUuid,
          activityUUID: item.activityUuid,
          assignmentUUID: item.assignmentUuid,
          assignmentTaskUUID: item.taskUuid,
          fileSubID: fileKey,
        })
      : null;

  const referenceUrl =
    item.referenceFile && item.courseUuid && item.activityUuid
      ? getTaskRefFileDir({
          courseUUID: item.courseUuid,
          activityUUID: item.activityUuid,
          assignmentUUID: item.assignmentUuid,
          assignmentTaskUUID: item.taskUuid,
          fileID: item.referenceFile,
        })
      : null;

  return (
    <div className="space-y-4 rounded-md border bg-muted/30 p-4">
      {referenceUrl ? (
        <Button variant="outline" render={<Link href={referenceUrl} target="_blank" download />}>
          <Download className="size-4" />
          Reference file
        </Button>
      ) : null}

      {fileUrl ? (
        <Button variant="outline" render={<Link href={fileUrl} target="_blank" />}>
          <File className="size-4" />
          Current file
        </Button>
      ) : localFileName ? (
        <div className="inline-flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm">
          <File className="size-4" />
          {localFileName}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          type="file"
          accept={item.constraints?.allowed_mime_types.join(',') || undefined}
          disabled={disabled || uploadMutation.isPending}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            setLocalFileName(file.name);
            uploadMutation.mutate(file);
          }}
        />
        {uploadMutation.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}
      </div>

      <Alert>
        <AlertCircle className="size-4" />
        <AlertDescription>
          Files are uploaded first, then included in the assessment draft when you save.
        </AlertDescription>
      </Alert>
    </div>
  );
}

export function FileUploadReviewDetail({ answer }: ItemReviewDetailProps<FileUploadAttemptItem, FileUploadAnswer | null>) {
  return (
    <div className="rounded-md border bg-card p-3 text-sm">
      <div className="font-medium">Uploaded file</div>
      <div className="text-muted-foreground mt-1">{answer?.file_key ?? 'No file recorded'}</div>
    </div>
  );
}

registerItemKind({
  kind: 'FILE_UPLOAD',
  label: 'File upload',
  Author: FileUploadConstraintsEditor,
  Attempt: FileUploadAttempt,
  ReviewDetail: FileUploadReviewDetail,
});
