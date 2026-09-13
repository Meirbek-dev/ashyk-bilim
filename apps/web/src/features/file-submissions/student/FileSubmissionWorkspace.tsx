'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileArchive,
  LoaderCircle,
  Paperclip,
  Send,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import type { Activity, CourseStructure } from '@components/Contexts/CourseContext'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { ErrorState } from '@/components/ui/error-state'
import Link from '@components/ui/AppLink'
import { hasErrorCode } from '@/lib/api/assertSuccess'
import { useSession } from '@/hooks/useSession'
import { Actions, Resources, Scopes } from '@/types/permissions'
import { cn } from '@/lib/utils'
import {
  getFileSubmissionByActivity,
  saveFileSubmissionDraft,
  startFileSubmissionDraft,
  submitFileSubmission,
  uploadSubmissionFile,
} from '@/features/file-submissions/services/file-submissions'
import type {
  FileSubmissionAttempt,
  FileSubmissionAttemptFile,
} from '@/features/file-submissions/services/file-submissions'
import { fromUnix } from '@/lib/api/contract'
import { refreshLearnerCourseState } from '@/features/learner-course/api'
import { queryKeys } from '@/lib/react-query/queryKeys'
import FileUploadSlot from './FileUploadSlot'
import type { PendingFileSlot } from './FileUploadSlot'
import FileSubmissionReceipt from './FileSubmissionReceipt'
import FileSubmissionResult from './FileSubmissionResult'
import { MarkdownContent } from '@/features/content-markdown'
import { getMimeCategories } from '@/features/file-submissions/mime-categories'
import { useApiError } from '@/hooks/useApiError'
import { usePercentFormat } from '@/features/assessments/shared/usePercentFormat'

// ── Types ─────────────────────────────────────────────────────────────────────

interface FileSubmissionWorkspaceProps {
  activity: Activity
  course: CourseStructure
}

const queryKey = (activityUuid: string) => ['file-submission', 'activity', activityUuid] as const

