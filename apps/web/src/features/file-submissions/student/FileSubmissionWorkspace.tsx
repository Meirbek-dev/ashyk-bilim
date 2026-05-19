'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CalendarClock, CheckCircle2, Clock, FileArchive, LoaderCircle, Paperclip, Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import type { Activity, CourseStructure } from '@components/Contexts/CourseContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getFriendlyMimeName } from '@/lib/file-validation';
import {
  getFileSubmissionByActivity,
  saveFileSubmissionDraft,
  startFileSubmissionDraft,
  submitFileSubmission,
  uploadSubmissionFileWithProgress,
} from '@/features/file-submissions/services/file-submissions';
import type { FileSubmissionAttempt, FileSubmissionAttemptFile } from '@/features/file-submissions/services/file-submissions';
import { queryKeys } from '@/lib/react-query/queryKeys';
import FileUploadSlot from './FileUploadSlot';
import type { PendingFileSlot } from './FileUploadSlot';
import FileSubmissionReceipt from './FileSubmissionReceipt';
import FileSubmissionResult from './FileSubmissionResult';

// ── Types ─────────────────────────────────────────────────────────────────────

interface FileSubmissionWorkspaceProps {
  activity: Activity;
  course: CourseStructure;
}

const queryKey = (activityUuid: string) => ['file-submission', 'activity', activityUuid] as const;

