'use client'

import {
  AlertTriangle,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Clock,
  Eye,
  ExternalLink,
  GitCompareArrows,
  ListTodo,
  Send,
  Target,
  TextCursorInput,
  Trophy,
} from 'lucide-react'
import { useState, useTransition } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useQuery, queryOptions } from '@tanstack/react-query'

import type { AssessmentItem, UnifiedItemKind } from '@/features/assessments/domain/items'
import { classifyValidationIssue, dedupeIssues } from '@/features/assessments/domain/readiness'
import type { ClassifiedValidationIssue } from '@/features/assessments/domain/readiness'
import type { ValidationIssue } from '@/features/assessments/domain/view-models'
import type { AssessmentEditorState } from '@/features/assessments/studio/studioTypes'
import { apiFetcher } from '@/lib/api-client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { CalendarDateTimePicker } from '@/components/ui/calendar'
import { PREVIEW_SCENARIOS, canConfirmLifecycleChange, isHighStakesAssessment } from './publishGateUtils'
import type { PreviewScenarioId } from './publishGateUtils'

type SupportedStudioItemKind = Exclude<UnifiedItemKind, 'CODE'>
type AssessmentLifecycle = 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'ARCHIVED'

const KIND_ICONS: Record<SupportedStudioItemKind, typeof ListTodo> = {
  CHOICE: ListTodo,
  OPEN_TEXT: BookOpen,
  FORM: TextCursorInput,
  MATCHING: GitCompareArrows,
}

interface PublishDashboardTabProps {
  assessmentUuid: string
  lifecycle: AssessmentLifecycle
  items: AssessmentItem[]
  totalPoints: number
  assessmentState: AssessmentEditorState
  validationIssues: ValidationIssue[]
  canPublish: boolean
  canSchedule: boolean
  canArchive: boolean
  scheduledAt?: string | null
  publishedAt?: string | null
  archivedAt?: string | null
  onSwitchToBuilder: (itemUuid?: string) => void
  onLifecycleChange: (lifecycle: AssessmentLifecycle, scheduledAt?: string | null, auditNote?: string | null) => void
}

interface AccessRead {
  effective_user_count: number
}

const assessmentAccessQueryOptions = (assessmentUuid: string) =>
  queryOptions({
    queryKey: ['assessments', assessmentUuid, 'access', 'publish-gate'],
    queryFn: () => apiFetcher<AccessRead>(`assessments/${assessmentUuid}/access`),
    staleTime: 30_000,
  })

