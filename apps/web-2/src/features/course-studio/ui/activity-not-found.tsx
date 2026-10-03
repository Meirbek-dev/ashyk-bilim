import { useParams } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { Link } from '#/shared/ui/link'
import { FocusPage } from '#/shared/ui/templates/focus-page'

/** An unknown, malformed or foreign activity id in the studio: the API answers 404 for all of them. */
export function ActivityNotFound() {
  const { courseId } = useParams({ strict: false })
  const back = courseId ? (
    <Link to="/teach/courses/$courseId/content" params={{ courseId }} variant="ghost">
      <ArrowLeft aria-hidden />
      {m.platform_back()}
    </Link>
  ) : null
  return (
    <FocusPage back={back} title={m.studio_activity_not_found()}>
      <h1 className="text-2xl font-semibold">{m.studio_activity_not_found()}</h1>
    </FocusPage>
  )
}
