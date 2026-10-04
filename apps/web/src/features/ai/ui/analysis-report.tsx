import { Suspense } from 'react'

import { MarkdownView } from '#/features/markdown'
import { m } from '#/paraglide/messages'
import type { CourseAnalysis, CourseAnalysisStatus, CourseId } from '#/shared/api/gen/types.gen'
import { ListSkeleton } from '#/shared/components/list-skeleton'
import { StatusBadge, type StatusTone } from '#/shared/components/status-badge'
import { formatDate } from '#/shared/i18n/format'

import { analysisStatusLabels } from '../model/labels'
import { Citations } from './citations'
import { FindingRow } from './finding-row'
import { Points } from './points'
import { PublishAnalysis } from './publish-analysis'

const statusTones: Record<CourseAnalysisStatus, StatusTone> = {
  draft: 'neutral',
  needs_human_review: 'warning',
  published: 'success',
}

/** The typed `CourseAnalysis.report` (B-AI-13..15): score, status, summary, strengths, risks, recommendations. */
export function AnalysisReport({ courseId, analysis }: { courseId: CourseId; analysis: CourseAnalysis }) {
  const { report } = analysis
  return (
    <article className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={statusTones[analysis.status]}>{analysisStatusLabels[analysis.status]()}</StatusBadge>
        {analysis.stale ? <StatusBadge tone="warning">{m.ai_analysis_stale()}</StatusBadge> : null}
        <span className="text-sm text-muted-foreground">{formatDate(analysis.created_at_unix)}</span>
      </div>
      <p className="text-lg font-semibold">
        {m.ai_score({ score: analysis.public_score })}
        {analysis.previous_public_score === null ? null : (
          <span className="ms-3 text-sm font-normal text-muted-foreground">
            {m.ai_score_previous({ score: analysis.previous_public_score })}
          </span>
        )}
      </p>
      <Suspense fallback={<ListSkeleton />}>
        <MarkdownView content={report.summary} />
      </Suspense>
      <Points title={m.ai_strengths()} items={report.strengths} />
      <Points title={m.ai_risks()} items={report.risks} />
      <section className="flex flex-col gap-2">
        <h3 className="font-medium">{m.ai_recommendations()}</h3>
        {report.recommendations && report.recommendations.length > 0 ? (
          <ol className="flex flex-col gap-3">
            {report.recommendations.map((recommendation, index) => (
              <FindingRow
                key={recommendation.title}
                courseId={courseId}
                analysisId={analysis.id}
                findingId={`finding-${index}`}
                recommendation={recommendation}
              />
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">{m.ai_none()}</p>
        )}
      </section>
      <Citations citations={report.citations ?? []} />
      {analysis.status === 'published' ? null : <PublishAnalysis courseId={courseId} analysisId={analysis.id} />}
    </article>
  )
}
