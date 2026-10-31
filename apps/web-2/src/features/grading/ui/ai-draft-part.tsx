import type { ProposalPart } from '#/shared/api/gen/types.gen'

import { DraftCriterion } from './ai-draft-criterion'
import { draftPoints } from './ai-labels'

/** One question of an AI draft (a file task's one part has no title): its points, criteria and comment (B-GRD-43). */
export function DraftPart({ part, titled }: { part: ProposalPart; titled: boolean }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        {titled ? <h3 className="text-lg font-semibold wrap-anywhere">{part.title}</h3> : null}
        <span className="text-sm tabular-nums">{draftPoints(part.calibrated_score, part.max_score)}</span>
      </div>
      <ul className="flex flex-col gap-3">
        {part.criteria.map(criterion => (
          <DraftCriterion key={criterion.criterion_id} criterion={criterion} />
        ))}
      </ul>
      {part.feedback.trim() ? <p className="text-sm wrap-anywhere">{part.feedback}</p> : null}
    </section>
  )
}