function fileSubmissionQueryOptions(activityUuid: string) {
  return queryOptions({
    queryKey: queryKey(activityUuid),
    queryFn: () => getFileSubmissionByActivity(activityUuid),
    enabled: Boolean(activityUuid),
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Why the picker refuses a file (size, then type), null when it is fine. */
export function fileRejection(
  file: File,
  allowedMimes: string[],
  maxMb: number | null | undefined,
): { key: 'fileTooLarge'; size: number } | { key: 'fileTypeNotAllowed'; type: string } | null {
  if (maxMb && file.size > maxMb * 1024 * 1024) return { key: 'fileTooLarge', size: maxMb }
  if (allowedMimes.length === 0) return null
  const allowed = allowedMimes.some(mime =>
    mime.endsWith('/*') ? file.type.startsWith(mime.slice(0, -1)) : file.type === mime,
  )
  return allowed ? null : { key: 'fileTypeNotAllowed', type: file.type || file.name.split('.').pop() || '?' }
}

function formatDueDate(unix: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(fromUnix(unix))
}

// ── Status badge config ───────────────────────────────────────────────────────

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline'

const STATUS_BADGE: Record<string, BadgeVariant> = {
  draft: 'secondary',
  submitted: 'default',
  graded: 'secondary',
  published: 'default',
  returned: 'destructive',
}

const LIFECYCLE_BADGE: Record<string, BadgeVariant> = {
  published: 'default',
  draft: 'secondary',
  archived: 'outline',
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * FileSubmissionWorkspace
 *
 * Student-facing file submission surface. State machine driven by the current
 * attempt status:
 *
 *  - no attempt        → file upload zone + start draft
 *  - draft / returned  → file list, upload zone, save/submit actions
 *  - submitted         → immutable receipt (FileSubmissionReceipt)
 *  - graded            → "Awaiting grade release" holding state
 *  - published         → grade + feedback (FileSubmissionResult)
 *
 * Files go through the presigned upload pipeline (`uploadFile`), which reports
 * per-byte progress from the storage PUT.
 */
export default function FileSubmissionWorkspace({ activity, course }: FileSubmissionWorkspaceProps) {
  const t = useTranslations('FileSubmission')
  const tCommon = useTranslations('Common')
  const activityUuid = activity.activity_uuid?.replace(/^activity_/, '') ?? ''
  const { can } = useSession()
  const canEditCourse =
    can(Resources.COURSE, Actions.UPDATE, Scopes.OWN) || can(Resources.COURSE, Actions.UPDATE, Scopes.APP)
  const queryClient = useQueryClient()
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [slots, setSlots] = useState<PendingFileSlot[]>([])
  const [confirmSubmit, setConfirmSubmit] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const { handleApiError, toastApiError } = useApiError()

  // ── Query ─────────────────────────────────────────────────────────────────

  const { data, error: queryError, isError, isLoading, refetch } = useQuery(fileSubmissionQueryOptions(activityUuid))

  const activeAttempt = data?.current_attempt ?? null
  const status = activeAttempt?.status ?? null
  const attachedFiles = activeAttempt?.files ?? []
  const maxFiles = data?.max_files ?? 1
  // Rejected slots are shown with their reason but never count or upload.
  const pendingSlots = useMemo(() => slots.filter(slot => slot.status !== 'rejected'), [slots])
  const totalSelected = attachedFiles.length + pendingSlots.length

  const canEdit = !status || status === 'draft' || status === 'returned'

  // Invalidate trail XP when grade is published so the progress bar updates
  useEffect(() => {
    if (status === 'published') {
      queryClient.invalidateQueries({ queryKey: queryKeys.trail.current() })
    }
  }, [status, queryClient])

  // ── File add ──────────────────────────────────────────────────────────────

  const addFiles = useCallback(
    (fileList: FileList | null) => {
      if (!data || !fileList) return
      const available = Math.max(maxFiles - totalSelected, 0)
      const accepted = [...fileList].slice(0, available)
      const rejected = [...fileList].slice(available)
      if (rejected.length) toast.error(t('maxFilesAllowed', { count: maxFiles }))
      // Each refused file stays in the list with its own reason (UX-036).
      setSlots(prev => [
        ...prev,
        ...accepted.map((f): PendingFileSlot => {
          const why = fileRejection(f, data.allowed_mime_types, data.max_file_size_mb)
          const slot: PendingFileSlot = {
            id: `${f.name}-${f.size}-${f.lastModified}-${crypto.randomUUID()}`,
            file: f,
            status: why ? 'rejected' : 'queued',
            progress: 0,
          }
          if (why) slot.error = t(why.key, why)
          return slot
        }),
      ])
    },
    [data, maxFiles, t, totalSelected, setSlots],
  )

  // ── Upload + save/submit ──────────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: async ({ submit }: { submit: boolean }) => {
      if (!data) throw new Error(t('notAvailable'))
      setIsUploading(true)

      // Ensure draft exists
      if (!activeAttempt) {
        await startFileSubmissionDraft(data.id)
      }

      // Upload pending slots
      const uploaded: PendingFileSlot[] = []

      const uploadSlot = async (slot: PendingFileSlot) => {
        if (slot.upload_id) {
          uploaded.push(slot)
          return
        }
        let errorMsg = ''
        setSlots(prev => prev.map(s => (s.id === slot.id ? { ...s, status: 'uploading', progress: 0 } : s)))
        try {
          const result = await uploadSubmissionFile(slot.file, ({ percentage }) => {
            setSlots(prev => prev.map(s => (s.id === slot.id ? { ...s, progress: percentage } : s)))
          })
          const done = {
            ...slot,
            upload_id: result.id,
            status: 'saved' as const,
            progress: 100,
          }
          setSlots(prev => prev.map(s => (s.id === slot.id ? done : s)))
          uploaded.push(done)
        } catch (error) {
          errorMsg = handleApiError(error, { fallback: t('uploadFailed') }).message
          setSlots(prev => prev.map(s => (s.id === slot.id ? { ...s, status: 'failed' as const, error: errorMsg } : s)))
          throw error
        }
      }

      for (const slot of pendingSlots) {
        await uploadSlot(slot)
      }

      const files = [
        ...attachedFiles.map((f: FileSubmissionAttemptFile) => ({
          upload_id: f.upload_id,
          display_name: f.filename,
        })),
        ...uploaded.map(s => ({
          upload_id: s.upload_id!,
          display_name: s.file.name,
        })),
      ]
      const version = activeAttempt?.version ?? null
      return submit ? submitFileSubmission(data.id, files, version) : saveFileSubmissionDraft(data.id, files, version)
    },
    onSuccess: async (_attempt, { submit }) => {
      setSlots([])
      setIsUploading(false)
      await queryClient.invalidateQueries({ queryKey: queryKey(activityUuid) })
      toast.success(submit ? t('submittedToast') : t('draftSavedToast'))
      if (submit) await refreshLearnerCourseState(queryClient, router)
    },
    onError: err => {
      setIsUploading(false)
      toastApiError(err, { fallback: t('saveFailed') })
    },
  })

  // A capped submission spends an attempt: confirm first (UX-036).
  const requestSubmit = () => {
    if (data?.max_attempts) setConfirmSubmit(true)
    else saveMutation.mutate({ submit: true })
  }
  const confirmDialog = data ? (
    <AlertDialog open={confirmSubmit} onOpenChange={setConfirmSubmit}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('confirmSubmitTitle')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('confirmSubmitDescription', {
              number: activeAttempt?.attempt_number ?? data.attempts.length + 1,
              max: data.max_attempts ?? 0,
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{tCommon('cancel')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              setConfirmSubmit(false)
              saveMutation.mutate({ submit: true })
            }}
          >
            {t('confirmSubmitAction')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  ) : null

  const startMutation = useMutation({
    mutationFn: async () => {
      if (!data) throw new Error(t('notAvailable'))
      return startFileSubmissionDraft(data.id)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKey(activityUuid) })
      inputRef.current?.click()
    },
    onError: err => {
      toastApiError(err, { fallback: t('startDraftFailed') })
    },
  })

  // ── Loading ───────────────────────────────────────────────────────────────

  // A published activity whose submission config was never created: the
  // contract answers 404, which is "not set up yet", not a failure.
  if (isError && hasErrorCode(queryError, 'not-found')) {
    return (
      <Empty className="min-h-52 border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileArchive />
          </EmptyMedia>
          <EmptyTitle>{t('notConfiguredTitle')}</EmptyTitle>
          <EmptyDescription>{t('notConfiguredDescription')}</EmptyDescription>
        </EmptyHeader>
        {canEditCourse ? (
          <Button
            variant="outline"
            nativeButton={false}
            render={
              <Link
                href={`/dash/courses/${course.course_uuid.replace(/^course_/, '')}/activity/${activityUuid}/studio`}
              />
            }
          >
            {t('openStudio')}
          </Button>
        ) : null}
      </Empty>
    )
  }

  if (isError) {
    const processed = handleApiError(queryError, { fallback: t('notAvailable') })
    return (
      <ErrorState
        actionLabel={processed.actionLabel}
        description={processed.message}
        error={queryError}
        {...(processed.showRetry
          ? {
              onAction: () => {
                void refetch()
              },
            }
          : {})}
        title={t('notAvailable')}
        variant="section"
      />
    )
  }

  if (isLoading || !data) {
    return (
      <div className="flex min-h-52 items-center justify-center">
        <LoaderCircle className="text-muted-foreground size-5 animate-spin" />
      </div>
    )
  }

  // ── State: submitted → receipt ─────────────────────────────────────────────

  if (status === 'submitted' && activeAttempt) {
    return (
      <div className="space-y-6">
        <FileSubmissionReceipt attempt={activeAttempt} />
        <SubmissionHistory attempts={data.attempts} />
      </div>
    )
  }

  // ── State: graded (not yet published) → waiting ────────────────────────────

  if (status === 'graded') {
    return (
      <div className="flex min-h-52 flex-col items-center justify-center gap-3">
        <Clock className="text-muted-foreground size-8" />
        <p className="text-muted-foreground text-sm">{t('gradedReleasePending')}</p>
      </div>
    )
  }

  // ── State: published → result ─────────────────────────────────────────────

  if ((status === 'published' || status === 'returned') && activeAttempt) {
    const showResult =
      status === 'published' || (status === 'returned' && typeof activeAttempt.final_score === 'number')
    const canRevise = status === 'returned'
    const handleRevise = canRevise
      ? async () => {
          await queryClient.invalidateQueries({
            queryKey: queryKey(activityUuid),
          })
        }
      : undefined

    return (
      <div className="space-y-6">
        {showResult ? (
          <FileSubmissionResult attempt={activeAttempt} {...(handleRevise ? { onRevise: handleRevise } : {})} />
        ) : null}
        {canRevise ? (
          <DraftEditor
            {...{
              data,
              attachedFiles,
              slots,
              setSlots,
              addFiles,
              inputRef,
              saveMutation,
              startMutation,
              requestSubmit,
              maxFiles,
              totalSelected,
              isUploading,
              canEdit: true,
              activeAttempt,
            }}
          />
        ) : null}
        {confirmDialog}
        <SubmissionHistory attempts={data.attempts} />
      </div>
    )
  }

  // ── State: DRAFT / no attempt → editor ────────────────────────────────────

  return (
    <div className="space-y-6">
      <Header
        instructions={data.instructions}
        allowedMimes={data.allowed_mime_types}
        maxFiles={maxFiles}
        lifecycle={data.lifecycle}
        attempt={activeAttempt}
        dueAt={data.due_at_unix ?? null}
        maxFileSizeMb={data.max_file_size_mb ?? null}
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
        requestSubmit={requestSubmit}
        maxFiles={maxFiles}
        totalSelected={totalSelected}
        isUploading={isUploading}
        canEdit={canEdit}
        activeAttempt={activeAttempt}
      />
      {confirmDialog}
      <SubmissionHistory attempts={data.attempts} />
    </div>
  )
}

// ── Header ─────────────────────────────────────────────────────────────────────

function Header({
  instructions,
  dueAt,
  allowedMimes,
  maxFiles,
  maxFileSizeMb,
  lifecycle,
  attempt,
}: {
  instructions: string
  dueAt: number | null
  allowedMimes: string[]
  maxFiles: number
  maxFileSizeMb: number | null
  lifecycle: string
  attempt: FileSubmissionAttempt | null
}) {
  const t = useTranslations('FileSubmission')
  const tMime = useTranslations('FileSubmission.mimeCategories')
  const tLifecycle = useTranslations('Features.Assessments.Studio.lifecycle')
  const categories = useMemo(() => getMimeCategories(allowedMimes), [allowedMimes])
  const lifecycleKey = lifecycle.toLowerCase()

  return (
    <div className="space-y-4">
      {/* ── Status strip ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant={LIFECYCLE_BADGE[lifecycleKey] ?? 'secondary'}>
          {tLifecycle.has(lifecycleKey) ? tLifecycle(lifecycleKey) : lifecycleKey}
        </Badge>
        {attempt ? <StatusBadge status={attempt.status} /> : null}
        {attempt?.is_late ? <Badge variant="destructive">{t('late')}</Badge> : null}
      </div>

      {/* ── Instructions ─────────────────────────────────────── */}
      {instructions ? (
        <MarkdownContent content={instructions} mode="taskDescription" className="text-foreground/90" />
      ) : null}

      {/* ── Metadata bar ─────────────────────────────────────── */}
      <div className="border-border bg-muted/30 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border px-4 py-3">
        {/* Due date */}
        {dueAt ? (
          <div className="flex items-center gap-1.5 text-sm">
            <CalendarClock className="text-muted-foreground size-3.5 shrink-0" />
            <span className="font-medium">{t('due', { date: formatDueDate(dueAt) })}</span>
          </div>
        ) : null}

        {/* Divider */}
        {dueAt ? <div className="bg-border hidden h-4 w-px sm:block" /> : null}

        {/* Max files */}
        <div className="flex items-center gap-1.5 text-sm">
          <CheckCircle2 className="text-primary size-3.5 shrink-0" />
          <span className="text-muted-foreground">{t('requirementMaxFiles', { count: maxFiles })}</span>
        </div>

        {/* Max size */}
        {maxFileSizeMb ? (
          <>
            <div className="bg-border hidden h-4 w-px sm:block" />
            <div className="flex items-center gap-1.5 text-sm">
              <CheckCircle2 className="text-primary size-3.5 shrink-0" />
              <span className="text-muted-foreground">{t('requirementMaxSize', { size: maxFileSizeMb })}</span>
            </div>
          </>
        ) : null}

        {/* Accepted formats */}
        {categories.length > 0 ? (
          <>
            <div className="bg-border hidden h-4 w-px sm:block" />
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-muted-foreground text-xs font-medium">{t('allowedTypes')}:</span>
              {categories.map(({ key, icon: Icon }) => (
                <span
                  key={key}
                  className="bg-background border-border text-foreground/70 flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium shadow-sm"
                >
                  <Icon className="size-3 shrink-0" />
                  {tMime(key)}
                </span>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
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
  requestSubmit,
  maxFiles,
  totalSelected,
  isUploading,
  canEdit,
  activeAttempt,
}: {
  data: Awaited<ReturnType<typeof getFileSubmissionByActivity>>
  attachedFiles: FileSubmissionAttemptFile[]
  slots: PendingFileSlot[]
  setSlots: React.Dispatch<React.SetStateAction<PendingFileSlot[]>>
  addFiles: (fl: FileList | null) => void
  inputRef: React.RefObject<HTMLInputElement | null>
  saveMutation: ReturnType<typeof useMutation<unknown, Error, { submit: boolean }>>
  startMutation: ReturnType<typeof useMutation<unknown, Error, void>>
  requestSubmit: () => void
  maxFiles: number
  totalSelected: number
  isUploading: boolean
  canEdit: boolean
  activeAttempt: FileSubmissionAttempt | null
}) {
  const t = useTranslations('FileSubmission')
  const busy = saveMutation.isPending || startMutation.isPending || isUploading
  const hasPending = slots.some(slot => slot.status !== 'rejected')
  const canSubmit = canEdit && (attachedFiles.length > 0 || hasPending) && !busy

  return (
    <>
      {/* Drop zone */}
      {canEdit ? (
        <div
          className={cn(
            'border-border bg-background hover:bg-muted/30 flex min-h-44 flex-col items-center justify-center rounded-md border border-dashed p-6 text-center transition-colors',
            busy && 'pointer-events-none opacity-70',
          )}
          onDragOver={e => e.preventDefault()}
          onDrop={e => {
            e.preventDefault()
            addFiles(e.dataTransfer.files)
          }}
        >
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            multiple={maxFiles > 1}
            accept={data.allowed_mime_types.join(',') || undefined}
            onChange={e => addFiles(e.target.files)}
          />
          <FileArchive className="text-muted-foreground mb-3 size-8" />
          <p className="text-sm font-medium">{t('dropzoneTitle')}</p>
          {/* Only show concise constraint summary — no raw extension list */}
          <p className="text-muted-foreground mt-1 text-xs">
            {[
              t('requirementMaxFiles', { count: maxFiles }),
              data.max_file_size_mb ? t('requirementMaxSize', { size: data.max_file_size_mb }) : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <Button
            className="mt-4"
            variant="outline"
            disabled={busy || totalSelected >= maxFiles}
            onClick={() => {
              if (activeAttempt) inputRef.current?.click()
              else startMutation.mutate()
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
        <div className="border-border bg-muted/30 rounded-md border p-4 text-sm">{t('submittedLocked')}</div>
      )}

      {/* Persisted files */}
      {attachedFiles.length > 0 ? (
        <div className="border-border rounded-md border">
          {attachedFiles.map(file => (
            <div key={file.id} className="flex items-center gap-3 border-b p-3 text-sm last:border-b-0">
              <CheckCircle2 className="text-primary size-4 shrink-0" />
              <span className="min-w-0 truncate">{file.filename}</span>
            </div>
          ))}
        </div>
      ) : null}

      {/* Pending upload slots */}
      {slots.length > 0 ? (
        <div className="border-border rounded-md border">
          {slots.map(slot => (
            <FileUploadSlot
              key={slot.id}
              slot={slot}
              onRemove={id => setSlots(prev => prev.filter(s => s.id !== id))}
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
            disabled={!canEdit || !hasPending || busy}
            onClick={() => saveMutation.mutate({ submit: false })}
          >
            {busy ? <LoaderCircle className="size-4 animate-spin" /> : null}
            {t('saveDraft')}
          </Button>
          <Button disabled={!canSubmit} onClick={requestSubmit}>
            {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}
            {t('submitFiles')}
          </Button>
        </div>
      </div>
    </>
  )
}

// ── SubmissionHistory ──────────────────────────────────────────────────────────

function SubmissionHistory({ attempts }: { attempts: FileSubmissionAttempt[] }) {
  const t = useTranslations('FileSubmission')
  const formatPercent = usePercentFormat()
  if (attempts.length === 0) return null
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">{t('submissionHistory')}</h3>
      <div className="divide-border border-border rounded-md border">
        {attempts.map(attempt => (
          <div key={attempt.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
            <div>
              <p className="font-medium">{t('attemptNumber', { number: attempt.attempt_number })}</p>
              <p className="text-muted-foreground text-xs">
                {attempt.submitted_at_unix
                  ? new Intl.DateTimeFormat(undefined, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }).format(fromUnix(attempt.submitted_at_unix))
                  : t('draft')}{' '}
                / {t('fileCount', { count: attempt.files.length })}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {attempt.final_score !== null && attempt.final_score !== undefined ? (
                <Badge variant="outline">{formatPercent(attempt.final_score)}</Badge>
              ) : null}
              <StatusBadge status={attempt.status} />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function StatusBadge({ status }: { status: string }) {
  const t = useTranslations('FileSubmission')
  const variant: BadgeVariant = STATUS_BADGE[status] ?? 'secondary'
  return (
    <Badge variant={variant} className="capitalize">
      {t(`status.${status.toLowerCase()}`)}
    </Badge>
  )
}
