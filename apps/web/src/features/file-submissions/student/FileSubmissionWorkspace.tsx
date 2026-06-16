'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileArchive,
  FileCode2,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  LoaderCircle,
  Paperclip,
  Send,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import type { Activity, CourseStructure } from '@components/Contexts/CourseContext'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  getFileSubmissionByActivity,
  saveFileSubmissionDraft,
  startFileSubmissionDraft,
  submitFileSubmission,
  uploadSubmissionFileWithProgress,
} from '@/features/file-submissions/services/file-submissions'
import type {
  FileSubmissionAttempt,
  FileSubmissionAttemptFile,
} from '@/features/file-submissions/services/file-submissions'
import { queryKeys } from '@/lib/react-query/queryKeys'
import FileUploadSlot from './FileUploadSlot'
import type { PendingFileSlot } from './FileUploadSlot'
import FileSubmissionReceipt from './FileSubmissionReceipt'
import FileSubmissionResult from './FileSubmissionResult'
import { MarkdownContent } from '@/features/content-markdown'

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

function isAllowedFile(file: File, allowedMimes: string[], maxMb?: number | null): boolean {
  if (maxMb && file.size > maxMb * 1024 * 1024) return false
  if (allowedMimes.length === 0) return true
  return allowedMimes.some(mime => {
    if (mime.endsWith('/*')) return file.type.startsWith(mime.slice(0, -1))
    return file.type === mime
  })
}

function formatDueDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

// ── File category detection ───────────────────────────────────────────────────

/** Groups raw MIME types into human-readable category labels with icons. */
interface FileCategory {
  label: string
  icon: React.ElementType
}

const MIME_CATEGORY_MAP: { prefix: string; category: FileCategory }[] = [
  { prefix: 'image/', category: { label: 'Изображения', icon: FileImage } },
  { prefix: 'video/', category: { label: 'Видео', icon: FileVideo } },
  { prefix: 'audio/', category: { label: 'Аудио', icon: FileVideo } },
  {
    prefix: 'text/x-python',
    category: { label: 'Код', icon: FileCode2 },
  },
  {
    prefix: 'text/javascript',
    category: { label: 'Код', icon: FileCode2 },
  },
  {
    prefix: 'text/typescript',
    category: { label: 'Код', icon: FileCode2 },
  },
  { prefix: 'text/x-c', category: { label: 'Код', icon: FileCode2 } },
  { prefix: 'text/x-java', category: { label: 'Код', icon: FileCode2 } },
  { prefix: 'text/css', category: { label: 'Код', icon: FileCode2 } },
  { prefix: 'text/html', category: { label: 'Код', icon: FileCode2 } },
  { prefix: 'application/xml', category: { label: 'Код', icon: FileCode2 } },
  { prefix: 'text/plain', category: { label: 'Текст', icon: FileText } },
  { prefix: 'text/markdown', category: { label: 'Текст', icon: FileText } },
  { prefix: 'application/json', category: { label: 'Текст', icon: FileText } },
  { prefix: 'application/pdf', category: { label: 'Документы', icon: FileText } },
  {
    prefix: 'application/msword',
    category: { label: 'Документы', icon: FileText },
  },
  {
    prefix: 'application/vnd.openxmlformats-officedocument.wordprocessingml',
    category: { label: 'Документы', icon: FileText },
  },
  {
    prefix: 'application/vnd.oasis.opendocument.text',
    category: { label: 'Документы', icon: FileText },
  },
  { prefix: 'application/rtf', category: { label: 'Документы', icon: FileText } },
  { prefix: 'application/epub', category: { label: 'Документы', icon: FileText } },
  {
    prefix: 'application/x-mobipocket',
    category: { label: 'Документы', icon: FileText },
  },
  {
    prefix: 'text/csv',
    category: { label: 'Таблицы', icon: FileSpreadsheet },
  },
  {
    prefix: 'application/vnd.ms-excel',
    category: { label: 'Таблицы', icon: FileSpreadsheet },
  },
  {
    prefix: 'application/vnd.openxmlformats-officedocument.spreadsheetml',
    category: { label: 'Таблицы', icon: FileSpreadsheet },
  },
  {
    prefix: 'application/vnd.oasis.opendocument.spreadsheet',
    category: { label: 'Таблицы', icon: FileSpreadsheet },
  },
  {
    prefix: 'application/vnd.ms-powerpoint',
    category: { label: 'Презентации', icon: FileText },
  },
  {
    prefix: 'application/vnd.openxmlformats-officedocument.presentationml',
    category: { label: 'Презентации', icon: FileText },
  },
  { prefix: 'application/zip', category: { label: 'Архивы', icon: FileArchive } },
  {
    prefix: 'application/x-zip',
    category: { label: 'Архивы', icon: FileArchive },
  },
  {
    prefix: 'application/x-rar',
    category: { label: 'Архивы', icon: FileArchive },
  },
  {
    prefix: 'application/vnd.rar',
    category: { label: 'Архивы', icon: FileArchive },
  },
  {
    prefix: 'application/x-7z',
    category: { label: 'Архивы', icon: FileArchive },
  },
  {
    prefix: 'application/x-tar',
    category: { label: 'Архивы', icon: FileArchive },
  },
  {
    prefix: 'application/gzip',
    category: { label: 'Архивы', icon: FileArchive },
  },
  {
    prefix: 'application/x-gzip',
    category: { label: 'Архивы', icon: FileArchive },
  },
]

