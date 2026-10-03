import { useNavigate } from '@tanstack/react-router'
import { Ellipsis } from 'lucide-react'

import { m } from '#/paraglide/messages'
import type { Section } from '#/shared/auth/access'
import { IconButton } from '#/shared/components/icon-button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '#/shared/ui/dropdown-menu'

/** The bottom bar's overflow: the sections beyond the first four. */
export function MoreMenu({ sections }: { sections: readonly Section[] }) {
  const navigate = useNavigate()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<IconButton label={m.platform_nav_more()} icon={<Ellipsis aria-hidden />} />} />
      <DropdownMenuContent align="end">
        {sections.map(section => (
          <DropdownMenuItem key={section.to} onClick={() => void navigate({ to: section.to })}>
            {section.label()}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
