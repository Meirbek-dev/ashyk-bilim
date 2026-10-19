import { type ErrorComponentProps, useParams } from '@tanstack/react-router'

import { ErrorView } from '#/features/platform'
import { ApiError } from '#/shared/api/errors'

import { NotOnTeam } from './not-on-team'

/**
 * The course workspace refused (403): the caller can see the course but is not on its team - say so and offer the
 * course page and their own courses, not «ask the platform administrator». Anything else is the app's error view.
 */
export function WorkspaceError(props: ErrorComponentProps) {
  const { courseId } = useParams({ strict: false })
  if (!(props.error instanceof ApiError && props.error.status === 403) || !courseId) return <ErrorView {...props} />
  return <NotOnTeam courseId={courseId} />
}
