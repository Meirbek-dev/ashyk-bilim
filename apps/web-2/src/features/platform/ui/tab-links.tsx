import { useMatchRoute, useNavigate, useParams } from '@tanstack/react-router'
import type { StaticDataRouteOption } from '@tanstack/react-router'
import { ChevronDown } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { Link } from '#/shared/components/link'
import { linkVariants } from '#/shared/components/link-variants'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '#/shared/ui/dropdown-menu'

type Tabs = NonNullable<StaticDataRouteOption['tabs']>

/**
 * A layout's tabs as route links (DESIGN 8): the active one is marked by the router (aria-current). Tabs flagged
 * `more` sit behind one «Ещё» tab, which reads as current while one of them is open and then names it, so the row
 * always says where you are.
 */
export function TabLinks({ tabs }: { tabs: Tabs }) {
  const params = useParams({ strict: false })
  const navigate = useNavigate()
  const matchRoute = useMatchRoute()
  const main = tabs.filter(tab => !tab.more)
  const more = tabs.filter(tab => tab.more)
  const current = more.find(tab => matchRoute({ to: tab.to, params, fuzzy: true }))
  return (
    <>
      {main.map(tab => (
        <Link key={tab.to} variant="tab" to={tab.to} params={params}>
          {tab.label()}
        </Link>
      ))}
      {more.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger className={`${linkVariants.tab} gap-1`} aria-current={current ? 'page' : undefined}>
            {current ? current.label() : m.platform_nav_more()}
            <ChevronDown aria-hidden className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {more.map(tab => (
              <DropdownMenuItem
                key={tab.to}
                aria-current={tab === current ? 'page' : undefined}
                className="current:font-semibold"
                // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the layout's own params fill every tab
                onClick={() => void navigate({ to: tab.to, params: params as never })}
              >
                {tab.label()}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </>
  )
}
