'use client';

import type { Dispatch, SetStateAction } from 'react';
import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CalendarClock, CheckCircle2, FileArchive, Loader2, Paperclip, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import type { Activity, CourseStructure } from '@components/Contexts/CourseContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  getFileSubmissionByActivity,
  saveFileSubmissionDraft,
  startFileSubmissionDraft,
  submitFileSubmission,
  uploadSubmissionFile,
} from '@/features/file-submissions/services/file-submissions';
import type {
  FileSubmissionActivity as FileSubmissionActivityRead,
  FileSubmissionAttemptFile,
} from '@/features/file-submissions/services/file-submissions';
import { getFriendlyMimeName } from '@/lib/file-validation';

interface FileSubmissionActivityProps {
  activity: Activity;
  course: CourseStructure;
}

type UploadState = 'queued' | 'uploading' | 'saved' | 'failed';

interface PendingUpload {
  id: string;
  file: File;
  upload_uuid?: string;
  status: UploadState;
  error?: string;
}

const queryKey = (activityUuid: string) => ['file-submission', 'activity', activityUuid] as const;

export default function FileSubmissionActivity({ activity }: FileSubmissionActivityProps) {
  const activityUuid = activity.activity_uuid?.replace(/^activity_/, '') ?? '';
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PendingUpload[]>([]);

  const { data, isLoading, error } = useQuery({
    queryKey: queryKey(activityUuid),
    queryFn: () => getFileSubmissionByActivity(activityUuid),
    enabled: Boolean(activityUuid),
  });

  const saveMutation = useMutation({
    mutationFn: async ({ submit }: { submit: boolean }) => {
      if (!data) throw new Error('File submission is unavailable');
      const uploaded = await uploadPendingFiles(data, pending, setPending);
      const files = [
        ...(data.current_attempt?.files ?? []).map((file) => ({
          upload_uuid: file.upload_uuid,
          display_name: file.filename,
        })),
        ...uploaded.map((row) => ({
          upload_uuid: row.upload_uuid!,
          display_name: row.file.name,
        })),
      ];
      const currentVersion = data.current_attempt?.version ?? null;
      return submit
        ? await submitFileSubmission(data.file_submission_uuid, files, currentVersion)
        : await saveFileSubmissionDraft(data.file_submission_uuid, files, currentVersion);
    },
    onSuccess: async (_attempt, variables) => {
      setPending([]);
      await queryClient.invalidateQueries({ queryKey: queryKey(activityUuid) });
      toast.success(variables.submit ? 'Submission sent' : 'Draft saved');
    },
    onError: (mutationError) => {
      toast.error(mutationError instanceof Error ? mutationError.message : 'Unable to save submission');
    },
  });

  const startMutation = useMutation({
    mutationFn: async () => {
      if (!data) throw new Error('File submission is unavailable');
      return await startFileSubmissionDraft(data.file_submission_uuid);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKey(activityUuid) });
      inputRef.current?.click();
    },
    onError: (mutationError) => {
      toast.error(mutationError instanceof Error ? mutationError.message : 'Unable to start draft');
    },
  });

  const activeAttempt = data?.current_attempt ?? null;
  const attachedFiles = activeAttempt?.files ?? [];
  const totalSelected = attachedFiles.length + pending.length;
  const canEdit = !activeAttempt || activeAttempt.status === 'DRAFT' || activeAttempt.status === 'RETURNED';
  const canSubmit = canEdit && (attachedFiles.length > 0 || pending.length > 0) && !saveMutation.isPending;
  const requirements = useMemo(() => buildRequirements(data), [data]);

  function addFiles(fileList: FileList | null) {
    if (!data || !fileList) return;
    const nextFiles = [...fileList];
    const availableSlots = Math.max(data.max_files - totalSelected, 0);
    const accepted = nextFiles.slice(0, availableSlots);
    const rejected = nextFiles.slice(availableSlots);
    const invalid = accepted.filter((file) => !isAllowedFile(file, data));
    const valid = accepted.filter((file) => isAllowedFile(file, data));
    if (rejected.length > 0) toast.error(`Maximum ${data.max_files} file${data.max_files === 1 ? '' : 's'} allowed`);
    if (invalid.length > 0) toast.error('Some files do not match this activity requirements');
    setPending((rows) => [
      ...rows,
      ...valid.map((file) => ({
        id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
        file,
        status: 'queued' as const,
      })),
    ]);
  }

  if (isLoading) {
    return (
      <div className="text-muted-foreground flex min-h-64 items-center justify-center text-sm">
        <Loader2 className="mr-2 size-4 animate-spin" />
        Loading file submission
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="border-border bg-muted/30 rounded-md border p-5 text-sm">
        <p className="font-medium">File submission is unavailable.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={data.lifecycle === 'PUBLISHED' ? 'default' : 'secondary'}>
              {data.lifecycle.toLowerCase()}
            </Badge>
            {activeAttempt ? <AttemptStatusBadge status={activeAttempt.status} /> : null}
            {activeAttempt?.is_late ? <Badge variant="destructive">Late</Badge> : null}
          </div>
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <p className="text-sm leading-6 whitespace-pre-wrap">{data.instructions}</p>
          </div>
        </div>
        <div className="border-border bg-muted/20 grid min-w-64 gap-2 rounded-md border p-4 text-sm">
          {data.due_at ? (
            <div className="flex items-center gap-2">
              <CalendarClock className="text-muted-foreground size-4" />
              <span>Due {formatDate(data.due_at)}</span>
            </div>
          ) : null}
          {requirements.map((requirement) => (
            <div
              className="text-muted-foreground flex items-center gap-2"
              key={requirement}
            >
              <CheckCircle2 className="size-4 text-emerald-600" />
              <span>{requirement}</span>
            </div>
          ))}
        </div>
      </div>

      {canEdit ? (
        <div
          className={cn(
            'border-border bg-background hover:bg-muted/30 flex min-h-44 flex-col items-center justify-center rounded-md border border-dashed p-6 text-center transition-colors',
            saveMutation.isPending && 'pointer-events-none opacity-70',
          )}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            addFiles(event.dataTransfer.files);
          }}
        >
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            multiple={data.max_files > 1}
            accept={data.allowed_mime_types.join(',') || undefined}
            onChange={(event) => addFiles(event.target.files)}
          />
          <FileArchive className="text-muted-foreground mb-3 size-8" />
          <p className="text-sm font-medium">Drop files here or choose from your device</p>
          <p className="text-muted-foreground mt-1 text-xs">{requirements.join(' · ')}</p>
          <Button
            className="mt-4"
            variant="outline"
            onClick={() => {
              if (activeAttempt) inputRef.current?.click();
              else startMutation.mutate();
            }}
            disabled={startMutation.isPending || totalSelected >= data.max_files}
          >
            {startMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}
            Choose files
          </Button>
        </div>
      ) : (
        <div className="border-border bg-muted/30 rounded-md border p-4 text-sm">
          Your latest attempt has been submitted. New files can be added if the teacher returns it for revision.
        </div>
      )}

      <FileList
        attachedFiles={attachedFiles}
        pending={pending}
        onRemovePending={(id) => setPending((rows) => rows.filter((row) => row.id !== id))}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground flex items-center gap-2 text-xs">
          <AlertCircle className="size-3.5" />
          Submit only final files. Saving a draft keeps files private until you submit.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => saveMutation.mutate({ submit: false })}
            disabled={!canEdit || pending.length === 0 || saveMutation.isPending}
          >
            {saveMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Save draft
          </Button>
          <Button
            onClick={() => saveMutation.mutate({ submit: true })}
            disabled={!canSubmit}
          >
            {saveMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Submit files
          </Button>
        </div>
      </div>

      {data.attempts.length > 0 ? (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Submission history</h3>
          <div className="divide-border rounded-md border">
            {data.attempts.map((attempt) => (
              <div
                key={attempt.attempt_uuid}
                className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm"
              >
                <div>
                  <p className="font-medium">Attempt {attempt.attempt_number}</p>
                  <p className="text-muted-foreground text-xs">
                    {attempt.submitted_at ? formatDate(attempt.submitted_at) : 'Draft'} · {attempt.files.length} file
                    {attempt.files.length === 1 ? '' : 's'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {attempt.final_score !== null ? <Badge variant="outline">{attempt.final_score}%</Badge> : null}
                  <AttemptStatusBadge status={attempt.status} />
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function FileList({
  attachedFiles,
  pending,
  onRemovePending,
}: {
  attachedFiles: FileSubmissionAttemptFile[];
  pending: PendingUpload[];
  onRemovePending: (id: string) => void;
}) {
  const rows = [
    ...attachedFiles.map((file) => ({
      id: file.attempt_file_uuid,
      name: file.filename,
      size: file.size_bytes ?? 0,
      status: file.scan_status.toLowerCase(),
      persisted: true,
    })),
    ...pending.map((file) => ({
      id: file.id,
      name: file.file.name,
      size: file.file.size,
      status: file.status,
      persisted: false,
    })),
  ];

  if (rows.length === 0) return null;

  return (
    <div className="divide-border rounded-md border">
      {rows.map((row) => (
        <div
          key={row.id}
          className="flex items-center justify-between gap-3 p-3 text-sm"
        >
          <div className="flex min-w-0 items-center gap-3">
            <Paperclip className="text-muted-foreground size-4 shrink-0" />
            <div className="min-w-0">
              <p className="truncate font-medium">{row.name}</p>
              <p className="text-muted-foreground text-xs">
                {formatBytes(row.size)} · {row.status}
              </p>
            </div>
          </div>
          {!row.persisted ? (
            <button
              type="button"
              className="text-muted-foreground hover:text-destructive rounded-md p-2"
              onClick={() => onRemovePending(row.id)}
              aria-label="Remove file"
            >
              <Trash2 className="size-4" />
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

async function uploadPendingFiles(
  data: FileSubmissionActivityRead,
  pending: PendingUpload[],
  setPending: Dispatch<SetStateAction<PendingUpload[]>>,
): Promise<PendingUpload[]> {
  if (!data.current_attempt) {
    await startFileSubmissionDraft(data.file_submission_uuid);
  }
  const result: PendingUpload[] = [];
  for (const row of pending) {
    if (row.upload_uuid) {
      result.push(row);
      continue;
    }
    setPending((rows) =>
      rows.map((candidate) => (candidate.id === row.id ? { ...candidate, status: 'uploading' } : candidate)),
    );
    try {
      const uploaded = await uploadSubmissionFile(row.file);
      const next = {
        ...row,
        upload_uuid: uploaded.upload_uuid,
        status: 'saved' as UploadState,
      };
      setPending((rows) => rows.map((candidate) => (candidate.id === row.id ? next : candidate)));
      result.push(next);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload failed';
      setPending((rows) =>
        rows.map((candidate) =>
          candidate.id === row.id ? { ...candidate, status: 'failed', error: message } : candidate,
        ),
      );
      throw error;
    }
  }
  return result;
}

function isAllowedFile(file: File, data: FileSubmissionActivityRead): boolean {
  if (data.max_file_size_mb && file.size > data.max_file_size_mb * 1024 * 1024) return false;
  if (data.allowed_mime_types.length === 0) return true;
  return data.allowed_mime_types.some((mime) => {
    if (mime.endsWith('/*')) return file.type.startsWith(mime.slice(0, -1));
    return file.type === mime;
  });
}

function buildRequirements(data?: FileSubmissionActivityRead): string[] {
  if (!data) return [];
  const requirements = [`Up to ${data.max_files} file${data.max_files === 1 ? '' : 's'}`];
  if (data.max_file_size_mb) requirements.push(`${data.max_file_size_mb} MB each`);
  if (data.allowed_mime_types.length > 0)
    requirements.push(data.allowed_mime_types.map(getFriendlyMimeName).join(', '));
  return requirements;
}

function AttemptStatusBadge({ status }: { status: string }) {
  const variant = status === 'SUBMITTED' ? 'default' : status === 'RETURNED' ? 'destructive' : 'secondary';
  return <Badge variant={variant}>{status.toLowerCase()}</Badge>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatBytes(bytes: number) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}
