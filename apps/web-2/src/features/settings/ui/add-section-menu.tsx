import type { RefObject } from 'react'

import { m } from '#/paraglide/messages'
import { Button } from '#/shared/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '#/shared/ui/dropdown-menu'

import { ADDABLE_SECTIONS, type SectionType } from '../model/profile-sections'
import { sectionTypeLabels } from './section-editor'

type AddSectionMenuProps = {
  /** Where the focus goes when the menu closes: the title of the section just added. */
  finalFocus: RefObject<HTMLDivElement | null>
  onOpen: () => void
  onAdd: (type: SectionType) => void
}

/** «Добавить раздел»: a menu of the section types a profile can add. */
export function AddSectionMenu({ finalFocus, onOpen, onAdd }: AddSectionMenuProps) {
  return (
    <div>
      <DropdownMenu onOpenChange={open => open && onOpen()}>
        <DropdownMenuTrigger render={<Button variant="outline">{m.settings_builder_add()}</Button>} />
        <DropdownMenuContent align="end" finalFocus={finalFocus}>
          {ADDABLE_SECTIONS.map(type => (
            <DropdownMenuItem key={type} onClick={() => onAdd(type)}>
              {sectionTypeLabels[type]()}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