export default function PublishDashboardTab({
  assessmentUuid,
  lifecycle,
  items,
  totalPoints,
  assessmentState,
  validationIssues,
  canPublish,
  canSchedule,
  canArchive: _canArchive,
  scheduledAt: persistedScheduledAt,
  publishedAt,
  archivedAt,
  onSwitchToBuilder,
  onLifecycleChange,
}: PublishDashboardTabProps) {
  const tPublish = useTranslations('Features.Assessments.Studio.PublishDashboard')
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [scheduledAt, setScheduledAt] = useState('')
  const [pendingAction, setPendingAction] = useState<'publish' | 'schedule' | null>(null)
  const [auditNote, setAuditNote] = useState('')
  const [activeScenario, setActiveScenario] = useState<PreviewScenarioId>('genericLearner')
  const [previewedScenarios, setPreviewedScenarios] = useState<Set<PreviewScenarioId>>(new Set())
  const [specificLearner, setSpecificLearner] = useState('')
  const [isPending, startTransition] = useTransition()
  const accessQuery = useQuery(assessmentAccessQueryOptions(assessmentUuid))

  // Compute all validation issues (assessment-level + item-level)
  const classifiedIssues = dedupeIssues(validationIssues).map(classifyValidationIssue)
  const hasIssues = classifiedIssues.length > 0
  const assessmentLevelIssues = classifiedIssues.filter(issue => !issue.itemUuid)
  const itemLevelIssues = classifiedIssues.filter(issue => Boolean(issue.itemUuid))
  const itemIssueRows = buildItemIssueRows(itemLevelIssues, items, tPublish)

  // Metrics
  const kindCounts = items.reduce(
    (acc, item) => {
      acc[item.kind as SupportedStudioItemKind] = (acc[item.kind as SupportedStudioItemKind] ?? 0) + 1
      return acc
    },
    {} as Record<SupportedStudioItemKind, number>,
  )

  const timeLimitMinutes = assessmentState.timeLimitMinutes ? Number(assessmentState.timeLimitMinutes) : null
  const isPublished = lifecycle === 'PUBLISHED'
  const isScheduled = lifecycle === 'SCHEDULED'
  const highStakes = isHighStakesAssessment(assessmentState)
  const canConfirmGate = canConfirmLifecycleChange({
    blockerCount: classifiedIssues.length,
    highStakes,
    successfulPreviewCount: previewedScenarios.size,
  })

  const handlePublish = () => {
    startTransition(() => {
      onLifecycleChange('PUBLISHED', null, auditNote)
      setPendingAction(null)
    })
  }

  const handleSchedule = () => {
    if (!scheduledAt) return
    startTransition(() => {
      onLifecycleChange('SCHEDULED', new Date(scheduledAt).toISOString(), auditNote)
      setScheduleOpen(false)
      setPendingAction(null)
      setScheduledAt('')
    })
  }

  const handleUnpublish = () => {
    startTransition(() => {
      onLifecycleChange('DRAFT')
    })
  }

  return (
    <div className="mx-auto w-full max-w-[92rem] space-y-5 px-4 py-5 md:px-6">
      <div
        className={cn(
          'flex items-center justify-between gap-4 rounded-lg border p-5 shadow-sm',
          isPublished
            ? 'border-lime-300 bg-lime-50 dark:border-lime-800 dark:bg-lime-950/30'
            : isScheduled
              ? 'border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30'
              : hasIssues
                ? 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30'
                : 'border-lime-300 bg-lime-50 dark:border-lime-800 dark:bg-lime-950/30',
        )}
      >
        <div className="flex items-center gap-3">
          {isPublished ? (
            <CheckCircle2 className="size-6 text-lime-600 dark:text-lime-400" />
          ) : isScheduled ? (
            <CalendarClock className="size-6 text-blue-600 dark:text-blue-400" />
          ) : hasIssues ? (
            <AlertTriangle className="size-6 text-amber-600 dark:text-amber-400" />
          ) : (
            <CheckCircle2 className="size-6 text-lime-600 dark:text-lime-400" />
          )}
          <div>
            <p className="font-semibold">
              {isPublished
                ? tPublish('statusPublished')
                : isScheduled
                  ? tPublish('statusScheduled')
                  : hasIssues
                    ? tPublish('statusHasIssues', {
                        count: classifiedIssues.length,
                      })
                    : tPublish('statusReadyToPublish')}
            </p>
            <p className="text-muted-foreground text-sm">
              {isPublished
                ? tPublish('statusPublishedDesc')
                : isScheduled
                  ? tPublish('statusScheduledDesc')
                  : hasIssues
                    ? tPublish('statusHasIssuesDesc')
                    : tPublish('statusReadyDesc')}
            </p>
          </div>
        </div>

        {/* Publish actions */}
        <div className="flex items-center gap-2">
          {isPublished || isScheduled ? (
            <Button variant="outline" size="sm" disabled={isPending} onClick={handleUnpublish}>
              {tPublish('revertToDraft')}
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                disabled={isPending || hasIssues || !canPublish}
                onClick={() => setPendingAction('publish')}
              >
                <Send className="size-4" />
                {tPublish('publishNow')}
              </Button>
              <Popover open={scheduleOpen} onOpenChange={setScheduleOpen}>
                <PopoverTrigger
                  render={
                    <Button variant="outline" size="sm" disabled={isPending || !canSchedule}>
                      <CalendarClock className="size-4" />
                      {tPublish('schedule')}
                      <ChevronDown className="size-3" />
                    </Button>
                  }
                />
                <PopoverContent align="end" className="w-64 space-y-3 p-3">
                  <p className="text-sm font-medium">{tPublish('schedulePublication')}</p>
                  <CalendarDateTimePicker value={scheduledAt} onChange={setScheduledAt} />
                  <Button
                    size="sm"
                    className="w-full"
                    disabled={isPending || !scheduledAt || !canSchedule}
                    onClick={() => {
                      setPendingAction('schedule')
                      setScheduleOpen(false)
                    }}
                  >
                    <CalendarClock className="mr-1 size-4" />
                    {tPublish('schedule')}
                  </Button>
                </PopoverContent>
              </Popover>
            </>
          )}
        </div>
      </div>

      <StudentPreviewPanel
        activeScenario={activeScenario}
        previewedScenarios={previewedScenarios}
        specificLearner={specificLearner}
        highStakes={highStakes}
        onScenarioChange={setActiveScenario}
        onSpecificLearnerChange={setSpecificLearner}
        onRunPreview={() => {
          setPreviewedScenarios(current => new Set(current).add(activeScenario))
        }}
      />

      <LifecycleAuditTimeline
        lifecycle={lifecycle}
        scheduledAt={persistedScheduledAt ?? null}
        publishedAt={publishedAt ?? null}
        archivedAt={archivedAt ?? null}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(18rem,0.42fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <h3 className="text-sm font-semibold">{tPublish('metricsTitle')}</h3>

          <div className="grid grid-cols-2 gap-3">
            <MetricCard icon={BookOpen} label={tPublish('totalQuestions')} value={String(items.length)} />
            <MetricCard icon={Trophy} label={tPublish('totalPoints')} value={String(totalPoints)} />
            {timeLimitMinutes ? (
              <MetricCard
                icon={Clock}
                label={tPublish('timeLimit')}
                value={tPublish('timeLimitValue', { minutes: timeLimitMinutes })}
              />
            ) : null}
            <MetricCard
              icon={Target}
              label={tPublish('attemptLimit')}
              value={assessmentState.maxAttempts || tPublish('unlimited')}
            />
          </div>

          {/* Breakdown by kind */}
          {Object.entries(kindCounts).length > 0 ? (
            <div className="bg-card rounded-lg border p-4 shadow-sm">
              <p className="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase">
                {tPublish('questionTypes')}
              </p>
              <div className="space-y-2">
                {(Object.entries(kindCounts) as [SupportedStudioItemKind, number][]).map(([kind, count]) => {
                  const Icon = KIND_ICONS[kind] ?? BookOpen
                  const percent = items.length > 0 ? Math.round((count / items.length) * 100) : 0
                  return (
                    <div key={kind} className="flex items-center gap-2">
                      <Icon className="text-muted-foreground size-3.5 shrink-0" />
                      <span className="min-w-0 flex-1 truncate text-xs">{kind.replaceAll('_', ' ')}</span>
                      <Badge variant="secondary" className="text-xs">
                        {count}
                      </Badge>
                      <div className="bg-muted h-1.5 w-16 overflow-hidden rounded-full">
                        <div
                          className="bg-primary h-full rounded-full transition-all duration-500"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-semibold">{tPublish('preflightTitle')}</h3>

          {!hasIssues ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-green-300 bg-green-50 p-8 text-center dark:border-green-800 dark:bg-green-950/30">
              <CheckCircle2 className="size-10 text-green-600 dark:text-green-400" />
              <p className="mt-3 font-semibold text-green-900 dark:text-green-100">{tPublish('noIssues')}</p>
              <p className="text-muted-foreground mt-1 text-sm">{tPublish('noIssuesDesc')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {assessmentLevelIssues.length > 0 ? (
                <div className="bg-card rounded-lg border p-4 shadow-sm">
                  <p className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
                    {tPublish('assessmentIssues')}
                  </p>
                  <div className="space-y-2">
                    {assessmentLevelIssues.map((issue, i) => (
                      <ChecklistItem
                        key={i}
                        message={issue.message}
                        onNavigate={() => onSwitchToBuilder()}
                        navigateLabel={
                          issue.actionLabel ??
                          (issue.code === 'assessment.empty' ? tPublish('goToQuestions') : tPublish('goToSetup'))
                        }
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              {itemIssueRows.length > 0 ? (
                <div className="bg-card rounded-lg border p-4 shadow-sm">
                  <p className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
                    {tPublish('questionIssues')}
                  </p>
                  <div className="space-y-2">
                    {itemIssueRows.map(row => (
                      <ChecklistItem
                        key={row.key}
                        message={row.message}
                        context={row.context}
                        details={row.details}
                        onNavigate={() => onSwitchToBuilder(row.itemUuid)}
                        navigateLabel={row.actionLabel}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <LifecycleConfirmationDialog
        action={pendingAction}
        open={pendingAction !== null}
        scheduledAt={scheduledAt}
        itemCount={items.length}
        totalPoints={totalPoints}
        timeLimitMinutes={timeLimitMinutes}
        attemptLimit={assessmentState.maxAttempts || tPublish('unlimited')}
        effectiveLearnerCount={accessQuery.data?.effective_user_count ?? null}
        highStakes={highStakes}
        previewCount={previewedScenarios.size}
        canConfirm={canConfirmGate}
        auditNote={auditNote}
        onAuditNoteChange={setAuditNote}
        onCancel={() => setPendingAction(null)}
        onConfirm={pendingAction === 'schedule' ? handleSchedule : handlePublish}
      />
    </div>
  )
}

function LifecycleAuditTimeline({
  lifecycle,
  scheduledAt,
  publishedAt,
  archivedAt,
}: {
  lifecycle: AssessmentLifecycle
  scheduledAt: string | null
  publishedAt: string | null
  archivedAt: string | null
}) {
  const tPublish = useTranslations('Features.Assessments.Studio.PublishDashboard')
  const locale = useLocale()
  const entries = [
    { key: 'draft', label: tPublish('auditDraft'), value: tPublish('auditPresent') },
    scheduledAt
      ? { key: 'scheduled', label: tPublish('auditScheduled'), value: formatAuditDate(scheduledAt, locale) }
      : null,
    publishedAt
      ? { key: 'published', label: tPublish('auditPublished'), value: formatAuditDate(publishedAt, locale) }
      : null,
    archivedAt
      ? { key: 'archived', label: tPublish('auditArchived'), value: formatAuditDate(archivedAt, locale) }
      : null,
  ].filter((entry): entry is { key: string; label: string; value: string } => entry !== null)

  return (
    <section className="bg-card rounded-lg border p-5 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">{tPublish('auditTimelineTitle')}</h2>
          <p className="text-muted-foreground text-sm">{tPublish('auditTimelineDesc')}</p>
        </div>
        <Badge variant="outline">{tPublish(`auditLifecycle.${lifecycle}`)}</Badge>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        {entries.map(entry => (
          <div key={entry.key} className="rounded-md border p-3">
            <p className="text-muted-foreground text-xs">{entry.label}</p>
            <p className="mt-1 text-sm font-medium">{entry.value}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function StudentPreviewPanel({
  activeScenario,
  previewedScenarios,
  specificLearner,
  highStakes,
  onScenarioChange,
  onSpecificLearnerChange,
  onRunPreview,
}: {
  activeScenario: PreviewScenarioId
  previewedScenarios: Set<PreviewScenarioId>
  specificLearner: string
  highStakes: boolean
  onScenarioChange: (scenario: PreviewScenarioId) => void
  onSpecificLearnerChange: (value: string) => void
  onRunPreview: () => void
}) {
  const tPublish = useTranslations('Features.Assessments.Studio.PublishDashboard')
  const scenario = PREVIEW_SCENARIOS.find(item => item.id === activeScenario) ?? {
    id: 'genericLearner',
    titleKey: 'previewScenarioGeneric',
    descriptionKey: 'previewScenarioGenericDesc',
    outcomeKey: 'previewOutcomeGeneric',
  }
  const currentScenarioComplete = previewedScenarios.has(activeScenario)

  return (
    <section className="bg-card rounded-lg border p-5 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <div className="bg-muted rounded-md border p-2">
            <Eye className="text-muted-foreground size-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold">{tPublish('previewGateTitle')}</h2>
            <p className="text-muted-foreground text-sm">
              {highStakes ? tPublish('previewGateHighStakesDesc') : tPublish('previewGateDesc')}
            </p>
          </div>
        </div>
        <Badge variant={previewedScenarios.size > 0 ? 'success' : highStakes ? 'warning' : 'outline'}>
          {tPublish('previewCompletedCount', { count: previewedScenarios.size })}
        </Badge>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {PREVIEW_SCENARIOS.map(item => (
            <Button
              key={item.id}
              type="button"
              variant={activeScenario === item.id ? 'default' : 'outline'}
              className="h-auto justify-start px-3 py-2 text-left"
              onClick={() => onScenarioChange(item.id)}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{tPublish(item.titleKey)}</span>
                <span className="block truncate text-xs opacity-80">{tPublish(item.descriptionKey)}</span>
              </span>
            </Button>
          ))}
        </div>

        <div className="rounded-lg border p-4">
          <div className="space-y-3">
            <div>
              <p className="text-sm font-semibold">{tPublish(scenario.titleKey)}</p>
              <p className="text-muted-foreground mt-1 text-xs">{tPublish(scenario.outcomeKey)}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="preview-specific-learner">{tPublish('specificLearnerLabel')}</Label>
              <Input
                id="preview-specific-learner"
                value={specificLearner}
                disabled={activeScenario !== 'specificLearner'}
                placeholder={tPublish('specificLearnerPlaceholder')}
                onChange={event => onSpecificLearnerChange(event.target.value)}
              />
            </div>
            <Button className="w-full" onClick={onRunPreview}>
              <Eye className="size-4" />
              {currentScenarioComplete ? tPublish('rerunPreview') : tPublish('runPreview')}
            </Button>
            <p className="text-muted-foreground text-xs" aria-live="polite">
              {currentScenarioComplete ? tPublish('previewScenarioPassed') : tPublish('previewScenarioPending')}
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

function formatAuditDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function LifecycleConfirmationDialog({
  action,
  open,
  scheduledAt,
  itemCount,
  totalPoints,
  timeLimitMinutes,
  attemptLimit,
  effectiveLearnerCount,
  highStakes,
  previewCount,
  canConfirm,
  auditNote,
  onAuditNoteChange,
  onCancel,
  onConfirm,
}: {
  action: 'publish' | 'schedule' | null
  open: boolean
  scheduledAt: string
  itemCount: number
  totalPoints: number
  timeLimitMinutes: number | null
  attemptLimit: string
  effectiveLearnerCount: number | null
  highStakes: boolean
  previewCount: number
  canConfirm: boolean
  auditNote: string
  onAuditNoteChange: (value: string) => void
  onCancel: () => void
  onConfirm: () => void
}) {
  const tPublish = useTranslations('Features.Assessments.Studio.PublishDashboard')
  const isSchedule = action === 'schedule'

  return (
    <Dialog open={open} onOpenChange={nextOpen => (!nextOpen ? onCancel() : null)}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isSchedule ? tPublish('scheduleConfirmTitle') : tPublish('publishConfirmTitle')}</DialogTitle>
          <DialogDescription>
            {isSchedule ? tPublish('scheduleConfirmDesc') : tPublish('publishConfirmDesc')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <ImpactRow
              label={tPublish('impactLearners')}
              value={effectiveLearnerCount === null ? tPublish('unknown') : String(effectiveLearnerCount)}
            />
            <ImpactRow label={tPublish('impactQuestions')} value={String(itemCount)} />
            <ImpactRow label={tPublish('impactPoints')} value={String(totalPoints)} />
            <ImpactRow
              label={tPublish('impactTimeLimit')}
              value={
                timeLimitMinutes ? tPublish('timeLimitValue', { minutes: timeLimitMinutes }) : tPublish('unlimited')
              }
            />
            <ImpactRow label={tPublish('impactAttempts')} value={attemptLimit} />
            <ImpactRow label={tPublish('impactPreviews')} value={String(previewCount)} />
            {isSchedule ? (
              <ImpactRow
                label={tPublish('impactSchedule')}
                value={scheduledAt ? new Date(scheduledAt).toLocaleString() : tPublish('unknown')}
              />
            ) : null}
          </div>

          {highStakes ? (
            <div className="space-y-2 rounded-lg border p-3">
              <Label htmlFor="publish-audit-note">{tPublish('auditNoteLabel')}</Label>
              <Textarea
                id="publish-audit-note"
                value={auditNote}
                maxLength={1000}
                placeholder={tPublish('auditNotePlaceholder')}
                onChange={event => onAuditNoteChange(event.target.value)}
              />
              <p className="text-muted-foreground text-xs">{tPublish('auditNoteDesc')}</p>
            </div>
          ) : null}

          {!canConfirm ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
              {highStakes && previewCount === 0
                ? tPublish('previewRequiredBeforePublish')
                : tPublish('blockersRequiredBeforePublish')}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            {tPublish('cancel')}
          </Button>
          <Button disabled={!canConfirm} onClick={onConfirm}>
            {isSchedule ? tPublish('confirmSchedule') : tPublish('confirmPublish')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ImpactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border px-3 py-2">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  )
}

function MetricCard({ icon: Icon, label, value }: { icon: typeof BookOpen; label: string; value: string }) {
  return (
    <div className="bg-card rounded-lg border p-3 shadow-sm">
      <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <Icon className="size-3.5 shrink-0" />
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1 truncate text-lg font-bold">{value}</div>
    </div>
  )
}

interface PublishChecklistRow {
  key: string
  itemUuid: string
  context: string
  message: string
  details: string[]
  actionLabel: string
}

function buildItemIssueRows(
  issues: ClassifiedValidationIssue[],
  items: AssessmentItem[],
  tPublish: ReturnType<typeof useTranslations<'Features.Assessments.Studio.PublishDashboard'>>,
): PublishChecklistRow[] {
  const rows = new Map<string, ClassifiedValidationIssue[]>()
  for (const issue of issues) {
    if (!issue.itemUuid) continue
    const current = rows.get(issue.itemUuid) ?? []
    current.push(issue)
    rows.set(issue.itemUuid, current)
  }

  return [...rows.entries()].map(([itemUuid, itemIssues]) => {
    const itemIndex = items.findIndex(item => item.item_uuid === itemUuid)
    const itemTitle =
      itemIndex !== -1 ? items[itemIndex]?.title || tPublish('untitledQuestion') : tPublish('unknownQuestion')
    const context =
      itemIndex !== -1 ? tPublish('questionContext', { number: itemIndex + 1, title: itemTitle }) : itemTitle
    const firstIssue = itemIssues[0]

    return {
      key: itemUuid,
      itemUuid,
      context,
      message:
        itemIssues.length === 1
          ? (firstIssue?.message ?? tPublish('questionIssueSummary', { count: itemIssues.length }))
          : tPublish('questionIssueSummary', { count: itemIssues.length }),
      details: itemIssues.map(issue => issue.message),
      actionLabel: firstIssue?.actionLabel ?? tPublish('goToQuestion'),
    }
  })
}

function ChecklistItem({
  message,
  context,
  details,
  onNavigate,
  navigateLabel,
}: {
  message: string
  context?: string
  details?: string[]
  onNavigate?: () => void
  navigateLabel?: string
}) {
  return (
    <div className="flex items-start gap-2.5 rounded-md border border-yellow-200 bg-yellow-50/70 px-3 py-2 dark:border-yellow-800 dark:bg-yellow-950/20">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-yellow-700 dark:text-yellow-300" />
      <div className="min-w-0 flex-1">
        {context ? <p className="text-[10px] font-medium text-yellow-700 dark:text-yellow-300">{context}</p> : null}
        <p className="text-xs text-yellow-900 dark:text-yellow-200">{message}</p>
        {details && details.length > 1 ? (
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-yellow-800 dark:text-yellow-200/90">
            {details.slice(0, 3).map(detail => (
              <li key={detail}>{detail}</li>
            ))}
          </ul>
        ) : null}
      </div>
      {onNavigate ? (
        <Button
          type="button"
          variant="link"
          size="sm"
          onClick={onNavigate}
          className="h-auto shrink-0 p-0 text-[10px] font-medium text-yellow-700 underline-offset-2 hover:text-yellow-900 dark:text-yellow-300 dark:hover:text-yellow-100"
        >
          {navigateLabel}
          <ExternalLink className="ml-0.5 inline size-2.5" />
        </Button>
      ) : null}
    </div>
  )
}
