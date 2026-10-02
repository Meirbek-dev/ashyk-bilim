import { Menu } from '@base-ui/react/menu'
import type { ReactElement } from 'react'

import { menuItemClass, menuPopupClass } from './menu-classes'

type ActionMenuProps = { trigger: ReactElement; actions: readonly { label: string; onSelect: () => void }[] }

/** Secondary actions that do not fit: a list page's actions at phone width (DESIGN 6). */
export function ActionMenu({ trigger, actions }: ActionMenuProps) {
  return (
    <Menu.Root>
      <Menu.Trigger render={trigger} />
      <Menu.Portal>
        <Menu.Positioner sideOffset={4} align="end" className="z-50">
          <Menu.Popup className={menuPopupClass}>
            {actions.map(action => (
              <Menu.Item key={action.label} onClick={action.onSelect} className={menuItemClass}>
                {action.label}
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
