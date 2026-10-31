import { m } from '#/paraglide/messages'
import type { GradeDraftView } from '#/shared/api/gen/types.gen'
import { StatusBadge } from '#/shared/components/status-badge'
import { formatNumber } from '#/shared/i18n/format'

import { calibrated } from '../model/ai-draft'
import { confidenceText, flagText } from './ai-labels'
import { scoreText } from './labels'

/**
 * The head of the «Черновик ИИ» card (B-GRD-43): the calibrated score, the raw AI score when calibration moved it, the
 * confidence, how many past grades calibrated it, the flags in words.
 */
export function DraftSummary({ draft }: { draft: GradeDraftView }) {
  const corrections = draft.proposal?.calibration_corrections ?? 0
  return (
    <header className="flex flex-col gap-2">
      <h2 id="grading-ai-draft" className="text-xl font-semibold">
        {m.grading_ai_draft_title()}
      </h2>
      <p className="text-sm tabular-nums">
        {m.grading_ai_proposed({ score: scoreText(draft.calibrated_score) })}
        {calibrated(draft.ai_score, draft.calibrated_score) ? (
          <span className="text-muted-foreground">
            {' · '}
            {m.grading_ai_raw({ score: scoreText(draft.ai_score) })}
          </span>
        ) : null}
        {draft.confidence === null ? null : (
          <span className="text-muted-foreground">
            {' · '}
            {confidenceText(draft.confidence)}
          </span>
        )}
      </p>
      {corrections > 0 ? (
        <p className="text-sm text-muted-foreground">
          {m.grading_ai_calibrated_by({ count: formatNumber(corrections) })}
        </p>
      ) : null}
      {draft.flags.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {draft.flags.map(flag => (
            <StatusBadge key={flag} tone="warning">
              {flagText(flag)}
            </StatusBadge>
          ))}
        </div>
      ) : null}
    </header>
  )
}
