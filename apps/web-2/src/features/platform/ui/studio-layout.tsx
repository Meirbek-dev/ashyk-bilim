import { Outlet, useMatch, useParams } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { Link } from '#/shared/ui/link'
import { FocusPage } from '#/shared/ui/templates/focus-page'

import { TabLinks } from './tab-links'

/** The activity studio: the focus layout with route tabs; back leads to the course content. */
export function StudioLayout() {
  const { staticData } = useMatch({ strict: false })
  const { courseId } = useParams({ from: '/_authed/teach/courses/$courseId_/activities/$activityId' })
  const back = (
    <Link to="/teach/courses/$courseId/content" params={{ courseId }} variant="ghost">
      <ArrowLeft aria-hidden />
      {m.platform_back()}
    </Link>
  )
  return (
    <FocusPage back={back} title={staticData.title?.() ?? ''} wide>
      <div className="flex flex-col gap-gutter">
        <nav aria-label={m.ui_sections()} className="flex overflow-x-auto border-b">
          <TabLinks tabs={staticData.tabs ?? []} />
        </nav>
        <Outlet />
      </div>
    </FocusPage>
  )
}
