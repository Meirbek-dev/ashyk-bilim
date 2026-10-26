import { m } from '#/paraglide/messages'
import { Button } from '#/shared/ui/button'

import { isScoreInputInvalid, typedItemsPercent } from '../model/scoring'
import { scoreText } from './labels'

type RubricTotalProps = { rows: readonly { score: string; max: number }[]; onApply: (total: number) => void }

/** The rubric's total as a percent; "Use as the grade" copies it into the grade (B-GRD-32). */
export function RubricTotal({ rows, onApply }: RubricTotalProps) {
  const total = typedItemsPercent(rows)
  // Fields check on submit: until then a score above its maximum says why there is no total.
  const outOfRange = rows.some(row => isScoreInputInvalid(row.score, row.max))
  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className={outOfRange ? 'text-sm text-destructive' : 'text-sm text-muted-foreground tabular-nums'}>
        {outOfRange ? m.grading_rubric_out_of_range() : m.grading_rubric_total({ percent: scoreText(total) })}
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
