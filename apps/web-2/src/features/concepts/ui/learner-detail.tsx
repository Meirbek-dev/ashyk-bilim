import { useSuspenseQuery } from '@tanstack/react-query'

import type { CourseId, UserId } from '#/shared/api/gen/types.gen'

import { weakFirst } from '../model/mastery'
import { learnerOptions } from '../queries'
import { MasteryItem } from './mastery-item'

/** One learner's concepts, the weak first (B-CON-10). */
export function LearnerDetail({ courseId, userId }: { courseId: CourseId; userId: UserId }) {
  const { data } = useSuspenseQuery(learnerOptions(courseId, userId))
  return (
    <>
      <p className="text-lg font-semibold wrap-anywhere">{data.learner.name}</p>
      <ul className="flex flex-col divide-y border-y">
        {weakFirst(data.concepts).map(concept => (
          <li key={concept.concept_id} className="py-3">
            <MasteryItem concept={concept} />
          </li>
        ))}
      </ul>
    </>
  )
}
