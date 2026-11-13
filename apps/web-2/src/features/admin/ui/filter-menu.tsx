import { ChevronDown } from 'lucide-react'

import { ChoiceItems, type MenuChoice } from '#/shared/components/choice-items'
import { Button } from '#/shared/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '#/shared/ui/dropdown-menu'

/** One directory filter as a menu button whose label names the current choice: drawn as a control (bare text beside the
 * search box read as a caption, not as something to press). */
export function FilterMenu({ choice }: { choice: MenuChoice }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline">
            {choice.label}
            <ChevronDown data-icon="inline-end" aria-hidden />
          </Button>
        }
      />
      <DropdownMenuContent align="start">
        <ChoiceItems choice={choice} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
