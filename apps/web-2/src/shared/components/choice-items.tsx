import { DropdownMenuRadioGroup, DropdownMenuRadioItem } from '#/shared/ui/dropdown-menu'

/** One setting picked from a menu (mode, language, workspace, sort): the options and what a pick does. */
export type MenuChoice = {
  label: string
  value: string
  options: readonly { value: string; label: string; lang?: string }[]
  onValueChange: (value: string) => void
}

/**
 * The radio items of a MenuChoice inside a stock `DropdownMenuContent`; the current one is checked. A pick closes the
 * menu (Base UI keeps a radio menu open by default, and its overlay then swallows the next click on the page).
 */
export function ChoiceItems({ choice }: { choice: MenuChoice }) {
  return (
    <DropdownMenuRadioGroup value={choice.value} onValueChange={value => choice.onValueChange(String(value))}>
      {choice.options.map(option => (
        <DropdownMenuRadioItem key={option.value} value={option.value} lang={option.lang} closeOnClick>
          {option.label}
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  )
}
