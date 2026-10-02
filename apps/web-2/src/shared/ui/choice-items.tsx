import { Menu } from '@base-ui/react/menu'
import { Check } from 'lucide-react'

import { menuItemClass } from './menu-classes'

/** One setting picked from a menu (mode, language, workspace): the options and what a pick does. */
export type MenuChoice = {
  label: string
  value: string
  options: readonly { value: string; label: string; lang?: string }[]
  onValueChange: (value: string) => void
}

/** The radio items of a MenuChoice; the current one is checked. Lives inside a menu popup. */
export function ChoiceItems({ choice }: { choice: MenuChoice }) {
  return (
    <Menu.RadioGroup value={choice.value}>
      {choice.options.map(option => (
        <Menu.RadioItem
          key={option.value}
          value={option.value}
          lang={option.lang}
          onClick={() => choice.onValueChange(option.value)}
          className={menuItemClass}
        >
          <span className="flex size-4 items-center justify-center">
            <Menu.RadioItemIndicator>
              <Check aria-hidden className="size-4" />
            </Menu.RadioItemIndicator>
          </span>
          {option.label}
        </Menu.RadioItem>
      ))}
    </Menu.RadioGroup>
  )
}
