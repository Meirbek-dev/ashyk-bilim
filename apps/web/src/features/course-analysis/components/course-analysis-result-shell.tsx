'use client'

import { useMemo, useState } from 'react'
import { AlertTriangleIcon, CheckCircle2Icon, ClipboardCheckIcon, FileTextIcon, ShieldCheckIcon } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'

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
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Spinner } from '@/components/ui/spinner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AIEvidencePanel } from '@/features/ai-experience'
import type { AICitation } from '@/features/ai-experience'

import { useReviewCourseFinding } from '../api/use-course-analysis'
import type { CourseAnalysis } from '../api/use-course-analysis'

interface CourseAnalysisResultShellProps {
  analysis: CourseAnalysis
  courseUuid?: string | null | undefined
  onPublish?: () => void
  publishing?: boolean
}

interface CourseFinding {
  id: string
  title: string
  rationale: string
  priority: 'low' | 'medium' | 'high' | string
  action: string
}

export function CourseAnalysisResultShell({
  analysis,
  courseUuid,
  onPublish,
  publishing,
}: CourseAnalysisResultShellProps) {
  const t = useTranslations('AiExperience.courseAnalysisResultShell')
  const locale = useLocale()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [reviewedEvidence, setReviewedEvidence] = useState(false)
  const [prevUuid, setPrevUuid] = useState(analysis.analysis_uuid)
  const findingReview = useReviewCourseFinding(courseUuid ?? '')

  if (analysis.analysis_uuid !== prevUuid) {
    setPrevUuid(analysis.analysis_uuid)
    setReviewedEvidence(false)
  }
  const citations = useMemo(() => normalizeCitations(analysis.report_json.citations), [analysis.report_json.citations])
  const findings = useMemo(
    () =>
      normalizeFindings(analysis.report_json.recommendations, analysis.report_json.summary, {
        action: t('inspectCitationsAction'),
        title: t('summaryFindingTitle'),
      }),
    [analysis.report_json.recommendations, analysis.report_json.summary, t],
  )
  const risks = useMemo(() => normalizeStringList(analysis.report_json.risks), [analysis.report_json.risks])
  const strengths = useMemo(() => normalizeStringList(analysis.report_json.strengths), [analysis.report_json.strengths])
  const scoreFormatter = useMemo(() => new Intl.NumberFormat(locale), [locale])
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [locale],
  )
  const createdAt = analysis.created_at ? new Date(analysis.created_at) : null
  const needsReview = analysis.status !== 'published'

  return (
    <section className="flex min-w-0 flex-col gap-4">
      {analysis.stale ? <Badge variant="destructive">{t('contentChanged')}</Badge> : null}
      <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={needsReview ? 'secondary' : 'default'}>
              <ShieldCheckIcon data-icon="inline-start" aria-hidden="true" />
              {needsReview ? t('needsReview') : t('published')}
            </Badge>
            {analysis.report_json.confidence ? (
              <Badge variant="outline">{analysis.report_json.confidence}</Badge>
            ) : null}
          </div>
          <h3 className="text-lg leading-tight font-semibold">
            {t('title', { score: scoreFormatter.format(analysis.public_score) })}
          </h3>
          {analysis.previous_public_score !== null && analysis.previous_public_score !== undefined ? (
            <p className="text-muted-foreground text-xs">
              {t('previousScore', { score: scoreFormatter.format(analysis.previous_public_score) })}
            </p>
          ) : null}
          <p className="text-muted-foreground max-w-prose text-sm leading-relaxed break-words">
            {analysis.report_json.summary ?? t('defaultDescription')}
          </p>
          <div className="text-muted-foreground flex flex-wrap gap-3 text-xs">
            <span>
              {analysis.model_name ? t('modelRecorded', { name: analysis.model_name }) : t('modelNotRecorded')}
            </span>
            <span>{t('citationsCount', { count: citations.length })}</span>
            {createdAt && !Number.isNaN(createdAt.valueOf()) ? <span>{dateFormatter.format(createdAt)}</span> : null}
          </div>
        </div>
        {onPublish ? (
          <Button
            type="button"
            disabled={publishing || citations.length === 0 || !reviewedEvidence}
            onClick={() => setConfirmOpen(true)}
          >
            {publishing ? <Spinner data-icon="inline-start" /> : <ClipboardCheckIcon data-icon="inline-start" />}
            {t('publishScore')}
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <ReportList empty={t('noRisks')} icon="risk" items={risks} title={t('criticalBlockers')} />
          <FindingsTable
            findings={findings}
            pending={findingReview.isPending}
            reviews={analysis.report_json.finding_reviews ?? {}}
            onReview={(findingId, action) =>
              findingReview.mutate({ action, analysisUuid: analysis.analysis_uuid, findingId })
            }
          />
          <ReportList empty={t('noStrengths')} icon="strength" items={strengths} title={t('contentStrengths')} />
        </div>
        <div className="min-w-0">
          <AIEvidencePanel citations={citations} courseUuid={courseUuid} />
        </div>
      </div>

      {onPublish ? (
        <Label className="flex items-start gap-3 rounded-lg border p-3 text-sm leading-relaxed">
          <Checkbox
            checked={reviewedEvidence}
            disabled={citations.length === 0}
            onCheckedChange={checked => setReviewedEvidence(checked)}
          />
          <span className="flex flex-col gap-1">
            <span>{t('reviewGateLabel')}</span>
            {!reviewedEvidence ? <span className="text-muted-foreground text-xs">{t('reviewGateHint')}</span> : null}
          </span>
        </Label>
      ) : null}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('publishDialogTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('publishDialogDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancelPublish')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={publishing}
              onClick={() => {
                onPublish?.()
                setConfirmOpen(false)
              }}
            >
              {publishing ? <Spinner data-icon="inline-start" /> : <ClipboardCheckIcon data-icon="inline-start" />}
              {t('confirmPublish')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}

function FindingsTable({
  findings,
  onReview,
  pending,
  reviews,
}: {
  findings: CourseFinding[]
  onReview: (findingId: string, action: 'accepted' | 'dismissed' | 'task_created') => void
  pending: boolean
  reviews: NonNullable<CourseAnalysis['report_json']['finding_reviews']>
}) {
  const t = useTranslations('AiExperience.courseAnalysisResultShell')

  if (findings.length === 0) {
    return (
      <section className="rounded-lg border p-4">
        <h4 className="mb-2 flex items-center gap-2 text-sm font-medium">
          <FileTextIcon data-icon="inline-start" aria-hidden="true" />
          {t('findings')}
        </h4>
        <p className="text-muted-foreground text-sm">{t('noFindings')}</p>
      </section>
    )
  }

  return (
    <section className="rounded-lg border">
      <div className="flex items-center gap-2 p-4">
        <FileTextIcon data-icon="inline-start" aria-hidden="true" />
        <h4 className="text-sm font-medium">{t('findings')}</h4>
      </div>
      <Separator />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('priority')}</TableHead>
            <TableHead>{t('finding')}</TableHead>
            <TableHead>{t('recommendedFix')}</TableHead>
            <TableHead>{t('actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {findings.map(finding => {
            const review = reviews[finding.id]
            return (
              <TableRow key={finding.id}>
                <TableCell className="align-top whitespace-normal">
                  <Badge variant={finding.priority === 'high' ? 'destructive' : 'secondary'}>{finding.priority}</Badge>
                </TableCell>
                <TableCell className="min-w-0 align-top whitespace-normal">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="font-medium">{finding.title}</span>
                    <span className="text-muted-foreground text-sm break-words">{finding.rationale}</span>
                  </div>
                </TableCell>
                <TableCell className="min-w-0 align-top whitespace-normal">
                  <span className="text-sm break-words">{finding.action}</span>
                </TableCell>
                <TableCell className="align-top whitespace-normal">
                  {review ? (
                    <Badge variant="outline">{t(`reviewActions.${review.action}`)}</Badge>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => onReview(finding.id, 'accepted')}
                      >
                        {t('acceptFinding')}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => onReview(finding.id, 'dismissed')}
                      >
                        {t('dismissFinding')}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={pending}
                        onClick={() => onReview(finding.id, 'task_created')}
                      >
                        {t('createTask')}
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </section>
  )
}

function ReportList({
  empty,
  icon,
  items,
  title,
}: {
  empty: string
  icon: 'risk' | 'strength'
  items: string[]
  title: string
}) {
  const Icon = icon === 'risk' ? AlertTriangleIcon : CheckCircle2Icon

  return (
    <section className="rounded-lg border p-4">
      <h4 className="mb-3 flex items-center gap-2 text-sm font-medium">
        <Icon data-icon="inline-start" aria-hidden="true" />
        {title}
      </h4>
      {items.length ? (
        <ul className="flex flex-col gap-2">
          {items.map(item => (
            <li key={item} className="text-muted-foreground text-sm leading-relaxed break-words">
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">{empty}</p>
      )}
    </section>
  )
}

function normalizeCitations(value: unknown): AICitation[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is AICitation => {
    if (!item || typeof item !== 'object') return false
    const candidate = item as Partial<AICitation>
    return (
      typeof candidate.citation_id === 'string' &&
      typeof candidate.label === 'string' &&
      typeof candidate.source_type === 'string' &&
      typeof candidate.excerpt === 'string'
    )
  })
}

function normalizeFindings(
  value: unknown,
  summary: string | undefined,
  fallback: { action: string; title: string },
): CourseFinding[] {
  if (!Array.isArray(value)) {
    return summary
      ? [
          {
            id: 'summary',
            title: fallback.title,
            rationale: summary,
            priority: 'medium',
            action: fallback.action,
          },
        ]
      : []
  }

  return value.flatMap((item, index) => {
    if (!item || typeof item !== 'object') return []
    const candidate = item as Partial<CourseFinding>
    if (typeof candidate.title !== 'string') return []
    return [
      {
        id: typeof candidate.id === 'string' ? candidate.id : `finding-${index}`,
        title: candidate.title,
        rationale: typeof candidate.rationale === 'string' ? candidate.rationale : '',
        priority: typeof candidate.priority === 'string' ? candidate.priority : 'medium',
        action: typeof candidate.action === 'string' ? candidate.action : '',
      },
    ]
  })
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}
