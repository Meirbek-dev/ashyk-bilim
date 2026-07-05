'use client'

import { getAnalyticsReasonCodeLabel, getAnalyticsRiskLevelLabel } from '@/lib/analytics/labels'
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
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useState } from 'react'
import type React from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { ClipboardList, MessageSquare, Route, UserCheck } from 'lucide-react'

interface AtRiskLearnersTableProps {
  title?: string
  description?: string
  rows: AtRiskLearnerRow[]
  storageKey?: string
  serverPaginated?: boolean
  query?: AnalyticsQuery
}

type EnhancedAtRiskLearnerRow = AtRiskLearnerRow & {
  risk_trend?: 'newly_at_risk' | 'worsening' | 'improving' | 'recovered' | 'stable'
  previous_risk_score?: number | null
  risk_score_delta?: number | null
  top_contributing_factor?: string | null
  confidence_level?: 'low' | 'medium' | 'high'
  why_now?: string | null
  intervention_count?: number
  last_intervention_type?: string | null
  last_intervention_at?: string | null
  last_intervention_outcome?: string | null
}

const riskVariant = (level: AtRiskLearnerRow['risk_level']) => {
  if (level === 'high') return 'destructive'
  if (level === 'medium') return 'warning'
  return 'outline'
}

const INTERVENTION_COPY = {
  auditLog: 'Audit log',
  dialogTrigger: 'Manage intervention',
  emptyAudit: 'No interventions logged yet.',
  improving: 'Improving',
  interventionOpen: 'Intervention open',
  loadingAudit: 'Loading interventions...',
  noIntervention: 'No intervention',
  recommendedAction: 'Recommended action',
  remediationDraft: 'Remediation draft',
  remediationDraftLabel: 'Save remediation draft',
  remediationDraftOutcome: 'Remediation draft prepared',
  resolved: 'Resolved',
  resolvedNotes: 'Risk marked resolved after teacher review.',
  risk: 'risk',
}

