import { m } from '#/paraglide/messages'

import { afterLatePenalty, parseScoreInput } from '../model/scoring'
import { scoreText } from './labels'

/** Under a late attempt's grade: what counts after the penalty, while the grade is typed (B-GRD-32). */
export function LatePenaltyNote({ score, penaltyPct }: { score: string; penaltyPct: number }) {
  const typed = parseScoreInput(score)
  if (penaltyPct <= 0 || typed === null) return null
  return (
    <p className="text-sm text-muted-foreground tabular-nums">
      {m.grading_after_penalty({
        percent: scoreText(penaltyPct),
        score: scoreText(afterLatePenalty(typed, penaltyPct)),
      })}
    </p>
  )
}
