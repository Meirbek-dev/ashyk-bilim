'use client'

import { fromUnix } from '@/lib/api/contract'
import { DATE_TIME_OPTIONS, formatDate } from '@/lib/date'

import { getAnalyticsCodeLabel, getAnalyticsReasonCodeLabel, getAnalyticsRiskLevelLabel } from '@/lib/analytics/labels'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { AnalyticsQuery, AtRiskLearnerRow } from '@/types/analytics'
import { createTeacherIntervention, getTeacherInterventions } from '@services/analytics/teacher'
import type { TeacherInterventionCreate, TeacherInterventionRow } from '@services/analytics/teacher'
import AnalyticsDataTable from './AnalyticsDataTable'
import type { DataTableColumnDef } from '@/components/ui/data-table'
import { InlineError } from '@/components/ui/error-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useMemo, useRef, useState } from 'react'
import type React from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Link, useRouter } from '@/i18n/navigation'
import { ClipboardList, MessageSquare, Route, UserCheck } from 'lucide-react'
import { useApiError } from '@/hooks/useApiError'
import { isApiError } from '@/lib/api/assertSuccess'
import { usePercentFormat } from '@/features/assessments/shared/usePercentFormat'

interface AtRiskLearnersTableProps {
  title?: string
  description?: string
  rows: AtRiskLearnerRow[]
  storageKey?: string
  serverPaginated?: boolean
  query?: AnalyticsQuery
}

type EnhancedAtRiskLearnerRow = AtRiskLearnerRow

const riskVariant = (level: AtRiskLearnerRow['risk_level']) => {
  if (level === 'high') return 'destructive'
  if (level === 'medium') return 'warning'
  return 'outline'
}

const teacherInterventionsQueryOptions = (
  row: Pick<EnhancedAtRiskLearnerRow, 'course_id' | 'user_id'>,
  query?: AnalyticsQuery,
  enabled = true,
) =>
  queryOptions({
    queryKey: ['teacher-interventions', row.course_id, row.user_id, query] as const,
    queryFn: () => getTeacherInterventions({ course_id: row.course_id, user_id: row.user_id }, query),
    enabled,
  })