export default function AtRiskLearnersTable({
  title,
  description,
  rows,
  storageKey,
  serverPaginated,
  query,
}: AtRiskLearnersTableProps) {
  const t = useTranslations('TeacherAnalytics')
  const resolvedTitle = title ?? t('atRisk.defaultTitle')
  const resolvedDescription = description ?? t('atRisk.defaultDescription')
  const columns: DataTableColumnDef<AtRiskLearnerRow>[] = [
    {
      accessorKey: 'user_display_name',
      header: t('atRisk.colLearner'),
      cell: ({ row }) => {
        const courseHref = row.original.course_uuid ? `/dash/analytics/courses/${row.original.course_uuid}` : undefined
        return (
          <div>
            <div className="text-foreground font-medium">{row.original.user_display_name}</div>
            <div className="text-muted-foreground text-xs">
              {t('atRisk.userNumber', { userId: row.original.user_id })}
            </div>
            {courseHref && (
              <Link href={courseHref} className="text-primary mt-0.5 block text-xs hover:underline">
                {row.original.course_name}
              </Link>
            )}
          </div>
        )
      },
    },
    { accessorKey: 'course_name', header: t('atRisk.colCourse') },
    {
      accessorKey: 'progress_pct',
      header: t('atRisk.colProgress'),
      cell: ({ row }) => `${row.original.progress_pct}%`,
    },
    {
      accessorKey: 'days_since_last_activity',
      header: t('atRisk.colInactivity'),
      cell: ({ row }) =>
        row.original.days_since_last_activity === null ? t('atRisk.na') : `${row.original.days_since_last_activity}d`,
    },
    {
      accessorKey: 'risk_score',
      header: t('atRisk.colRisk'),
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
                {riskRow.risk_trend.replaceAll('_', ' ')}
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
      header: t('atRisk.colReasons'),
      cell: ({ row }) => (
        <div className="text-muted-foreground max-w-[220px] text-xs whitespace-normal">
          {row.original.reason_codes.map((code: string) => getAnalyticsReasonCodeLabel(t, code)).join(', ')}
          {row.original.why_now && <div className="mt-1 text-[11px]">{row.original.why_now}</div>}
        </div>
      ),
    },
    {
      accessorKey: 'recommended_action',
      header: t('atRisk.colAction'),
      cell: ({ row }) => {
        const riskRow = row.original
        const hasGradingBlock = riskRow.open_grading_blocks > 0
        const gradingHref = riskRow.course_uuid ? `/dash/analytics/courses/${riskRow.course_uuid}` : '/dash/courses'
        return (
          <div className="text-muted-foreground max-w-[280px] space-y-1 text-sm whitespace-normal">
            <span>{riskRow.recommended_action}</span>
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
            <LearnerInterventionDialog row={riskRow} query={query} />
          </div>
        )
      },
    },
  ]

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

function InterventionStateBadge({ row }: { row: EnhancedAtRiskLearnerRow }) {
  if (row.risk_trend === 'recovered' || row.last_intervention_outcome?.toLowerCase().includes('recovered')) {
    return (
      <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
        {INTERVENTION_COPY.resolved}
      </Badge>
    )
  }

  if (typeof row.risk_score_delta === 'number' && row.risk_score_delta < 0) {
    return (
      <Badge variant="outline" className="border-blue-300 text-blue-700 dark:text-blue-300">
        {INTERVENTION_COPY.improving} {row.risk_score_delta}
      </Badge>
    )
  }

  if (row.intervention_count && row.intervention_count > 0) {
    return <Badge variant="warning">{INTERVENTION_COPY.interventionOpen}</Badge>
  }

  return <Badge variant="outline">{INTERVENTION_COPY.noIntervention}</Badge>
}

function LearnerInterventionDialog({
  query,
  row,
}: {
  query?: AnalyticsQuery | undefined
  row: EnhancedAtRiskLearnerRow
}) {
  const t = useTranslations('TeacherAnalytics')
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [pendingType, setPendingType] = useState<TeacherInterventionCreate['intervention_type'] | null>(null)
  const [draft, setDraft] = useState(() => buildRemediationDraft(row))
  const auditQueryKey = ['teacher-interventions', row.course_id, row.user_id, query] as const
  const audit = useQuery({
    queryKey: auditQueryKey,
    queryFn: () => getTeacherInterventions({ course_id: row.course_id, user_id: row.user_id }, query),
    enabled: open,
  })

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
      await queryClient.invalidateQueries({ queryKey: auditQueryKey })
      toast.success(t('atRisk.interventionLogged'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('atRisk.interventionLogFailed'))
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
        outcome: 'Learner contacted',
        notes: row.recommended_action,
      },
    },
    {
      icon: <ClipboardList className="size-3.5" />,
      label: t('atRisk.interventions.meeting'),
      payload: {
        intervention_type: 'meeting_scheduled',
        status: 'planned',
        outcome: 'Teacher check-in scheduled',
        notes: row.why_now ?? row.recommended_action,
      },
    },
    {
      icon: <Route className="size-3.5" />,
      label: INTERVENTION_COPY.remediationDraftLabel,
      payload: {
        intervention_type: 'extension_granted',
        status: 'planned',
        outcome: INTERVENTION_COPY.remediationDraftOutcome,
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
        outcome: 'Recovered from risk',
        notes: INTERVENTION_COPY.resolvedNotes,
      },
    },
  ]
  const dialogDescription = [row.course_name, `${INTERVENTION_COPY.risk} ${row.risk_score}`, row.risk_level].join(' · ')

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="outline" size="sm" className="mt-1 h-7 px-2 text-xs" />}>
        {INTERVENTION_COPY.dialogTrigger}
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{row.user_display_name}</DialogTitle>
          <DialogDescription>{dialogDescription}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="space-y-4">
            <div className="rounded-lg border p-3">
              <div className="mb-2 text-sm font-medium">{INTERVENTION_COPY.recommendedAction}</div>
              <p className="text-muted-foreground text-sm leading-relaxed">{row.recommended_action}</p>
              {row.why_now ? <p className="text-muted-foreground mt-2 text-xs">{row.why_now}</p> : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor={`remediation-${row.course_id}-${row.user_id}`}>
                {INTERVENTION_COPY.remediationDraft}
              </Label>
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
                    (action.label === INTERVENTION_COPY.remediationDraftLabel && draft.trim().length < 12)
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
  return (
    <aside className="rounded-lg border p-3">
      <div className="mb-3 text-sm font-medium">{INTERVENTION_COPY.auditLog}</div>
      {error ? <InlineError description={error.message} error={error} /> : null}
      {loading ? <p className="text-muted-foreground text-sm">{INTERVENTION_COPY.loadingAudit}</p> : null}
      {!error && !loading && rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{INTERVENTION_COPY.emptyAudit}</p>
      ) : null}
      <div className="space-y-3">
        {rows.map(row => (
          <div key={row.id} className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Badge variant={row.status === 'resolved' ? 'secondary' : 'outline'}>{row.status}</Badge>
              <span className="text-muted-foreground text-xs">{formatAuditDate(row.created_at)}</span>
            </div>
            <div className="text-sm font-medium">{row.intervention_type.replaceAll('_', ' ')}</div>
            {row.outcome ? <p className="text-muted-foreground text-xs">{row.outcome}</p> : null}
            {row.notes ? <p className="text-muted-foreground line-clamp-3 text-xs">{row.notes}</p> : null}
            <Separator />
          </div>
        ))}
      </div>
    </aside>
  )
}

function buildRemediationDraft(row: EnhancedAtRiskLearnerRow) {
  const reasons = row.reason_codes.map((code: string) => code.replaceAll('_', ' ')).join(', ')
  return [
    `Goal: reduce ${row.user_display_name}'s risk in ${row.course_name}.`,
    `Risk drivers: ${reasons || row.top_contributing_factor || 'needs teacher review'}.`,
    `Teacher action: ${row.recommended_action}`,
    'Draft support: assign a short catch-up task, message the learner with one concrete next step, and review progress after the next activity.',
  ].join('\n')
}

function formatAuditDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) return value
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}
