import { ChoiceItems, type MenuChoice } from '#/shared/components/choice-items'
import { Button } from '#/shared/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '#/shared/ui/dropdown-menu'

/** One setting as a menu button whose label names the current choice. */
export function FilterMenu({ choice }: { choice: MenuChoice }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline">{choice.label}</Button>} />
      <DropdownMenuContent align="start">
        <ChoiceItems choice={choice} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
