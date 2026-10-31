import { useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import type { CourseId } from '#/shared/api/gen/types.gen'

import { weakFirst } from '../model/mastery'
import { myOptions } from '../queries'
import { MasteryItem } from './mastery-item'

/** The learner's level in each approved concept, the weak first with what to review (B-CON-11); none: no block. */
export function MyConceptsList({ courseId }: { courseId: CourseId }) {
  const { data } = useSuspenseQuery(myOptions(courseId))
  if (data.concepts.length === 0) return null
  return (
    <section aria-labelledby="my-concepts" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id="my-concepts" className="text-xl font-semibold">
          {m.concepts_mine_title()}
        </h2>
        <p className="max-w-prose text-sm text-muted-foreground">{m.concepts_mine_intro()}</p>
      </div>
      <ul className="flex flex-col gap-4">
        {weakFirst(data.concepts).map(concept => (
          <li key={concept.concept_id}>
            <MasteryItem concept={concept} reviewIn={courseId} />
          </li>
        ))}
      </ul>
    </section>
  )
}
