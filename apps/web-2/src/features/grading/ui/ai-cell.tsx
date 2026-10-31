import { m } from '#/paraglide/messages'
import type { GradeDraftView } from '#/shared/api/gen/types.gen'
import { StatusBadge } from '#/shared/components/status-badge'

import { confidenceText, draftStatus, flagText } from './ai-labels'
import { scoreText } from './labels'

/**
 * The queue's «ИИ» cell (B-GRD-40): a ready or applied draft's proposed (calibrated) score, its confidence and flags;
 * any other draft its state in a word; a work without a draft a quiet dash.
 */
export function AiCell({ draft }: { draft: GradeDraftView | undefined }) {
  if (!draft) return <span className="text-muted-foreground">{m.grading_ai_none()}</span>
  const scored = draft.status === 'ready' || draft.status === 'applied'
  if (!scored) {
    const status = draftStatus(draft.status)
    return <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
  }
  return (
    <span className="flex flex-col gap-1">
      <span className="tabular-nums">{m.grading_ai_proposed({ score: scoreText(draft.calibrated_score) })}</span>
      {draft.confidence === null ? null : (
        <span className="text-xs text-muted-foreground tabular-nums">{confidenceText(draft.confidence)}</span>
      )}
      {draft.status === 'applied' ? (
        <span className="text-xs text-muted-foreground">{draftStatus(draft.status).label}</span>
      ) : null}
      {draft.flags.length > 0 ? (
        <span className="flex flex-wrap gap-1">
          {draft.flags.map(flag => (
            <StatusBadge key={flag} tone="warning">
              {flagText(flag)}
            </StatusBadge>
          ))}
        </span>
      ) : null}
    </span>
  )
}
