'use client'

import { useDeferredValue, useEffect, useState } from 'react'
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, ExternalLink, Eye, FileText, Loader2, RefreshCw, RotateCcw, Search, Send, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
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
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/error-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'
import { WidgetErrorBoundary } from '@/components/ui/widget-error-boundary'
import { MarkdownEditor } from '@/features/content-markdown'
import { useApiError } from '@/hooks/useApiError'
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard'
import {
  fileSubmissionExportUrl,
  getFileSubmissionByActivity,
  getFileSubmissionFileUrl,
  getFileSubmissionReviewAttempt,
  getFileSubmissionReviewQueue,
  gradeFileSubmissionAttempt,
} from '@/features/file-submissions/services/file-submissions'
import type {
  FileSubmissionAttempt,
  FileSubmissionAttemptStatus,
  FileSubmissionGradePayload,
  FileSubmissionReviewItem,
} from '@/features/file-submissions/services/file-submissions'
import { fromUnix } from '@/lib/api/contract'
import { usePathname, useRouter } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

// ── Rubric types (convention-based schema stored in rubric_json) ──────────────

interface RubricCriterionLevel {
  label: string
  score: number
  description?: string
}

interface RubricCriterion {
  criterion_id: string
  label: string
  max_score: number
  levels?: RubricCriterionLevel[]
}

function parseRubricCriteria(rubric: Record<string, unknown>): RubricCriterion[] {
  const { criteria } = rubric as { criteria?: unknown }
  if (!Array.isArray(criteria)) return []
  return criteria.filter(
    (c): c is RubricCriterion =>
      typeof c === 'object' &&
      c !== null &&
      typeof (c as RubricCriterion).criterion_id === 'string' &&
      typeof (c as RubricCriterion).label === 'string',
  )
}

interface FileSubmissionReviewWorkspaceProps {
  activityUuid: string
  initialAttemptUuid?: string | null
}

const activityQueryKey = (activityUuid: string) => ['file-submission', 'review-activity', activityUuid] as const
const PAGE_SIZE = 25
type QueueStatus = FileSubmissionAttemptStatus | 'ALL'
const QUEUE_STATUSES: FileSubmissionAttemptStatus[] = ['draft', 'submitted', 'graded', 'published', 'returned']

const queueQueryKey = (fileSubmissionId: string) => ['file-submission', 'review-queue', fileSubmissionId] as const
const queuePageQueryKey = (fileSubmissionId: string, status: QueueStatus, search: string, cursor: string | null) =>
  [...queueQueryKey(fileSubmissionId), { status, search, cursor, limit: PAGE_SIZE }] as const
const attemptQueryKey = (attemptId: string) => ['file-submission', 'review-attempt', attemptId] as const

function parseQueueStatus(value: string | null): QueueStatus {
  return QUEUE_STATUSES.find(status => status === value) ?? 'ALL'
}

const GRADE_ACTIONS = { GRADED: 'save', PUBLISHED: 'publish', RETURNED: 'return' } as const
type GradeStatus = keyof typeof GRADE_ACTIONS

