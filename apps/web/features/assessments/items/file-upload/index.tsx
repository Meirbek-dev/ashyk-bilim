'use client';

import { AlertCircle, Download, File, LoaderCircle, UploadCloud } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import { getTaskFileSubmissionDir, getTaskRefFileDir } from '@services/media/media';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Link from '@components/ui/AppLink';
import { apiFetch } from '@/lib/api-client';

import { registerItemKind } from '../registry';
import type { ItemAuthorProps, ItemAttemptProps, ItemReviewDetailProps } from '../registry';

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
  kind?: 'FILE_UPLOAD';
  task_uuid?: string;
  content_type?: 'file';
  file_key?: string | null;
  files?: { upload_id: string; filename: string }[];
}

async function sha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function responseError(response: Response, fallback: string): Promise<Error> {
  try {
    const data = await response.json();
    return new Error(typeof data?.detail === 'string' ? data.detail : data?.detail?.message || fallback);
  } catch {
    return new Error(fallback);
  }
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

export function FileUploadConstraintsEditor({ value, disabled, onChange }: ItemAuthorProps<FileUploadConstraints>) {
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
            onChange={(event) => onChange({ ...value, max_files: Math.max(1, Number(event.target.value) || 1) })}
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
  const uploadFile = answer?.files?.[0];
  const fileKey = answer?.file_key ?? uploadFile?.upload_id ?? '';

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (item.constraints?.max_file_size_mb && file.size > item.constraints.max_file_size_mb * 1024 * 1024) {
        throw new Error(`File exceeds ${item.constraints.max_file_size_mb} MB`);
      }
      if (item.constraints?.allowed_mime_types.length && !item.constraints.allowed_mime_types.includes(file.type)) {
        throw new Error('File type is not allowed for this item');
      }

      const createResponse = await apiFetch('uploads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          content_type: file.type,
          size: file.size,
        }),
      });
      if (!createResponse.ok) throw await responseError(createResponse, 'Upload could not be created');
      const created = (await createResponse.json()) as { upload_id: string; put_url: string };

      const putResponse = await apiFetch(created.put_url, {
        method: 'PUT',
        headers: file.type ? { 'Content-Type': file.type } : undefined,
        body: file,
        timeoutMs: false,
      });
      if (!putResponse.ok) throw await responseError(putResponse, 'Upload failed');

      const digest = await sha256(file);
      const finalizeResponse = await apiFetch(`uploads/${created.upload_id}/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sha256: digest, content_type: file.type }),
      });
      if (!finalizeResponse.ok) throw await responseError(finalizeResponse, 'Upload finalize failed');
      return { upload_id: created.upload_id, filename: file.name };
    },
    onSuccess: (uploaded) => {
      onAnswerChange({
        kind: 'FILE_UPLOAD',
        task_uuid: item.taskUuid,
        content_type: 'file',
        file_key: uploaded.upload_id,
        files: [uploaded],
      });
      toast.success('File attached to this draft.');
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
    <div className="bg-muted/30 space-y-4 rounded-md border p-4">
      {referenceUrl ? (
        <Button
          variant="outline"
          render={
            <Link
              href={referenceUrl}
              target="_blank"
              download
            />
          }
        >
          <Download className="size-4" />
          Reference file
        </Button>
      ) : null}

      {fileUrl ? (
        <Button
          variant="outline"
          render={
            <Link
              href={fileUrl}
              target="_blank"
            />
          }
        >
          <File className="size-4" />
          Current file
        </Button>
      ) : localFileName ? (
        <div className="bg-background inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
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
        {uploadMutation.isPending ? (
          <LoaderCircle className="size-4 animate-spin" />
        ) : (
          <UploadCloud className="size-4" />
        )}
      </div>

      <Alert>
        <AlertCircle className="size-4" />
        <AlertDescription>
          File is verified before it is attached to this draft.
        </AlertDescription>
      </Alert>
    </div>
  );
}

export function FileUploadReviewDetail({
  answer,
}: ItemReviewDetailProps<FileUploadAttemptItem, FileUploadAnswer | null>) {
  return (
    <div className="bg-card rounded-md border p-3 text-sm">
      <div className="font-medium">Uploaded file</div>
      <div className="text-muted-foreground mt-1">{answer?.files?.[0]?.filename ?? answer?.file_key ?? 'No file recorded'}</div>
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
