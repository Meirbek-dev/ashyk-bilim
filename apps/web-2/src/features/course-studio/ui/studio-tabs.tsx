import { useMatch, useParams } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { Link } from '#/shared/components/link'

const ROUTE = '/_authed/teach/courses/$courseId_/activities/$activityId'
const WORK_TABS = ['/submissions', '/results']

/**
 * The studio's tabs: the bar's second row, edge to edge (the page's top padding is pulled back so they sit right under
 * it). `handedIn`: the activity takes hand-ins, so it has "Submissions" and "Results".
 */
export function StudioTabs({ handedIn }: { handedIn: boolean }) {
  const { courseId, activityId } = useParams({ from: ROUTE })
  const { staticData } = useMatch({ from: ROUTE })
  return (
    <nav
      aria-label={m.ui_sections()}
      className="-mx-4 -mt-gutter flex gap-6 overflow-x-auto border-b px-4 @3xl:-mx-8 @3xl:-mt-10 @3xl:px-8"
    >
      {(staticData.tabs ?? [])
        .filter(tab => handedIn || !WORK_TABS.some(work => tab.to.endsWith(work)))
        .map(tab => (
          <Link key={tab.to} variant="tab" to={tab.to} params={{ courseId, activityId }}>
            {tab.label()}
          </Link>
        ))}
    </nav>
  )
}
