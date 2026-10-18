import { useMatchRoute, useNavigate } from '@tanstack/react-router'
import { Ellipsis } from 'lucide-react'

import { m } from '#/paraglide/messages'
import type { Section } from '#/shared/auth/access'
import { linkVariants } from '#/shared/components/link-variants'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '#/shared/ui/dropdown-menu'

/**
 * The bottom bar's overflow: the sections beyond the first four, behind an item that looks like the others (icon over
 * «Ещё») and is marked current while one of its sections is open, so the bar never shows no place at all.
 */
export function MoreMenu({ sections }: { sections: readonly Section[] }) {
  const navigate = useNavigate()
  const matchRoute = useMatchRoute()
  const open = (section: Section) => Boolean(matchRoute({ to: section.to, fuzzy: section.exact !== true }))
  const inside = sections.some(open)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={`h-full w-full ${linkVariants.bar}`} aria-current={inside ? 'page' : undefined}>
        <Ellipsis aria-hidden />
        <span>{m.platform_nav_more()}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top">
        {sections.map(section => (
          <DropdownMenuItem
            key={section.to}
            aria-current={open(section) ? 'page' : undefined}
            className="current:font-semibold"
            onClick={() => void navigate({ to: section.to })}
          >
            <section.icon aria-hidden />
            {section.label()}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
