import { useSuspenseQuery } from '@tanstack/react-query'

import type { CourseId } from '#/shared/api/gen/types.gen'

import { curriculumSyllabus, guestReadable } from '../model/course'
import { courseOptions, curriculumOptions } from '../queries'
import { Syllabus } from './syllabus'

/**
 * A guest's syllabus is the public curriculum. A course that reads without sign-in (`guest_access`) links its rows into
 * the player; nothing is tracked there.
 */
export function GuestOutline({ courseId }: { courseId: CourseId }) {
  const { data: course } = useSuspenseQuery(courseOptions(courseId))
  const open = guestReadable(course)
  const { data } = useSuspenseQuery({
    ...curriculumOptions(courseId),
    select: curriculum => curriculumSyllabus(curriculum, open),
  })
  return <Syllabus courseId={courseId} chapters={data} open={open} />
}
