import { m } from '#/paraglide/messages'
import { Button } from '#/shared/ui/button'

import { itemsPercent, parseScoreInput } from '../model/scoring'
import { scoreText } from './labels'

type RubricTotalProps = { rows: readonly { score: string; max: number }[]; onApply: (total: number) => void }

/** The rubric's total as a percent; "Use as the grade" copies it into the grade (B-GRD-32). */
export function RubricTotal({ rows, onApply }: RubricTotalProps) {
  const total = itemsPercent(rows.map(row => ({ score: parseScoreInput(row.score, row.max) ?? 0, max: row.max })))
  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className="text-sm text-muted-foreground tabular-nums">
        {m.grading_rubric_total({ percent: scoreText(total) })}
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={total === null}
        onClick={() => total !== null && onApply(total)}
      >
        {m.grading_rubric_apply()}
      </Button>
    </div>
  )
}