function fileSubmissionQueryOptions(activityUuid: string) {
  return queryOptions({
    queryKey: queryKey(activityUuid),
    queryFn: () => getFileSubmissionByActivity(activityUuid),
    enabled: Boolean(activityUuid),
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isAllowedFile(file: File, allowedMimes: string[], maxMb?: number | null): boolean {
  if (maxMb && file.size > maxMb * 1024 * 1024) return false;
  if (allowedMimes.length === 0) return true;
  return allowedMimes.some((mime) => {
    if (mime.endsWith('/*')) return file.type.startsWith(mime.slice(0, -1));
    return file.type === mime;
  });
}

function formatDueDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * FileSubmissionWorkspace
 *
 * Student-facing file submission surface. State machine driven by the current
 * attempt status:
 *
 *  - PREFLIGHT / no attempt → file upload zone + start draft
 *  - DRAFT / RETURNED      → file list, upload zone, save/submit actions
 *  - SUBMITTED             → immutable receipt (FileSubmissionReceipt)
 *  - GRADED                → "Awaiting grade release" holding state
 *  - PUBLISHED             → grade + feedback (FileSubmissionResult)
 *
 * Files are uploaded using XHR so per-byte progress events are available.
 */
export default function FileSubmissionWorkspace({ activity }: FileSubmissionWorkspaceProps) {
  const t = useTranslations('FileSubmission');
  const activityUuid = activity.activity_uuid?.replace(/^activity_/, '') ?? '';
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [slots, setSlots] = useState<PendingFileSlot[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  // ── Query ─────────────────────────────────────────────────────────────────

  const { data, isLoading } = useQuery(fileSubmissionQueryOptions(activityUuid));

  const activeAttempt = data?.current_attempt ?? null;
  const status = activeAttempt?.status ?? null;
  const attachedFiles = activeAttempt?.files ?? [];
  const maxFiles = data?.max_files ?? 1;
  const totalSelected = attachedFiles.length + slots.length;

  const canEdit = !status || status === 'DRAFT' || status === 'RETURNED';
  const requirements = useMemo(
    () => {
      const list = [t('requirementMaxFiles', { count: maxFiles })];
      if (data?.max_file_size_mb) list.push(t('requirementMaxSize', { size: data.max_file_size_mb }));
      if (data?.allowed_mime_types?.length) list.push(data.allowed_mime_types.map(getFriendlyMimeName).join(', '));
      return list;
    },
    [data?.allowed_mime_types, data?.max_file_size_mb, maxFiles, t],
  );

  // Invalidate trail XP when grade is published so the progress bar updates
  useEffect(() => {
    if (status === 'PUBLISHED') {
      queryClient.invalidateQueries({ queryKey: queryKeys.trail.current() });
    }
  }, [status, queryClient]);

  // ── File add ──────────────────────────────────────────────────────────────

  const addFiles = useCallback(
    (fileList: FileList | null) => {
      if (!data || !fileList) return;
      const available = Math.max(maxFiles - totalSelected, 0);
      const accepted = [...fileList].slice(0, available);
      const rejected = [...fileList].slice(available);
      const valid = accepted.filter((f) => isAllowedFile(f, data.allowed_mime_types, data.max_file_size_mb));
      const invalid = accepted.filter((f) => !isAllowedFile(f, data.allowed_mime_types, data.max_file_size_mb));
      if (rejected.length) toast.error(t('maxFilesAllowed', { count: maxFiles }));
      if (invalid.length) toast.error(t('invalidFiles'));
      setSlots((prev) => [
        ...prev,
        ...valid.map((f) => ({
          id: `${f.name}-${f.size}-${f.lastModified}-${crypto.randomUUID()}`,
          file: f,
          status: 'queued' as const,
          progress: 0,
        })),
      ]);
    },
    [data, maxFiles, t, totalSelected],
  );

  // ── Upload + save/submit ──────────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: async ({ submit }: { submit: boolean }) => {
      if (!data) throw new Error(t('notAvailable'));
      setIsUploading(true);

      // Ensure draft exists
      if (!activeAttempt) {
        await startFileSubmissionDraft(data.file_submission_uuid);
      }

      // Upload pending slots
      const uploaded: PendingFileSlot[] = [];
      for (const slot of slots) {
        if (slot.upload_uuid) {
          uploaded.push(slot);
          continue;
        }
        setSlots((prev) => prev.map((s) => (s.id === slot.id ? { ...s, status: 'uploading', progress: 0 } : s)));
        try {
          const result = await uploadSubmissionFileWithProgress(slot.file, (loaded, total) => {
            const pct = total > 0 ? Math.round((loaded / total) * 100) : 0;
            setSlots((prev) => prev.map((s) => (s.id === slot.id ? { ...s, progress: pct } : s)));
          });
          const done = { ...slot, upload_uuid: result.upload_uuid, status: 'saved' as const, progress: 100 };
          setSlots((prev) => prev.map((s) => (s.id === slot.id ? done : s)));
          uploaded.push(done);
        } catch (err) {
          const msg = err instanceof Error ? err.message : t('uploadFailed');
          setSlots((prev) => prev.map((s) => (s.id === slot.id ? { ...s, status: 'failed', error: msg } : s)));
          throw err;
        }
      }

      const files = [
        ...attachedFiles.map((f: FileSubmissionAttemptFile) => ({ upload_uuid: f.upload_uuid, display_name: f.filename })),
        ...uploaded.map((s) => ({ upload_uuid: s.upload_uuid!, display_name: s.file.name })),
      ];
      const version = activeAttempt?.version ?? null;
      return submit
        ? submitFileSubmission(data.file_submission_uuid, files, version)
        : saveFileSubmissionDraft(data.file_submission_uuid, files, version);
    },
    onSuccess: async (_attempt, { submit }) => {
      setSlots([]);
      setIsUploading(false);
      await queryClient.invalidateQueries({ queryKey: queryKey(activityUuid) });
      toast.success(submit ? t('submittedToast') : t('draftSavedToast'));
    },
    onError: (err) => {
      setIsUploading(false);
      toast.error(err instanceof Error ? err.message : t('saveFailed'));
    },
  });

  const startMutation = useMutation({
    mutationFn: async () => {
      if (!data) throw new Error(t('notAvailable'));
      return startFileSubmissionDraft(data.file_submission_uuid);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKey(activityUuid) });
      inputRef.current?.click();
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : t('startDraftFailed'));
    },
  });

  // ── Loading ───────────────────────────────────────────────────────────────

  if (isLoading || !data) {
    return (
      <div className="flex min-h-52 items-center justify-center">
        <LoaderCircle className="text-muted-foreground size-5 animate-spin" />
      </div>
    );
  }

  // ── State: submitted → receipt ─────────────────────────────────────────────

  if (status === 'SUBMITTED' && activeAttempt) {
    return (
      <div className="space-y-6">
        <FileSubmissionReceipt attempt={activeAttempt} />
        <SubmissionHistory attempts={data.attempts} />
      </div>
    );
  }

  // ── State: graded (not yet published) → waiting ────────────────────────────

  if (status === 'GRADED') {
    return (
      <div className="flex min-h-52 flex-col items-center justify-center gap-3">
        <Clock className="text-muted-foreground size-8" />
        <p className="text-muted-foreground text-sm">{t('gradedReleasePending')}</p>
      </div>
    );
  }

  // ── State: published → result ─────────────────────────────────────────────

  if ((status === 'PUBLISHED' || status === 'RETURNED') && activeAttempt) {
    const showResult = status === 'PUBLISHED' || (status === 'RETURNED' && activeAttempt.final_score !== null);
    const canRevise = status === 'RETURNED';
    return (
      <div className="space-y-6">
        {showResult ? (
          <FileSubmissionResult
            attempt={activeAttempt}
            onRevise={
              canRevise
                ? async () => {
                    await queryClient.invalidateQueries({ queryKey: queryKey(activityUuid) });
                  }
                : undefined
            }
          />
        ) : null}
        {canRevise ? <DraftEditor {...{ data, attachedFiles, slots, setSlots, addFiles, inputRef, saveMutation, startMutation, requirements, maxFiles, totalSelected, isUploading, canEdit: true, activeAttempt }} /> : null}
        <SubmissionHistory attempts={data.attempts} />
      </div>
    );
  }

  // ── State: DRAFT / no attempt → editor ────────────────────────────────────

  return (
    <div className="space-y-6">
      <Header
        instructions={data.instructions}
        dueAt={data.due_at}
        requirements={requirements}
        lifecycle={data.lifecycle}
        attempt={activeAttempt}
      />
      <DraftEditor
        data={data}
        attachedFiles={attachedFiles}
        slots={slots}
        setSlots={setSlots}
        addFiles={addFiles}
        inputRef={inputRef}
        saveMutation={saveMutation}
        startMutation={startMutation}
        requirements={requirements}
        maxFiles={maxFiles}
        totalSelected={totalSelected}
        isUploading={isUploading}
        canEdit={canEdit}
        activeAttempt={activeAttempt}
      />
      <SubmissionHistory attempts={data.attempts} />
    </div>
  );
}