export default function FileSubmissionReviewWorkspace({
  activityUuid,
  initialAttemptUuid,
}: FileSubmissionReviewWorkspaceProps) {
  const cleanActivityUuid = activityUuid.replace(/^activity_/, '')
  const queryClient = useQueryClient()
  const router = useRouter()
  const pathname = usePathname()
  const urlSearchParams = useSearchParams()
  const [search, setSearch] = useState(() => urlSearchParams.get('search') ?? '')
  const deferredSearch = useDeferredValue(search.trim())
  const [status, setStatus] = useState<QueueStatus>(() => parseQueueStatus(urlSearchParams.get('status')))
  // Keyset paging: the cursor stack is the "previous pages" history.
  const [cursors, setCursors] = useState<string[]>([])
  const cursor = cursors.at(-1) ?? null
  const [selectedUuid, setSelectedUuid] = useState<string | null>(initialAttemptUuid ?? null)
  const [pendingAttempt, setPendingAttempt] = useState<FileSubmissionReviewItem | null>(null)
  const [isGradeDirty, setIsGradeDirty] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewFilename, setPreviewFilename] = useState<string | null>(null)
  const [isFetchingPreview, setIsFetchingPreview] = useState<string | null>(null) // attempt file id
  const t = useTranslations('FileSubmissionReview')
  const { handleApiError, toastApiError } = useApiError()
  const navigationGuard = useUnsavedChangesGuard(isGradeDirty, {
    message: t('unsavedDescription'),
    interceptInAppNavigation: true,
  })

  const {
    data: config,
    error: configError,
    isError: isConfigError,
    isLoading: isConfigLoading,
    refetch: refetchConfig,
  } = useQuery(
    queryOptions({
      queryKey: activityQueryKey(cleanActivityUuid),
      queryFn: () => getFileSubmissionByActivity(cleanActivityUuid),
      enabled: Boolean(cleanActivityUuid),
    }),
  )

  useEffect(() => {
    const next = new URLSearchParams(urlSearchParams.toString())
    if (deferredSearch) next.set('search', deferredSearch)
    else next.delete('search')
    if (status === 'ALL') next.delete('status')
    else next.set('status', status)

    const current = urlSearchParams.toString()
    const nextValue = next.toString()
    if (nextValue !== current) {
      router.replace(nextValue ? `${pathname}?${nextValue}` : pathname, { scroll: false })
    }
  }, [deferredSearch, pathname, router, status, urlSearchParams])

  const {
    data: queue,
    error: queueError,
    isError: isQueueError,
    isLoading: isQueueLoading,
    refetch: refetchQueue,
  } = useQuery(
    queryOptions({
      queryKey: config
        ? queuePageQueryKey(config.id, status, deferredSearch, cursor)
        : ['file-submission', 'review-queue', 'pending'],
      queryFn: () =>
        getFileSubmissionReviewQueue(config!.id, {
          status,
          search: deferredSearch,
          cursor,
          limit: PAGE_SIZE,
        }),
      enabled: Boolean(config?.id),
      placeholderData: previous => previous,
    }),
  )

  const queueItems = queue?.items ?? []
  const selectedId = selectedUuid ?? queueItems[0]?.id ?? null

  // The queue carries summaries only; files, feedback and rubric scores come
  // from `GET file-submission-attempts/{id}`.
  const { data: selected } = useQuery(
    queryOptions({
      queryKey: selectedId ? attemptQueryKey(selectedId) : ['file-submission', 'review-attempt', 'pending'],
      queryFn: () => getFileSubmissionReviewAttempt(selectedId!),
      enabled: Boolean(selectedId),
    }),
  )

  const gradeMutation = useMutation({
    mutationFn: async ({ attempt, payload }: { attempt: FileSubmissionAttempt; payload: FileSubmissionGradePayload }) =>
      gradeFileSubmissionAttempt(attempt.id, payload, attempt.version),
    onSuccess: async (_saved, { attempt }) => {
      await Promise.all([
        config ? queryClient.invalidateQueries({ queryKey: queueQueryKey(config.id) }) : null,
        queryClient.invalidateQueries({ queryKey: attemptQueryKey(attempt.id) }),
      ])
      toast.success(t('submissionUpdated'))
    },
    onError: gradeError => {
      setIsGradeDirty(true)
      toastApiError(gradeError, { fallback: t('updateSubmissionFailed') })
    },
  })

  const parsedCriteria = config?.rubric ? parseRubricCriteria(config.rubric) : []

  function selectAttempt(attempt: FileSubmissionReviewItem) {
    setSelectedUuid(attempt.id)
    setIsGradeDirty(false)
    setPreviewUrl(null)
    setPreviewFilename(null)
    const next = new URLSearchParams(urlSearchParams.toString())
    next.set('submission', attempt.id)
    router.replace(`${pathname}?${next.toString()}`, { scroll: false })
  }

  function requestAttemptSelection(attempt: FileSubmissionReviewItem) {
    if (attempt.id === selectedId) return
    if (isGradeDirty) {
      setPendingAttempt(attempt)
      return
    }
    selectAttempt(attempt)
  }

  async function openFile(fileId: string) {
    try {
      const result = await getFileSubmissionFileUrl(fileId)
      window.open(result.url, '_blank', 'noopener,noreferrer')
    } catch (error) {
      toastApiError(error, { fallback: t('openFileFailed') })
    }
  }

  async function previewFile(fileId: string, filename: string) {
    setIsFetchingPreview(fileId)
    try {
      const result = await getFileSubmissionFileUrl(fileId)
      setPreviewUrl(result.url)
      setPreviewFilename(filename)
    } catch (error) {
      toastApiError(error, { fallback: t('previewFileFailed') })
    } finally {
      setIsFetchingPreview(null)
    }
  }

  if (isConfigLoading || isQueueLoading) {
    return (
      <div className="text-muted-foreground flex min-h-[420px] items-center justify-center text-sm">
        <Loader2 className="mr-2 size-4 animate-spin" />
        {t('loadingSubmissions')}
      </div>
    )
  }

  if (isConfigError || isQueueError) {
    const sourceError = configError ?? queueError
    const processed = handleApiError(sourceError, { fallback: t('reviewUnavailable') })
    return (
      <ErrorState
        actionLabel={processed.actionLabel}
        description={processed.message}
        error={sourceError}
        {...(processed.showRetry
          ? {
              onAction: () => {
                void (isConfigError ? refetchConfig() : refetchQueue())
              },
            }
          : {})}
        title={t('reviewUnavailable')}
        variant="section"
      />
    )
  }

  if (!config || !queue) {
    return (
      <div className="text-muted-foreground rounded-md border border-dashed p-6 text-sm">{t('reviewUnavailable')}</div>
    )
  }

  return (
    <div className="bg-background grid min-h-screen lg:grid-cols-[360px_minmax(0,1fr)]">
      <aside className="border-border bg-card/40 border-b lg:border-r lg:border-b-0">
        <div className="border-border sticky top-0 z-10 flex flex-col gap-3 border-b bg-inherit p-4 backdrop-blur">
          <div>
            <p className="text-muted-foreground text-xs">{t('fileSubmissionReview')}</p>
            <h1 className="truncate text-lg font-semibold">{config.title}</h1>
          </div>
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute top-2.5 left-2.5 size-4" />
            <Input
              aria-label={t('searchLearners')}
              autoComplete="off"
              name="learner-search"
              value={search}
              onChange={event => {
                setSearch(event.target.value)
                setCursors([])
              }}
              placeholder={t('searchLearnersPlaceholder')}
              className="pl-8"
            />
          </div>
          <Label htmlFor="file-review-status" className="sr-only">
            {t('filterByStatus')}
          </Label>
          <NativeSelect
            id="file-review-status"
            className="w-full"
            value={status}
            onChange={event => {
              setStatus(parseQueueStatus(event.target.value))
              setCursors([])
            }}
          >
            <NativeSelectOption value="ALL">{t('allStatuses')}</NativeSelectOption>
            <NativeSelectOption value="submitted">{t('statusSubmitted')}</NativeSelectOption>
            <NativeSelectOption value="graded">{t('statusGraded')}</NativeSelectOption>
            <NativeSelectOption value="published">{t('statusPublished')}</NativeSelectOption>
            <NativeSelectOption value="returned">{t('statusReturned')}</NativeSelectOption>
            <NativeSelectOption value="draft">{t('statusDraft')}</NativeSelectOption>
          </NativeSelect>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                config &&
                queryClient.invalidateQueries({
                  queryKey: queueQueryKey(config.id),
                })
              }
            >
              <RefreshCw data-icon="inline-start" />
              {t('refresh')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              nativeButton={false}
              render={<a href={fileSubmissionExportUrl(config.id)} aria-label={t('downloadCsv')} />}
            >
              <Download data-icon="inline-start" />
              CSV
            </Button>
          </div>
        </div>
        <div className="divide-border max-h-64 divide-y overflow-y-auto overscroll-contain lg:max-h-none">
          {queueItems.length === 0 ? (
            <p className="text-muted-foreground p-4 text-sm">{t('noSubmissions')}</p>
          ) : (
            queueItems.map(attempt => (
              <Button
                type="button"
                key={attempt.id}
                variant="ghost"
                className={cn(
                  'hover:bg-muted/60 h-auto w-full justify-start rounded-none p-4 text-left transition-colors',
                  selectedId === attempt.id && 'bg-muted',
                )}
                onClick={() => requestAttemptSelection(attempt)}
              >
                <div className="flex w-full items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{displayUser(attempt)}</p>
                    <p className="text-muted-foreground text-xs">
                      {t('attemptInfo', {
                        attemptNumber: attempt.attempt_number,
                        count: attempt.file_count,
                      })}
                    </p>
                  </div>
                  <AttemptStatusBadge status={attempt.status} />
                </div>
              </Button>
            ))
          )}
        </div>
        {queue.next_cursor || cursors.length > 0 ? (
          <div className="border-border border-t p-3">
            <Pagination>
              <PaginationContent className="w-full justify-between">
                <PaginationItem>
                  <PaginationPrevious
                    aria-disabled={cursors.length === 0}
                    className={cn(cursors.length === 0 && 'pointer-events-none opacity-50')}
                    href="#"
                    onClick={event => {
                      event.preventDefault()
                      setCursors(previous => previous.slice(0, -1))
                    }}
                  />
                </PaginationItem>
                <PaginationItem>
                  <PaginationNext
                    aria-disabled={!queue.next_cursor}
                    className={cn(!queue.next_cursor && 'pointer-events-none opacity-50')}
                    href="#"
                    onClick={event => {
                      event.preventDefault()
                      if (queue.next_cursor) setCursors(previous => [...previous, queue.next_cursor!])
                    }}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        ) : null}
      </aside>

      <main className="p-4 lg:p-6">
        {selected ? (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <section className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">{displayUser(selected)}</h2>
                  <p className="text-muted-foreground text-sm">
                    {selected.submitted_at_unix
                      ? t('submittedAt', {
                          date: formatDate(selected.submitted_at_unix),
                        })
                      : t('submittedAsDraft')}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {selected.is_late ? <Badge variant="destructive">{t('late')}</Badge> : null}
                  {typeof selected.final_score === 'number' ? (
                    <Badge variant="outline">{selected.final_score}%</Badge>
                  ) : null}
                  <AttemptStatusBadge status={selected.status} />
                </div>
              </div>
              <div className="divide-border rounded-md border">
                {selected.files.length === 0 ? (
                  <p className="text-muted-foreground p-4 text-sm">{t('noFiles')}</p>
                ) : (
                  selected.files.map(file => {
                    const previewable = isPreviewable(file.filename)
                    return (
                      <div key={file.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                        <div className="flex min-w-0 items-center gap-3">
                          <FileText className="text-muted-foreground size-5 shrink-0" />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{file.filename}</p>
                            <p className="text-muted-foreground text-xs">
                              {formatBytes(file.size_bytes ?? 0)} · {file.scan_status}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {previewable && (
                            <Button
                              size="sm"
                              variant={previewUrl !== null && previewFilename === file.filename ? 'default' : 'outline'}
                              disabled={isFetchingPreview === file.id}
                              onClick={() => {
                                if (previewUrl !== null && previewFilename === file.filename) {
                                  setPreviewUrl(null)
                                  setPreviewFilename(null)
                                } else {
                                  previewFile(file.id, file.filename)
                                }
                              }}
                            >
                              {isFetchingPreview === file.id ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : (
                                <Eye className="size-4" />
                              )}
                              {t('preview')}
                            </Button>
                          )}
                          <Button size="sm" variant="outline" onClick={() => openFile(file.id)}>
                            {previewable ? <ExternalLink className="size-4" /> : <Download className="size-4" />}
                            {previewable ? t('openButton') : t('downloadButton')}
                          </Button>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

              {/* ── Inline file preview ──────────────────────────────────── */}
              {previewUrl && (
                <WidgetErrorBoundary scope="file-submission-preview" variant="section" title={t('previewFileFailed')}>
                  <div className="rounded-md border">
                    <div className="flex items-center justify-between border-b p-3">
                      <p className="truncate text-sm font-medium">{previewFilename}</p>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7 shrink-0"
                        onClick={() => {
                          setPreviewUrl(null)
                          setPreviewFilename(null)
                        }}
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                    <FilePreviewPane url={previewUrl} filename={previewFilename ?? ''} />
                  </div>
                </WidgetErrorBoundary>
              )}
            </section>

            <aside className="space-y-4">
              <GradeEditor
                key={selected.id}
                attempt={selected}
                criteria={parsedCriteria}
                isPending={gradeMutation.isPending}
                onDirtyChange={setIsGradeDirty}
                onSubmit={payload => {
                  setIsGradeDirty(false)
                  gradeMutation.mutate({ attempt: selected, payload })
                }}
              />
            </aside>
          </div>
        ) : (
          <div className="text-muted-foreground rounded-md border border-dashed p-6 text-sm">
            {t('selectSubmission')}
          </div>
        )}
      </main>
      <AlertDialog open={pendingAttempt !== null} onOpenChange={open => (!open ? setPendingAttempt(null) : null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('discardDraftTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('discardDraftDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('keepEditing')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (pendingAttempt) selectAttempt(pendingAttempt)
                setPendingAttempt(null)
              }}
            >
              {t('discardAndSwitch')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={navigationGuard.isPromptOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('unsavedTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{navigationGuard.promptMessage}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={navigationGuard.cancelNavigation}>{t('stayHere')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setIsGradeDirty(false)
                navigationGuard.confirmNavigation()
              }}
            >
              {t('leaveWithoutSaving')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function displayUser(attempt: FileSubmissionAttempt | FileSubmissionReviewItem) {
  const { user } = attempt
  return user?.display_name || user?.username || user?.email || 'Learner'
}

function readRubricScores(attempt: FileSubmissionAttempt): Record<string, number> {
  const savedRubric = attempt.rubric_scores
  if (!savedRubric || typeof savedRubric !== 'object' || !('criteria' in savedRubric)) return {}
  const rawCriteria = (savedRubric as { criteria?: unknown }).criteria
  if (!Array.isArray(rawCriteria)) return {}

  return rawCriteria.reduce<Record<string, number>>((scores, criterion) => {
    if (
      criterion &&
      typeof criterion === 'object' &&
      typeof (criterion as { criterion_id?: unknown }).criterion_id === 'string' &&
      typeof (criterion as { score?: unknown }).score === 'number'
    ) {
      scores[(criterion as { criterion_id: string }).criterion_id] = (criterion as { score: number }).score
    }
    return scores
  }, {})
}

function GradeEditor({
  attempt,
  criteria,
  isPending,
  onDirtyChange,
  onSubmit,
}: {
  attempt: FileSubmissionAttempt
  criteria: RubricCriterion[]
  isPending: boolean
  onDirtyChange: (dirty: boolean) => void
  onSubmit: (payload: FileSubmissionGradePayload) => void
}) {
  const t = useTranslations('FileSubmissionReview')
  const [score, setScore] = useState(typeof attempt.final_score === 'number' ? String(attempt.final_score) : '')
  const [feedback, setFeedback] = useState(attempt.feedback ?? '')
  const [rubricScores, setRubricScores] = useState<Record<string, number>>(() => readRubricScores(attempt))
  const rubricTotalScore =
    criteria.length === 0
      ? null
      : criteria.reduce((total, criterion) => total + (rubricScores[criterion.criterion_id] ?? 0), 0)
  const scoreId = `fs-review-score-${attempt.id}`

  function submit(status: GradeStatus) {
    const rubric =
      criteria.length > 0
        ? {
            criteria: criteria.map(criterion => ({
              criterion_id: criterion.criterion_id,
              label: criterion.label,
              score: rubricScores[criterion.criterion_id] ?? 0,
              max_score: criterion.max_score,
            })),
          }
        : {}
    onSubmit({
      action: GRADE_ACTIONS[status],
      final_score: score.trim() === '' ? null : Number(score),
      feedback,
      rubric_scores: rubric,
    })
  }

  return (
    <section className="rounded-md border p-4">
      <h3 className="mb-3 text-sm font-semibold">{t('gradeAndFeedback')}</h3>
      <div className="flex flex-col gap-3">
        {criteria.length > 0 ? (
          <RubricGrid
            criteria={criteria}
            scores={rubricScores}
            onChange={(criterionId, criterionScore) => {
              const nextScores = { ...rubricScores, [criterionId]: criterionScore }
              setRubricScores(nextScores)
              onDirtyChange(true)
              const total = criteria.reduce((sum, criterion) => sum + (nextScores[criterion.criterion_id] ?? 0), 0)
              const maxTotal = criteria.reduce((sum, criterion) => sum + criterion.max_score, 0)
              if (maxTotal > 0) setScore(String(Math.round((total / maxTotal) * 100)))
            }}
          />
        ) : null}
        <div className="flex flex-col gap-1">
          <Label htmlFor={scoreId}>{t('finalScore')}</Label>
          <div className="flex items-center gap-2">
            <Input
              id={scoreId}
              name="final-score"
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              value={score}
              onChange={event => {
                setScore(event.target.value)
                onDirtyChange(true)
              }}
              placeholder={t('scorePlaceholder')}
              className="w-24 tabular-nums"
            />
            <span className="text-muted-foreground text-sm">{t('scoreSlash')}</span>
            {rubricTotalScore !== null ? (
              <Button
                type="button"
                size="sm"
                variant="link"
                className="h-auto p-0 text-xs"
                onClick={() => {
                  setScore(String(rubricTotalScore))
                  onDirtyChange(true)
                }}
              >
                {t('useRubricTotal', { score: rubricTotalScore })}
              </Button>
            ) : null}
          </div>
        </div>
        <MarkdownEditor
          value={feedback}
          onChange={value => {
            setFeedback(value)
            onDirtyChange(true)
          }}
          preset="explanation"
          minHeight={160}
          placeholder={t('feedbackPlaceholder')}
        />
        <div className="grid gap-2">
          <Button onClick={() => submit('GRADED')} disabled={isPending}>
            {isPending ? (
              <Loader2 data-icon="inline-start" className="animate-spin" />
            ) : (
              <Send data-icon="inline-start" />
            )}
            {t('saveGrade')}
          </Button>
          <Button variant="outline" onClick={() => submit('RETURNED')} disabled={isPending}>
            <RotateCcw data-icon="inline-start" />
            {t('returnForRevision')}
          </Button>
          <Button variant="outline" onClick={() => submit('PUBLISHED')} disabled={isPending}>
            {t('publishResult')}
          </Button>
        </div>
      </div>
    </section>
  )
}

function isPreviewable(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  return ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)
}

function RubricGrid({
  criteria,
  scores,
  onChange,
}: {
  criteria: RubricCriterion[]
  scores: Record<string, number>
  onChange: (criterionId: string, score: number) => void
}) {
  const t = useTranslations('FileSubmissionReview')
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">{t('rubric')}</p>
      {criteria.map(c => {
        const current = scores[c.criterion_id] ?? null
        return (
          <div key={c.criterion_id} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-sm">{c.label}</span>
              <span className="text-muted-foreground text-xs">
                {current ?? '—'} / {c.max_score}
              </span>
            </div>
            {c.levels && c.levels.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {c.levels.map(level => (
                  <Button
                    key={level.score}
                    type="button"
                    variant={current === level.score ? 'default' : 'outline'}
                    size="sm"
                    title={level.description}
                    className="h-auto px-2 py-0.5 text-xs"
                    onClick={() => onChange(c.criterion_id, level.score)}
                  >
                    {level.label} ({level.score})
                  </Button>
                ))}
              </div>
            ) : (
              <Input
                type="number"
                min={0}
                max={c.max_score}
                step={0.5}
                value={current ?? ''}
                placeholder={t('rubricScorePlaceholder')}
                className="h-7 w-20 text-sm"
                onChange={e => {
                  const v = Number.parseFloat(e.target.value)
                  if (!Number.isNaN(v)) onChange(c.criterion_id, Math.min(v, c.max_score))
                }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

function FilePreviewPane({ url, filename }: { url: string; filename: string }) {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)

  if (isImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt={filename} className="max-h-[600px] w-full rounded-b-md object-contain p-2" />
    )
  }
  // PDF / fallback iframe
  return (
    <iframe
      src={url}
      title={filename}
      className="h-[600px] w-full rounded-b-md border-0"
      sandbox="allow-scripts allow-same-origin"
    />
  )
}

function AttemptStatusBadge({ status }: { status: string }) {
  const variant = status === 'submitted' ? 'default' : status === 'returned' ? 'destructive' : 'secondary'
  return <Badge variant={variant}>{status}</Badge>
}

function formatDate(unix: number) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(fromUnix(unix))
}

function formatBytes(bytes: number) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}
