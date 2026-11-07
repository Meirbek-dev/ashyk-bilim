import { m } from '#/paraglide/messages'
import type { AssessmentItem, GradedItem } from '#/shared/api/gen/types.gen'
import { Button } from '#/shared/ui/button'

export type QuestionView = 'attention' | 'all'

/**
 * What the teacher has to look at: an answer the auto-grader marked wrong, could not mark, or left for a person. The
 * right ones wait behind «Все вопросы»: in a thirty-question exam they were twenty-eight screens to scroll past.
 */
export function attentionOf(items: readonly AssessmentItem[], graded: ReadonlyMap<string, GradedItem>) {
  const attention = new Set(
    items
      .filter(item => {
        const verdict = graded.get(item.id)
        return !verdict || verdict.needs_manual_review || verdict.correct !== true
      })
      .map(item => item.id),
  )
  const checked = items.filter(item => typeof graded.get(item.id)?.correct === 'boolean').length
  const correct = items.filter(item => graded.get(item.id)?.correct === true).length
  return { attention, checked, correct }
}

type QuestionFilterProps = {
  summary: ReturnType<typeof attentionOf>
  total: number
  view: QuestionView
  onView: (view: QuestionView) => void
}

/** The auto-grader's tally, then «Требуют внимания (n) | Все вопросы (n)» while there is something to fold away. */
export function QuestionFilter({ summary, total, view, onView }: QuestionFilterProps) {
  if (summary.checked === 0) return null
  return (
    <div className="flex flex-col gap-3 border-b pb-6 @2xl/review:flex-row @2xl/review:items-center @2xl/review:justify-between">
      <p className="text-muted-foreground">
        {m.grading_auto_summary({ correct: summary.correct, total: summary.checked })}
      </p>
      {summary.attention.size < total ? (
        <fieldset className="flex gap-1 rounded-lg bg-muted p-1">
          <legend className="sr-only">{m.grading_show_label()}</legend>
          {(['attention', 'all'] as const).map(value => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={view === value ? 'outline' : 'ghost'}
              aria-pressed={view === value}
              className={view === value ? 'bg-background' : 'text-muted-foreground'}
              onClick={() => onView(value)}
            >
              {value === 'attention' ? m.grading_show_attention() : m.grading_show_all()}
              <span className="text-muted-foreground tabular-nums">
                {value === 'attention' ? summary.attention.size : total}
              </span>
            </Button>
          ))}
        </fieldset>
      ) : null}
    </div>
  )
}
