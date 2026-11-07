import { ChevronDown } from 'lucide-react'

import { ChoiceItems, type MenuChoice } from '#/shared/components/choice-items'
import { Button } from '#/shared/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '#/shared/ui/dropdown-menu'

/** One directory filter as a quiet menu button: its label names the current choice. */
export function FilterMenu({ choice }: { choice: MenuChoice }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost">
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