// ── Header ─────────────────────────────────────────────────────────────────────

function Header({
  instructions,
  dueAt,
  requirements,
  lifecycle,
  attempt,
}: {
  instructions: string;
  dueAt?: string | null;
  requirements: string[];
  lifecycle: string;
  attempt: FileSubmissionAttempt | null;
}) {
  const t = useTranslations('FileSubmission');
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={lifecycle === 'PUBLISHED' ? 'default' : 'secondary'}>{lifecycle.toLowerCase()}</Badge>
          {attempt ? <StatusBadge status={attempt.status} /> : null}
          {attempt?.is_late ? <Badge variant="destructive">{t('late')}</Badge> : null}
        </div>
        <p className="text-sm leading-6 whitespace-pre-wrap">{instructions}</p>
      </div>
      <div className="border-border bg-muted/20 grid min-w-64 gap-2 rounded-md border p-4 text-sm">
        {dueAt ? (
          <div className="flex items-center gap-2">
            <CalendarClock className="text-muted-foreground size-4" />
            <span>{t('due', { date: formatDueDate(dueAt) })}</span>
          </div>
        ) : null}
        {requirements.map((req) => (
          <div
            key={req}
            className="text-muted-foreground flex items-center gap-2"
          >
            <CheckCircle2 className="text-primary size-4" />
            <span>{req}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── DraftEditor ────────────────────────────────────────────────────────────────

function DraftEditor({
  data,
  attachedFiles,
  slots,
  setSlots,
  addFiles,
  inputRef,
  saveMutation,
  startMutation,
  requirements,
  maxFiles,
  totalSelected,
  isUploading,
  canEdit,
  activeAttempt,
}: {
  data: Awaited<ReturnType<typeof getFileSubmissionByActivity>>;
  attachedFiles: FileSubmissionAttemptFile[];
  slots: PendingFileSlot[];
  setSlots: React.Dispatch<React.SetStateAction<PendingFileSlot[]>>;
  addFiles: (fl: FileList | null) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  saveMutation: ReturnType<typeof useMutation<unknown, Error, { submit: boolean }>>;
  startMutation: ReturnType<typeof useMutation<unknown, Error, void>>;
  requirements: string[];
  maxFiles: number;
  totalSelected: number;
  isUploading: boolean;
  canEdit: boolean;
  activeAttempt: FileSubmissionAttempt | null;
}) {
  const t = useTranslations('FileSubmission');
  const busy = saveMutation.isPending || startMutation.isPending || isUploading;
  const canSubmit = canEdit && (attachedFiles.length > 0 || slots.length > 0) && !busy;

  return (
    <>
      {/* Drop zone */}
      {canEdit ? (
        <div
          className={cn(
            'border-border bg-background hover:bg-muted/30 flex min-h-44 flex-col items-center justify-center rounded-md border border-dashed p-6 text-center transition-colors',
            busy && 'pointer-events-none opacity-70',
          )}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            addFiles(e.dataTransfer.files);
          }}
        >
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            multiple={maxFiles > 1}
            accept={data.allowed_mime_types.join(',') || undefined}
            onChange={(e) => addFiles(e.target.files)}
          />
          <FileArchive className="text-muted-foreground mb-3 size-8" />
          <p className="text-sm font-medium">{t('dropzoneTitle')}</p>
          <p className="text-muted-foreground mt-1 text-xs">{requirements.join(' / ')}</p>
          <Button
            className="mt-4"
            variant="outline"
            disabled={busy || totalSelected >= maxFiles}
            onClick={() => {
              if (activeAttempt) inputRef.current?.click();
              else startMutation.mutate();
            }}
          >
            {startMutation.isPending ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Paperclip className="size-4" />
            )}
            {t('chooseFiles')}
          </Button>
        </div>
      ) : (
        <div className="border-border bg-muted/30 rounded-md border p-4 text-sm">
          {t('submittedLocked')}
        </div>
      )}

      {/* Persisted files */}
      {attachedFiles.length > 0 ? (
        <div className="border-border rounded-md border">
          {attachedFiles.map((file) => (
            <div
              key={file.attempt_file_uuid}
              className="flex items-center gap-3 border-b p-3 text-sm last:border-b-0"
            >
              <CheckCircle2 className="text-primary size-4 shrink-0" />
              <span className="min-w-0 truncate">{file.filename}</span>
            </div>
          ))}
        </div>
      ) : null}

      {/* Pending upload slots */}
      {slots.length > 0 ? (
        <div className="border-border rounded-md border">
          {slots.map((slot) => (
            <FileUploadSlot
              key={slot.id}
              slot={slot}
              onRemove={(id) => setSlots((prev) => prev.filter((s) => s.id !== id))}
              readonly={busy}
            />
          ))}
        </div>
      ) : null}

      {/* Action bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground flex items-center gap-2 text-xs">
          <AlertCircle className="size-3.5" />
          {t('submitHelp')}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            disabled={!canEdit || slots.length === 0 || busy}
            onClick={() => saveMutation.mutate({ submit: false })}
          >
            {busy ? <LoaderCircle className="size-4 animate-spin" /> : null}
            {t('saveDraft')}
          </Button>
          <Button
            disabled={!canSubmit}
            onClick={() => saveMutation.mutate({ submit: true })}
          >
            {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}
            {t('submitFiles')}
          </Button>
        </div>
      </div>
    </>
  );
}

// ── SubmissionHistory ──────────────────────────────────────────────────────────

function SubmissionHistory({
  attempts,
}: {
  attempts: FileSubmissionAttempt[];
}) {
  const t = useTranslations('FileSubmission');
  if (attempts.length === 0) return null;
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">{t('submissionHistory')}</h3>
      <div className="divide-border border-border rounded-md border">
        {attempts.map((attempt) => (
          <div
            key={attempt.attempt_uuid}
            className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm"
          >
            <div>
              <p className="font-medium">{t('attemptNumber', { number: attempt.attempt_number })}</p>
              <p className="text-muted-foreground text-xs">
                {attempt.submitted_at
                  ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(attempt.submitted_at))
                  : t('draft')}{' '}
                / {t('fileCount', { count: attempt.files.length })}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {attempt.final_score !== null && attempt.final_score !== undefined ? (
                <Badge variant="outline">{attempt.final_score}%</Badge>
              ) : null}
              <StatusBadge status={attempt.status} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function StatusBadge({ status }: { status: string }) {
  const t = useTranslations('FileSubmission');
  const variant =
    status === 'SUBMITTED' ? 'default' : status === 'RETURNED' ? 'destructive' : 'secondary';
  return <Badge variant={variant}>{t(`status.${status.toLowerCase()}`)}</Badge>;
}
