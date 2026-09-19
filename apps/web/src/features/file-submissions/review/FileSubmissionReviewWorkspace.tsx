'use client'

import { useDeferredValue, useEffect, useState } from 'react'
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  X,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { toast } from 'sonner'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
import { SubmissionAIEntry } from '@/features/submission-analysis'
import { useApiError } from '@/hooks/useApiError'
import { saveBlob } from '@/lib/download'
import { useCourseGradingEvents } from '@/features/grading/queries/use-grading-events'
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard'
import {
  downloadFileSubmissionCsv,
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
import { hasErrorCode, isApiError } from '@/lib/api/assertSuccess'
import { fromUnix } from '@/lib/api/contract'
import { queryKeys } from '@/lib/react-query/queryKeys'
import { usePathname, useRouter } from '@/i18n/navigation'
import { cn } from '@/lib/utils'
import { useFormatBytes } from '@/features/file-submissions/useFormatBytes'

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
  // BUG-154 (mirrors GradeForm's BUG-123/UX-049 guard): `If-Match` carries the
  // version the drafts were seeded from; a refetch that moves the version while
  // the editor is dirty (colleague's save via SSE, or our own 412) raises a
  // notice instead of silently sending the local draft over their grade.
  const [baseVersion, setBaseVersion] = useState<number | null>(null)
  const [remoteUpdate, setRemoteUpdate] = useState(false)
  const [seenVersion, setSeenVersion] = useState('')
  const [seedKey, setSeedKey] = useState(0)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewFilename, setPreviewFilename] = useState<string | null>(null)
  const [isFetchingPreview, setIsFetchingPreview] = useState<string | null>(null) // attempt file id
  const t = useTranslations('FileSubmissionReview')
  const locale = useLocale()
  const formatBytes = useFormatBytes()
  const tPanel = useTranslations('Grading.Panel')
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
  // Grades and hand-ins from elsewhere refresh the queue and the open attempt.
  useCourseGradingEvents(config?.course_id)

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
  const { data: selected, error: selectedError } = useQuery(
    queryOptions({
      queryKey: selectedId ? attemptQueryKey(selectedId) : ['file-submission', 'review-attempt', 'pending'],
      queryFn: () => getFileSubmissionReviewAttempt(selectedId!),
      enabled: Boolean(selectedId),
    }),
  )
  // UX-105 (mirrors the quiz review): an unknown `?submission=` says so and is
  // dropped from the URL instead of silently showing the first row.
  const initialUnknown =
    Boolean(initialAttemptUuid) &&
    selectedUuid === initialAttemptUuid &&
    isApiError(selectedError) &&
    selectedError.status === 404
  useEffect(() => {
    if (!initialUnknown) return
    toast.warning(t('unknownSubmissionParam'))
    setSelectedUuid(null)
    const next = new URLSearchParams(urlSearchParams.toString())
    next.delete('submission')
    const serialized = next.toString()
    router.replace(serialized ? `${pathname}?${serialized}` : pathname, { scroll: false })
  }, [initialUnknown, pathname, router, t, urlSearchParams])

  if (selected && `${selected.id}:${selected.version}` !== seenVersion) {
    setSeenVersion(`${selected.id}:${selected.version}`)
    if (isGradeDirty && baseVersion !== null && seenVersion.startsWith(`${selected.id}:`)) setRemoteUpdate(true)
    else setBaseVersion(selected.version)
  }

  const gradeMutation = useMutation({
    mutationFn: async ({ attempt, payload }: { attempt: FileSubmissionAttempt; payload: FileSubmissionGradePayload }) =>
      gradeFileSubmissionAttempt(attempt.id, payload, baseVersion ?? attempt.version),
    onSuccess: async (_saved, { attempt, payload }) => {
      await Promise.all([
        config ? queryClient.invalidateQueries({ queryKey: queueQueryKey(config.id) }) : null,
        // The gradebook builds its file-submission cells from this queue.
        config ? queryClient.invalidateQueries({ queryKey: queryKeys.grading.gradebook(config.course_id) }) : null,
        queryClient.invalidateQueries({ queryKey: attemptQueryKey(attempt.id) }),
      ])
      toast.success(
        payload.action === 'publish'
          ? t('gradePublished')
          : payload.action === 'return'
            ? t('gradeReturned')
            : t('draftSaved'),
      )
    },
    onError: (gradeError, { attempt }) => {
      setIsGradeDirty(true)
      if (hasErrorCode(gradeError, 'precondition-failed')) {
        // Keep what was typed; the refetch raises the colleague notice.
        void queryClient.invalidateQueries({ queryKey: attemptQueryKey(attempt.id) })
        return
      }
      toastApiError(gradeError, { fallback: t('updateSubmissionFailed') })
    },
  })

  const parsedCriteria = config?.rubric ? parseRubricCriteria(config.rubric) : []

  function selectAttempt(attempt: FileSubmissionReviewItem) {
    setSelectedUuid(attempt.id)
    setIsGradeDirty(false)
    setRemoteUpdate(false)
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
      // `download` names the saved file after the original upload once the
      // signed URL carries a Content-Disposition; a plain window.open kept
      // the storage key.
      const anchor = document.createElement('a')
      anchor.href = result.url
      anchor.download = result.filename
      anchor.target = '_blank'
      anchor.rel = 'noopener noreferrer'
      anchor.click()
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
              aria-label={t('downloadCsv')}
              onClick={() =>
                void downloadFileSubmissionCsv(config.id, locale)
                  .then(blob => {
                    saveBlob(blob, `file-submission-${config.id}.csv`)
                    toast.success(t('csvSaved'))
                  })
                  .catch(error => toastApiError(error, { fallback: t('csvFailed') }))
              }
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

      <main className="@container/review p-4 lg:p-6">
        {selected ? (
          // Container query, not a viewport breakpoint: the shell sidebar and
          // the submission list eat ~620px, so at 1280px the aside must stack.
          <div className="grid gap-6 @[44rem]/review:grid-cols-[minmax(0,1fr)_360px]">
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
                              {formatBytes(file.size_bytes ?? 0)} · {t(`scan_${file.scan_status}`)}
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
              {remoteUpdate ? (
                <Alert
                  role="status"
                  className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
                >
                  <AlertTriangle className="size-4" />
                  <AlertTitle>{tPanel('staleDraftTitle')}</AlertTitle>
                  <AlertDescription className="mt-1 space-y-1 text-xs">
                    <p>
                      {tPanel('staleDraft.serverScoreLabel')} <strong>{selected.final_score ?? '—'}</strong>.{' '}
                      {tPanel('staleDraftBlocked')}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-xs"
                        onClick={() => {
                          setSeedKey(key => key + 1)
                          setBaseVersion(selected.version)
                          setIsGradeDirty(false)
                          setRemoteUpdate(false)
                        }}
                      >
                        {tPanel('useServerValues')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-xs"
                        onClick={() => {
                          setBaseVersion(selected.version)
                          setRemoteUpdate(false)
                        }}
                      >
                        {tPanel('keepMyDraft')}
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              ) : null}
              <GradeEditor
                key={`${selected.id}:${seedKey}`}
                attempt={selected}
                criteria={parsedCriteria}
                isPending={gradeMutation.isPending}
                disabled={remoteUpdate}
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
  disabled,
  onDirtyChange,
  onSubmit,
}: {
  attempt: FileSubmissionAttempt
  criteria: RubricCriterion[]
  isPending: boolean
  disabled: boolean
  onDirtyChange: (dirty: boolean) => void
  onSubmit: (payload: FileSubmissionGradePayload) => void
}) {
  const t = useTranslations('FileSubmissionReview')
  // UX-121: reopen with the raw score — `final_score` already carries the late penalty.
  const storedScore = attempt.raw_score ?? attempt.final_score
  const [score, setScore] = useState(typeof storedScore === 'number' ? String(storedScore) : '')
  const [feedback, setFeedback] = useState(attempt.feedback ?? '')
  const [rubricScores, setRubricScores] = useState<Record<string, number>>(() => readRubricScores(attempt))
  const [showErrors, setShowErrors] = useState(false)
  const rubricTotalScore =
    criteria.length === 0
      ? null
      : criteria.reduce((total, criterion) => total + (rubricScores[criterion.criterion_id] ?? 0), 0)
  const scoreId = `fs-review-score-${attempt.id}`
  const isPublished = attempt.status === 'published'
  // UX-047: mirror the server's `final_score` rules (required for save/publish,
  // 0..=100) as a field error instead of a generic validation toast.
  const parsedScore = score.trim() === '' ? null : Number(score)
  const scoreOutOfRange =
    parsedScore !== null && (!Number.isFinite(parsedScore) || parsedScore < 0 || parsedScore > 100)
  // UX-123: the form holds the raw score; the learner gets `raw × (1 − penalty)` (server `apply_late`).
  const latePreview =
    attempt.late_penalty_pct > 0 && parsedScore !== null && !scoreOutOfRange
      ? Math.round(parsedScore * (1 - attempt.late_penalty_pct / 100) * 100) / 100
      : null
  const scoreError = scoreOutOfRange
    ? t('scoreInvalid')
    : showErrors && parsedScore === null
      ? t('scoreRequired')
      : null

  function submit(status: GradeStatus) {
    if (scoreOutOfRange || (status !== 'RETURNED' && parsedScore === null)) {
      setShowErrors(true)
      return
    }
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
      final_score: parsedScore,
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
              aria-invalid={scoreError ? true : undefined}
              aria-describedby={scoreError ? `${scoreId}-error` : undefined}
              className="w-24 tabular-nums"
            />
            <span className="text-muted-foreground text-sm">{t('scoreSlash')}</span>
            {latePreview !== null ? (
              <span className="text-muted-foreground text-xs" data-testid="late-penalty-preview">
                {t('latePenaltyPreview', { percent: attempt.late_penalty_pct, final: latePreview })}
              </span>
            ) : null}
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
          {scoreError ? (
            <p id={`${scoreId}-error`} role="alert" className="text-destructive text-xs">
              {scoreError}
            </p>
          ) : null}
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
        {/* UX-065: a released grade is final (BUG-128) — only a re-publish is offered. */}
        {isPublished ? <p className="text-muted-foreground text-xs">{t('publishedIsFinal')}</p> : null}
        <div className="grid gap-2">
          <Button onClick={() => submit('GRADED')} disabled={isPending || disabled || isPublished}>
            {isPending ? (
              <Loader2 data-icon="inline-start" className="animate-spin" />
            ) : (
              <Send data-icon="inline-start" />
            )}
            {t('saveGrade')}
          </Button>
          <Button variant="outline" onClick={() => submit('RETURNED')} disabled={isPending || disabled || isPublished}>
            <RotateCcw data-icon="inline-start" />
            {t('returnForRevision')}
          </Button>
          <Button variant="outline" onClick={() => submit('PUBLISHED')} disabled={isPending || disabled}>
            {t('publishResult')}
          </Button>
        </div>
        {/* The analyst and the remediation generator take a file attempt id (DECISIONS 2026-09-12). */}
        <SubmissionAIEntry
          submissionUuid={attempt.id}
          hasFeedback={feedback.trim() !== ''}
          onDraftFeedback={draft => {
            setFeedback(draft)
            onDirtyChange(true)
          }}
        />
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

const STATUS_LABEL_KEYS = {
  draft: 'statusDraft',
  submitted: 'statusSubmitted',
  graded: 'statusGraded',
  published: 'statusPublished',
  returned: 'statusReturned',
} as const

function AttemptStatusBadge({ status }: { status: string }) {
  const t = useTranslations('FileSubmissionReview')
  const variant = status === 'submitted' ? 'default' : status === 'returned' ? 'destructive' : 'secondary'
  const key = STATUS_LABEL_KEYS[status as keyof typeof STATUS_LABEL_KEYS]
  return <Badge variant={variant}>{key ? t(key) : status}</Badge>
}

function formatDate(unix: number) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(fromUnix(unix))
}
