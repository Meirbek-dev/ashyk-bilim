import { useParams, Link as RouterLink } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { FocusPage } from '#/shared/components/templates/focus-page'
import { buttonVariants } from '#/shared/ui/button'

/** An unknown, malformed or foreign activity id in the studio: the API answers 404 for all of them. */
export function ActivityNotFound() {
  const { courseId } = useParams({ strict: false })
  const back = courseId ? (
    <RouterLink
      to="/teach/courses/$courseId/content"
      params={{ courseId }}
      className={buttonVariants({ variant: 'ghost' })}
    >
      <ArrowLeft aria-hidden />
      {m.platform_back()}
    </RouterLink>
  ) : null
  return (
    <FocusPage back={back} title={m.studio_activity_not_found()}>
      <h1 className="text-2xl font-semibold">{m.studio_activity_not_found()}</h1>
    </FocusPage>
  )
}