export default function AtRiskLearnersTable({
  title,
  description,
  rows,
  storageKey,
  serverPaginated,
  query,
}: AtRiskLearnersTableProps) {
  const t = useTranslations('TeacherAnalytics')
  const percent = usePercentFormat()
  const resolvedTitle = title ?? t('atRisk.defaultTitle')
  const resolvedDescription = description ?? t('atRisk.defaultDescription')
  // The server component hands a fresh `query` object on every refresh; key
  // the memo on its content so the columns keep their identity.
  const queryKey = JSON.stringify(query ?? null)
  // UX-114: `cell` functions render as components (`<Cell />`), so a new
  // columns array on every render remounted every cell — the intervention
  // dialog's trigger included, which dropped focus to <body> after
  // `router.refresh()`. Memoized, the rows update in place.
  // `t` and `percent` are re-created when `router.refresh()` re-runs the layout
  // (new messages object) — read them through refs so the memo never invalidates.
  const tRef = useRef(t)
  tRef.current = t
  const percentRef = useRef(percent)
  percentRef.current = percent
  const columns = useMemo((): DataTableColumnDef<AtRiskLearnerRow>[] => {
    const memoQuery: AnalyticsQuery | undefined = queryKey === 'null' ? undefined : JSON.parse(queryKey)
    const t = (key: string, values?: Record<string, string | number>) => (values ? tRef.current(key, values) : tRef.current(key))
    const percent = (value: number) => percentRef.current(value)
    return [
      {
        accessorKey: 'user_display_name',
        header: () => t('atRisk.colLearner'),
        cell: ({ row }) => {
          const courseHref = row.original.course_id ? `/dash/analytics/courses/${row.original.course_id}` : undefined
          return (
            <div>
              <div className="text-foreground font-medium">{row.original.user_display_name}</div>
              {courseHref && (
                <Link href={courseHref} className="text-primary mt-0.5 block text-xs hover:underline">
                  {row.original.course_name}
                </Link>
              )}
            </div>
          )
        },
      },
      { accessorKey: 'course_name', header: () => t('atRisk.colCourse') },
      {
        accessorKey: 'progress_pct',
        header: () => t('atRisk.colProgress'),
        cell: ({ row }) => percent(row.original.progress_pct),
      },
      {
        accessorKey: 'days_since_last_activity',
        header: () => t('atRisk.colInactivity'),
        cell: ({ row }) =>
          row.original.days_since_last_activity == null
            ? t('atRisk.na')
            : t('units.days', { value: row.original.days_since_last_activity }),
      },
      {
        accessorKey: 'risk_score',
        header: () => t('atRisk.colRisk'),
        cell: ({ row }) => {
          const riskRow = row.original
          const c = riskRow.risk_components ?? {
            inactivity: 0,
            progress: 0,
            failures: 0,
            missing: 0,
            grading: 0,
          }
          return (
            <div className="space-y-1">
              <Badge variant={riskVariant(riskRow.risk_level)}>
                {getAnalyticsRiskLevelLabel(t, riskRow.risk_level)} · {riskRow.risk_score}
              </Badge>
              {riskRow.risk_trend && riskRow.risk_trend !== 'stable' && (
                <div className="text-muted-foreground text-[11px]">
                  {getAnalyticsCodeLabel(t, riskRow.risk_trend)}
                  {riskRow.risk_score_delta !== null && riskRow.risk_score_delta !== undefined
                    ? ` (${riskRow.risk_score_delta > 0 ? '+' : ''}${riskRow.risk_score_delta})`
                    : ''}
                </div>
              )}
              {/* Readable component breakdown replacing the old I/P/F/M/G abbreviations */}
              <div className="text-muted-foreground max-w-[280px] text-[11px] leading-4">
                {[
                  [t('atRisk.riskComponents.inactivity'), c.inactivity],
                  [t('atRisk.riskComponents.progress'), c.progress],
                  [t('atRisk.riskComponents.failures'), c.failures],
                  [t('atRisk.riskComponents.missing'), c.missing],
                  [t('atRisk.riskComponents.grading'), c.grading],
                ]
                  .filter(([, v]) => (v as number) > 0)
                  .map(([label, v]) => `${label} ${Math.round(v as number)}`)
                  .join(' · ')}
              </div>
            </div>
          )
        },
      },
      {
        accessorKey: 'reason_codes',
        header: () => t('atRisk.colReasons'),
        cell: ({ row }) => (
          <div className="text-muted-foreground max-w-[220px] text-xs whitespace-normal">
            {row.original.reason_codes.map((code: string) => getAnalyticsReasonCodeLabel(t, code)).join(', ')}
            {row.original.why_now && (
              <div className="mt-1 text-[11px]">{getAnalyticsCodeLabel(t, row.original.why_now)}</div>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'recommended_action',
        header: () => t('atRisk.colAction'),
        cell: ({ row }) => {
          const riskRow = row.original
          const hasGradingBlock = riskRow.open_grading_blocks > 0
          const gradingHref = riskRow.course_id ? `/dash/analytics/courses/${riskRow.course_id}` : '/dash/courses'
          return (
            <div className="text-muted-foreground max-w-[280px] space-y-1 text-sm whitespace-normal">
              <span>{getAnalyticsCodeLabel(t, riskRow.recommended_action)}</span>
              <div className="text-[11px]">
                {riskRow.intervention_count
                  ? t('atRisk.interventionsCount', { count: riskRow.intervention_count })
                  : t('atRisk.noInterventions')}
              </div>
              <InterventionStateBadge row={riskRow} />
              {hasGradingBlock && gradingHref && (
                <Link href={gradingHref} className="text-primary block text-xs hover:underline">
                  {t('atRisk.gradeSubmissions', {
                    count: riskRow.open_grading_blocks,
                  })}{' '}
                  →
                </Link>
              )}
              <LearnerInterventionDialog row={riskRow} query={memoQuery} />
            </div>
          )
        },
      },
    ]
  }, [queryKey])

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>{resolvedTitle}</CardTitle>
        <CardDescription>{resolvedDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        <AnalyticsDataTable
          columns={columns}
          data={rows}
          {...(storageKey ? { storageKey } : {})}
          {...(serverPaginated === undefined ? {} : { serverPaginated })}
          searchPlaceholder={t('atRisk.searchPlaceholder')}
          emptyMessage={t('atRisk.emptyMessage')}
        />
      </CardContent>
    </Card>
  )
}

export function InterventionStateBadge({ row }: { row: EnhancedAtRiskLearnerRow }) {
  const t = useTranslations('TeacherAnalytics')
  if (row.risk_trend === 'recovered' || row.last_intervention_type === 'learner_recovered') {
    return (
      <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
        {t('intervention.resolved')}
      </Badge>
    )
  }

  if (typeof row.risk_score_delta === 'number' && row.risk_score_delta < 0) {
    return (
      <Badge variant="outline" className="border-blue-300 text-blue-700 dark:text-blue-300">
        {t('intervention.improving')} {row.risk_score_delta}
      </Badge>
    )
  }

  // Status is fixed at creation by the type (no PATCH on the wire): messages complete at once, meetings/drafts stay planned.
  if (row.last_intervention_type === 'meeting_scheduled' || row.last_intervention_type === 'extension_granted') {
    return <Badge variant="warning">{t('intervention.open')}</Badge>
  }

  if (row.intervention_count && row.intervention_count > 0) {
    return <Badge variant="outline">{t('intervention.completed')}</Badge>
  }

  return <Badge variant="outline">{t('intervention.none')}</Badge>
}

function LearnerInterventionDialog({
  query,
  row,
}: {
  query?: AnalyticsQuery | undefined
  row: EnhancedAtRiskLearnerRow
}) {
  const t = useTranslations('TeacherAnalytics')
  const router = useRouter()
  const queryClient = useQueryClient()
  const { toastApiError } = useApiError()
  const [open, setOpen] = useState(false)
  const [logged, setLogged] = useState(false)
  const [pendingType, setPendingType] = useState<TeacherInterventionCreate['intervention_type'] | null>(null)
  const [draft, setDraft] = useState(() =>
    t('intervention.draftTemplate', {
      learner: row.user_display_name,
      course: row.course_name,
      reasons:
        row.reason_codes.map((code: string) => getAnalyticsReasonCodeLabel(t, code)).join(', ') ||
        getAnalyticsCodeLabel(t, row.top_contributing_factor) ||
        t('intervention.needsReview'),
      action: getAnalyticsCodeLabel(t, row.recommended_action),
    }),
  )
  const auditOptions = teacherInterventionsQueryOptions(row, query, open)
  const audit = useQuery(auditOptions)

  async function logIntervention(
    payload: Pick<TeacherInterventionCreate, 'intervention_type' | 'status' | 'outcome' | 'notes' | 'payload'>,
  ) {
    setPendingType(payload.intervention_type)
    try {
      await createTeacherIntervention(
        {
          user_id: row.user_id,
          course_id: row.course_id,
          ...payload,
        },
        query,
      )
      await queryClient.invalidateQueries({ queryKey: auditOptions.queryKey })
      setLogged(true)
      toast.success(t('atRisk.interventionLogged'))
    } catch (error) {
      // UX-114: the learner left the course while the dialog was open.
      if (isApiError(error) && error.fieldErrors.some(f => f.field === 'user_id' && f.code === 'not-in-course')) {
        toast.error(t('atRisk.learnerNotEnrolled'))
      } else {
        toastApiError(error, { fallback: t('atRisk.interventionLogFailed') })
      }
    } finally {
      setPendingType(null)
    }
  }

  const actions: {
    icon: React.ReactNode
    label: string
    payload: Pick<TeacherInterventionCreate, 'intervention_type' | 'status' | 'outcome' | 'notes' | 'payload'>
  }[] = [
    {
      icon: <MessageSquare className="size-3.5" />,
      label: t('atRisk.interventions.message'),
      payload: {
        intervention_type: 'message_sent',
        status: 'completed',
        outcome: 'learner_contacted',
        notes: row.recommended_action,
      },
    },
    {
      icon: <ClipboardList className="size-3.5" />,
      label: t('atRisk.interventions.meeting'),
      payload: {
        intervention_type: 'meeting_scheduled',
        status: 'planned',
        outcome: 'check_in_scheduled',
        notes: row.why_now ?? row.recommended_action,
      },
    },
    {
      icon: <Route className="size-3.5" />,
      label: t('intervention.saveDraft'),
      payload: {
        intervention_type: 'extension_granted',
        status: 'planned',
        outcome: 'remediation_draft_prepared',
        notes: draft,
        payload: {
          reason_codes: row.reason_codes,
          remediation_draft: draft,
          risk_score: row.risk_score,
        },
      },
    },
    {
      icon: <UserCheck className="size-3.5" />,
      label: t('atRisk.interventions.recovered'),
      payload: {
        intervention_type: 'learner_recovered',
        status: 'resolved',
        outcome: 'recovered_from_risk',
        notes: 'risk_resolved_after_review',
      },
    },
  ]
  const dialogDescription = t('intervention.riskDescription', {
    course: row.course_name,
    score: row.risk_score,
    level: getAnalyticsRiskLevelLabel(t, row.risk_level),
  })

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        setOpen(next)
        // The at-risk rows come from the server component: refresh them once
        // the dialog closes so the count and state badge update without a
        // reload (refreshing while open would reset the dialog's state).
        if (!next && logged) {
          setLogged(false)
          router.refresh()
        }
      }}
    >
      <DialogTrigger render={<Button type="button" variant="outline" size="sm" className="mt-1 h-7 px-2 text-xs" />}>
        {t('intervention.manage')}
      </DialogTrigger>
      {/* The base popup caps at `sm:max-w-sm`; without the breakpoint prefix the
          wider grid squeezed the buttons to 22 px and the dialog grew past the
          viewport with nothing to scroll. */}
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{row.user_display_name}</DialogTitle>
          <DialogDescription>{dialogDescription}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="space-y-4">
            <div className="rounded-lg border p-3">
              <div className="mb-2 text-sm font-medium">{t('intervention.recommendedAction')}</div>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {getAnalyticsCodeLabel(t, row.recommended_action)}
              </p>
              {row.why_now ? (
                <p className="text-muted-foreground mt-2 text-xs">{getAnalyticsCodeLabel(t, row.why_now)}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor={`remediation-${row.course_id}-${row.user_id}`}>{t('intervention.draftLabel')}</Label>
              <Textarea
                id={`remediation-${row.course_id}-${row.user_id}`}
                value={draft}
                onChange={event => setDraft(event.target.value)}
                rows={5}
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {actions.map(action => (
                <Button
                  key={action.label}
                  type="button"
                  variant={action.payload.status === 'resolved' ? 'default' : 'outline'}
                  disabled={
                    pendingType === action.payload.intervention_type ||
                    (action.payload.intervention_type === 'extension_granted' && draft.trim().length < 12)
                  }
                  onClick={() => void logIntervention(action.payload)}
                >
                  {action.icon}
                  {action.label}
                </Button>
              ))}
            </div>
          </div>
          <InterventionAuditLog
            error={audit.error}
            loading={audit.isLoading}
            rows={audit.isSuccess ? audit.data.items : []}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}

function InterventionAuditLog({
  error,
  loading,
  rows,
}: {
  error: Error | null
  loading: boolean
  rows: TeacherInterventionRow[]
}) {
  const t = useTranslations('TeacherAnalytics')
  const locale = useLocale()
  return (
    <aside className="rounded-lg border p-3">
      <div className="mb-3 text-sm font-medium">{t('intervention.auditLog')}</div>
      {error ? <InlineError description={error.message} error={error} /> : null}
      {loading ? <p className="text-muted-foreground text-sm">{t('intervention.loadingAudit')}</p> : null}
      {!error && !loading && rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('intervention.emptyAudit')}</p>
      ) : null}
      <div className="space-y-3">
        {rows.map(row => (
          <div key={row.id} className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Badge variant={row.status === 'resolved' ? 'secondary' : 'outline'}>
                {getAnalyticsCodeLabel(t, row.status)}
              </Badge>
              <span className="text-muted-foreground text-xs">
                {formatDate(fromUnix(row.created_at_unix), locale, DATE_TIME_OPTIONS)}
              </span>
            </div>
            <div className="text-sm font-medium">{getAnalyticsCodeLabel(t, row.intervention_type)}</div>
            {row.outcome ? (
              <p className="text-muted-foreground text-xs">{getAnalyticsCodeLabel(t, row.outcome)}</p>
            ) : null}
            {row.notes ? (
              <p className="text-muted-foreground line-clamp-3 text-xs">{getAnalyticsCodeLabel(t, row.notes)}</p>
            ) : null}
            <Separator />
          </div>
        ))}
      </div>
    </aside>
  )
}
