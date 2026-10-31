import { m } from '#/paraglide/messages'
import type { ConceptMastery, CourseId } from '#/shared/api/gen/types.gen'
import { Link } from '#/shared/components/link'
import { StatusBadge } from '#/shared/components/status-badge'
import { formatDate, formatNumber, formatPercent } from '#/shared/i18n/format'

import { percentOf } from '../model/mastery'
import { levelMeta } from './labels'

type MasteryItemProps = {
  concept: ConceptMastery
  /** The learner's own course: «Review» links into the player (B-CON-11); the teacher's sheet leaves them out. */
  reviewIn?: CourseId
}

/** One concept's estimate: level, chance it is known, evidence and its date, the stale marker, what to review. */
export function MasteryItem({ concept, reviewIn }: MasteryItemProps) {
  const meta = levelMeta[concept.level]
  const percent = percentOf(concept.p_known)
  const facts = [
    concept.evidence_count > 0 && percent !== null ? m.concepts_estimate({ percent: formatPercent(percent) }) : null,
    m.concepts_evidence({ count: formatNumber(concept.evidence_count) }),
    concept.last_observed_at === null ? null : m.concepts_last_seen({ date: formatDate(concept.last_observed_at) }),
  ].filter(fact => fact !== null)
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 font-medium wrap-anywhere">{concept.name}</span>
        <StatusBadge tone={meta.tone}>{meta.label()}</StatusBadge>
        {concept.stale ? <StatusBadge tone="warning">{m.concepts_stale()}</StatusBadge> : null}
      </div>
      <p className="text-sm text-muted-foreground tabular-nums">{facts.join(' · ')}</p>
      {reviewIn && concept.review.length > 0 ? (
        <p className="flex flex-wrap gap-x-2 gap-y-1 text-sm">
          <span className="text-muted-foreground">{m.concepts_review()}</span>
          {concept.review.map(activity => (
            <Link
              key={activity.id}
              to="/learn/$courseId/$activityId"
              params={{ courseId: reviewIn, activityId: activity.id }}
            >
              {activity.name}
            </Link>
          ))}
        </p>
      ) : null}
    </div>
  )
}
