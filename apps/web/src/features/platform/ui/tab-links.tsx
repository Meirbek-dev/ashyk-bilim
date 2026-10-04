import { useParams } from '@tanstack/react-router'
import type { StaticDataRouteOption } from '@tanstack/react-router'

import { Link } from '#/shared/components/link'

/** A layout's tabs as route links (DESIGN 8): the active one is marked by the router (aria-current). */
export function TabLinks({ tabs }: { tabs: NonNullable<StaticDataRouteOption['tabs']> }) {
  const params = useParams({ strict: false })
  return tabs.map(tab => (
    <Link key={tab.to} variant="tab" to={tab.to} params={params}>
      {tab.label()}
    </Link>
  ))
}
