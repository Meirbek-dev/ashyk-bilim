import { useNavigate } from '@tanstack/react-router'
import { Ellipsis } from 'lucide-react'

import { m } from '#/paraglide/messages'
import type { Section } from '#/shared/auth/access'
import { ActionMenu } from '#/shared/ui/action-menu'
import { IconButton } from '#/shared/ui/icon-button'

/** The bottom bar's overflow: the sections beyond the first four. */
export function MoreMenu({ sections }: { sections: readonly Section[] }) {
  const navigate = useNavigate()
  return (
    <ActionMenu
      trigger={<IconButton label={m.platform_nav_more()} icon={<Ellipsis aria-hidden />} />}
      actions={sections.map(section => ({
        label: section.label(),
        onSelect: () => void navigate({ to: section.to }),
      }))}
    />
  )
}
