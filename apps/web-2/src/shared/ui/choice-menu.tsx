import { Menu } from '@base-ui/react/menu'
import { Check } from 'lucide-react'
import type { ReactElement } from 'react'

import { menuItemClass, menuPopupClass } from './menu-classes'

type ChoiceMenuProps<T extends string> = {
  trigger: ReactElement
  value: T
  options: readonly { value: T; label: string; lang?: string }[]
  onValueChange: (value: T) => void
}

/** Pick one of a few settings (mode, language) from a menu; the current one is checked. */
export function ChoiceMenu<T extends string>({ trigger, value, options, onValueChange }: ChoiceMenuProps<T>) {
  return (
    <Menu.Root>
      <Menu.Trigger render={trigger} />
      <Menu.Portal>
        <Menu.Positioner sideOffset={4} align="end" className="z-50">
          <Menu.Popup className={menuPopupClass}>
            <Menu.RadioGroup value={value}>
              {options.map(option => (
                <Menu.RadioItem
                  key={option.value}
                  value={option.value}
                  lang={option.lang}
                  onClick={() => onValueChange(option.value)}
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
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
