import { useNavigate, useParams, useSearch } from '@tanstack/react-router'

import { ConceptsBoard } from './concepts-board'

const FROM = '/_authed/teach/courses/$courseId/concepts'

/** The `concepts` tab: the board with the sheet the URL opens (`?concept=`, `?learner=`). */
export function ConceptsPage() {
  const { courseId } = useParams({ from: FROM })
  const search = useSearch({ from: FROM })
  const navigate = useNavigate({ from: '/teach/courses/$courseId/concepts' })
  return (
    <ConceptsBoard
      courseId={courseId}
      search={search}
      onClose={() => void navigate({ search: prev => ({ ...prev, concept: undefined, learner: undefined }) })}
    />
  )
}
