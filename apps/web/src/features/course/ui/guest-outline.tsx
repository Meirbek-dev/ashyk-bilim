import { useSuspenseQuery } from '@tanstack/react-query'

import type { CourseId } from '#/shared/api/gen/types.gen'

import { curriculumSyllabus } from '../model/course'
import { curriculumOptions } from '../queries'
import { Syllabus } from './syllabus'

/** A guest has no learner state (the API answers 401): the syllabus is the public curriculum. */
export function GuestOutline({ courseId }: { courseId: CourseId }) {
  const { data } = useSuspenseQuery({ ...curriculumOptions(courseId), select: curriculumSyllabus })
  return <Syllabus courseId={courseId} chapters={data} />
}
