import { Suspense } from 'react'

import { MarkdownView } from '#/features/markdown'
import { m } from '#/paraglide/messages'
import { formatPercent } from '#/shared/i18n/format'
import type { RemediationSession } from '#/shared/api/gen/types.gen'
import { ListSkeleton } from '#/shared/components/list-skeleton'

/** The lesson a grader assigned (B-AI-30): its title, objectives and text, folded; the score once the learner did it. */
export function GateLesson({ gate }: { gate: RemediationSession }) {
  const { lecture } = gate
  return (
    <details className="w-full rounded-md border p-3 text-sm">
      <summary className="cursor-pointer font-medium wrap-anywhere">
        {m.ai_gate_lesson({ title: lecture.title })}
        {gate.score === null ? null : ` · ${m.ai_gate_score({ score: formatPercent(gate.score) })}`}
      </summary>
      <div className="mt-2 flex flex-col gap-2">
        {lecture.learning_objectives && lecture.learning_objectives.length > 0 ? (
          <ul className="list-disc ps-5">
            {lecture.learning_objectives.map(objective => (
              <li key={objective}>{objective}</li>
            ))}
          </ul>
        ) : null}
        <Suspense fallback={<ListSkeleton />}>
          <MarkdownView content={lecture.micro_lecture_markdown} />
        </Suspense>
      </div>
    </details>
  )
}
