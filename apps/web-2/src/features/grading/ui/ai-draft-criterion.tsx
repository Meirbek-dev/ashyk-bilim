import { CircleAlert } from 'lucide-react'

import { m } from '#/paraglide/messages'
import type { ProposalCriterion } from '#/shared/api/gen/types.gen'
import { formatNumber } from '#/shared/i18n/format'

import { calibrated } from '../model/ai-draft'
import { roundScore } from '../model/scoring'
import { draftPoints } from './ai-labels'

/**
 * One criterion of an AI draft (B-GRD-43): its points (the raw AI points beside them when calibration moved them), a
 * score without a quote marked, the rationale, the quotes (one not found in the answer marked).
 */
export function DraftCriterion({ criterion }: { criterion: ProposalCriterion }) {
  return (
    <li className="flex flex-col gap-1">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <span className="font-medium wrap-anywhere">{criterion.label}</span>
        <span className="text-sm tabular-nums">
          {draftPoints(criterion.calibrated_score, criterion.max_score)}
          {calibrated(criterion.ai_score, criterion.calibrated_score) ? (
            <span className="text-muted-foreground">
              {' · '}
              {m.grading_ai_raw({ score: formatNumber(roundScore(criterion.ai_score)) })}
            </span>
          ) : null}
        </span>
      </div>
      {criterion.unsupported ? (
        <p className="flex items-center gap-1.5 text-sm text-warning">
          <CircleAlert aria-hidden className="size-4 shrink-0" />
          {m.grading_ai_unsupported()}
        </p>
      ) : null}
      {criterion.rationale.trim() ? <p className="text-sm text-muted-foreground">{criterion.rationale}</p> : null}
      {criterion.evidence.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {criterion.evidence.map(evidence => (
            <li key={evidence.quote} className="border-l-2 pl-3 text-sm">
              <q className="wrap-anywhere">{evidence.quote}</q>
              {evidence.verified ? null : (
                <span className="block text-xs text-warning">{m.grading_ai_quote_unverified()}</span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  )
}
