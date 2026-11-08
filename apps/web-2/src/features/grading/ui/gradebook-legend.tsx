import { m } from '#/paraglide/messages'

import { scoreText } from './labels'

/**
 * Over the gradebook: the course average in plain sight, how the total is counted one click away (three lines of rules
 * above every visit pushed the table down for a teacher who knows them).
 */
export function GradebookLegend({ average }: { average: number | null | undefined }) {
  return (
    <div className="flex flex-col gap-1 text-sm">
      {average != null ? <p>{m.grading_course_average({ value: scoreText(average) })}</p> : null}
      <details className="max-w-prose text-muted-foreground">
        <summary className="w-fit cursor-pointer rounded-sm transition-colors duration-150 hover:text-foreground">
          {m.grading_total_how()}
        </summary>
        <p className="pt-1">{m.grading_total_legend()}</p>
      </details>
    </div>
  )
}
