import { Menu } from '@base-ui/react/menu'
import type { ReactElement } from 'react'

import { ChoiceItems, type MenuChoice } from './choice-items'
import { menuPopupClass } from './menu-classes'

/** Pick one of a few settings (mode, language, workspace) from a menu; the current one is checked. */
export function ChoiceMenu({ trigger, choice }: { trigger: ReactElement; choice: MenuChoice }) {
  return (
    <Menu.Root>
      <Menu.Trigger render={trigger} />
      <Menu.Portal>
        <Menu.Positioner sideOffset={4} align="end" className="z-50">
          <Menu.Popup className={menuPopupClass}>
            <ChoiceItems choice={choice} />
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
