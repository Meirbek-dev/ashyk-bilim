import { type ErrorComponentProps, useParams } from '@tanstack/react-router'

import { ErrorView } from '#/features/platform'
import { ApiError } from '#/shared/api/errors'

import { ArchivedCourse } from './archived-course'
import { NotOnTeam } from './not-on-team'

/**
 * The course workspace refused: `forbidden` is a caller who can see the course but is not on its team - say so and
 * offer the course page and their own courses, not «ask the platform administrator». `course-archived` (409) says the
 * course is archived instead (a co-author is on the team). Anything else is the app's error view.
 */
export function WorkspaceError(props: ErrorComponentProps) {
  const { courseId } = useParams({ strict: false })
  const code = props.error instanceof ApiError ? props.error.code : null
  if (!courseId) return <ErrorView {...props} />
  if (code === 'course-archived') return <ArchivedCourse courseId={courseId} />
  if (code === 'forbidden') return <NotOnTeam courseId={courseId} />
  return <ErrorView {...props} />
}