function getMimeCategories(mimes: string[]): FileCategory[] {
  if (mimes.length === 0) return [{ label: 'Any file', icon: FileArchive }]
  const seen = new Set<string>()
  const result: FileCategory[] = []
  for (const mime of mimes) {
    const match = MIME_CATEGORY_MAP.find(m => mime.startsWith(m.prefix) || mime === m.prefix)
    if (match && !seen.has(match.category.label)) {
      seen.add(match.category.label)
      result.push(match.category)
    }
  }
  // Fallback: if nothing matched show a generic label
  if (result.length === 0) return [{ label: 'Any file', icon: FileArchive }]
  return result
}

// ── Status badge config ───────────────────────────────────────────────────────

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline'

const STATUS_BADGE: Record<string, BadgeVariant> = {
  DRAFT: 'secondary',
  SUBMITTED: 'default',
  GRADED: 'secondary',
  PUBLISHED: 'default',
  RETURNED: 'destructive',
}

const LIFECYCLE_BADGE: Record<string, BadgeVariant> = {
  PUBLISHED: 'default',
  DRAFT: 'secondary',
  ARCHIVED: 'outline',
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
  const t = useTranslations('FileSubmission')
  const activityUuid = activity.activity_uuid?.replace(/^activity_/, '') ?? ''
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [slots, setSlots] = useState<PendingFileSlot[]>([])
  const [isUploading, setIsUploading] = useState(false)

  // ── Query ─────────────────────────────────────────────────────────────────

  const { data, isLoading } = useQuery(fileSubmissionQueryOptions(activityUuid))

  const activeAttempt = data?.current_attempt ?? null
  const status = activeAttempt?.status ?? null
  const attachedFiles = activeAttempt?.files ?? []
  const maxFiles = data?.max_files ?? 1
  const totalSelected = attachedFiles.length + slots.length

  const canEdit = !status || status === 'DRAFT' || status === 'RETURNED'

  // Invalidate trail XP when grade is published so the progress bar updates
  useEffect(() => {
    if (status === 'PUBLISHED') {
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
      const valid = accepted.filter(f => isAllowedFile(f, data.allowed_mime_types, data.max_file_size_mb))
      const invalid = accepted.filter(f => !isAllowedFile(f, data.allowed_mime_types, data.max_file_size_mb))
      if (rejected.length) toast.error(t('maxFilesAllowed', { count: maxFiles }))
      if (invalid.length) toast.error(t('invalidFiles'))
      setSlots(prev => [
        ...prev,
        ...valid.map(f => ({
          id: `${f.name}-${f.size}-${f.lastModified}-${crypto.randomUUID()}`,
          file: f,
          status: 'queued' as const,
          progress: 0,
        })),
      ])
    },
    [data, maxFiles, t, totalSelected],
  )

  // ── Upload + save/submit ──────────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: async ({ submit }: { submit: boolean }) => {
      if (!data) throw new Error(t('notAvailable'))
      setIsUploading(true)

      // Ensure draft exists
      if (!activeAttempt) {
        await startFileSubmissionDraft(data.file_submission_uuid)
      }

      // Upload pending slots
      const uploaded: PendingFileSlot[] = []
      for (const slot of slots) {
        if (slot.upload_uuid) {
          uploaded.push(slot)
          continue
        }
        setSlots(prev => prev.map(s => (s.id === slot.id ? { ...s, status: 'uploading', progress: 0 } : s)))
        try {
          const result = await uploadSubmissionFileWithProgress(slot.file, (loaded, total) => {
            const pct = total > 0 ? Math.round((loaded / total) * 100) : 0
            setSlots(prev => prev.map(s => (s.id === slot.id ? { ...s, progress: pct } : s)))
          })
          const done = {
            ...slot,
            upload_uuid: result.upload_uuid,
            status: 'saved' as const,
            progress: 100,
          }
          setSlots(prev => prev.map(s => (s.id === slot.id ? done : s)))
          uploaded.push(done)
        } catch (error) {
          const msg = error instanceof Error ? error.message : t('uploadFailed')
          setSlots(prev => prev.map(s => (s.id === slot.id ? { ...s, status: 'failed', error: msg } : s)))
          throw error
        }
      }

      const files = [
        ...attachedFiles.map((f: FileSubmissionAttemptFile) => ({
          upload_uuid: f.upload_uuid,
          display_name: f.filename,
        })),
        ...uploaded.map(s => ({
          upload_uuid: s.upload_uuid!,
          display_name: s.file.name,
        })),
      ]
      const version = activeAttempt?.version ?? null
      return submit
        ? submitFileSubmission(data.file_submission_uuid, files, version)
        : saveFileSubmissionDraft(data.file_submission_uuid, files, version)
    },
    onSuccess: async (_attempt, { submit }) => {
      setSlots([])
      setIsUploading(false)
      await queryClient.invalidateQueries({ queryKey: queryKey(activityUuid) })
      toast.success(submit ? t('submittedToast') : t('draftSavedToast'))
    },
    onError: err => {
      setIsUploading(false)
      toast.error(err instanceof Error ? err.message : t('saveFailed'))
    },
  })

  const startMutation = useMutation({
    mutationFn: async () => {
      if (!data) throw new Error(t('notAvailable'))
      return startFileSubmissionDraft(data.file_submission_uuid)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKey(activityUuid) })
      inputRef.current?.click()
    },
    onError: err => {
      toast.error(err instanceof Error ? err.message : t('startDraftFailed'))
    },
  })

  // ── Loading ───────────────────────────────────────────────────────────────

  if (isLoading || !data) {
    return (
      <div className="flex min-h-52 items-center justify-center">
        <LoaderCircle className="text-muted-foreground size-5 animate-spin" />
      </div>
    )
  }

  // ── State: submitted → receipt ─────────────────────────────────────────────

  if (status === 'SUBMITTED' && activeAttempt) {
    return (
      <div className="space-y-6">
        <FileSubmissionReceipt attempt={activeAttempt} />
        <SubmissionHistory attempts={data.attempts} />
      </div>
    )
  }

  // ── State: graded (not yet published) → waiting ────────────────────────────

  if (status === 'GRADED') {
    return (
      <div className="flex min-h-52 flex-col items-center justify-center gap-3">
        <Clock className="text-muted-foreground size-8" />
        <p className="text-muted-foreground text-sm">{t('gradedReleasePending')}</p>
      </div>
    )
  }

  // ── State: published → result ─────────────────────────────────────────────

  if ((status === 'PUBLISHED' || status === 'RETURNED') && activeAttempt) {
    const showResult = status === 'PUBLISHED' || (status === 'RETURNED' && activeAttempt.final_score !== null)
    const canRevise = status === 'RETURNED'
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
              maxFiles,
              totalSelected,
              isUploading,
              canEdit: true,
              activeAttempt,
            }}
          />
        ) : null}
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
        {...(data.due_at !== undefined ? { dueAt: data.due_at } : {})}
        {...(data.max_file_size_mb !== undefined ? { maxFileSizeMb: data.max_file_size_mb } : {})}
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
        maxFiles={maxFiles}
        totalSelected={totalSelected}
        isUploading={isUploading}
        canEdit={canEdit}
        activeAttempt={activeAttempt}
      />
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
  dueAt?: string | null
  allowedMimes: string[]
  maxFiles: number
  maxFileSizeMb?: number | null
  lifecycle: string
  attempt: FileSubmissionAttempt | null
}) {
  const t = useTranslations('FileSubmission')
  const categories = useMemo(() => getMimeCategories(allowedMimes), [allowedMimes])

  return (
    <div className="space-y-4">
      {/* ── Status strip ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant={LIFECYCLE_BADGE[lifecycle] ?? 'secondary'} className="capitalize">
          {lifecycle.toLowerCase()}
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
              {categories.map(({ label, icon: Icon }) => (
                <span
                  key={label}
                  className="bg-background border-border text-foreground/70 flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium shadow-sm"
                >
                  <Icon className="size-3 shrink-0" />
                  {label}
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
  maxFiles: number
  totalSelected: number
  isUploading: boolean
  canEdit: boolean
  activeAttempt: FileSubmissionAttempt | null
}) {
  const t = useTranslations('FileSubmission')
  const busy = saveMutation.isPending || startMutation.isPending || isUploading
  const canSubmit = canEdit && (attachedFiles.length > 0 || slots.length > 0) && !busy

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
            <div key={file.attempt_file_uuid} className="flex items-center gap-3 border-b p-3 text-sm last:border-b-0">
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
            disabled={!canEdit || slots.length === 0 || busy}
            onClick={() => saveMutation.mutate({ submit: false })}
          >
            {busy ? <LoaderCircle className="size-4 animate-spin" /> : null}
            {t('saveDraft')}
          </Button>
          <Button disabled={!canSubmit} onClick={() => saveMutation.mutate({ submit: true })}>
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
  if (attempts.length === 0) return null
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">{t('submissionHistory')}</h3>
      <div className="divide-border border-border rounded-md border">
        {attempts.map(attempt => (
          <div key={attempt.attempt_uuid} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
            <div>
              <p className="font-medium">{t('attemptNumber', { number: attempt.attempt_number })}</p>
              <p className="text-muted-foreground text-xs">
                {attempt.submitted_at
                  ? new Intl.DateTimeFormat(undefined, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }).format(new Date(attempt.submitted_at))
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
