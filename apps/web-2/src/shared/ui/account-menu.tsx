import { Menu } from '@base-ui/react/menu'
import { ChevronRight } from 'lucide-react'
import type { ReactElement } from 'react'

import { ChoiceItems, type MenuChoice } from './choice-items'
import { menuItemClass, menuPopupClass } from './menu-classes'

type Action = { label: string; onSelect: () => void }

type AccountMenuProps = {
  /** An IconButton with the user's Avatar. */
  trigger: ReactElement
  /** Who is signed in: the name, then a quieter line (the login). */
  title: string
  detail: string
  /** An inline choice right under the name (the workspace on phones, spec 5.2). */
  choice?: MenuChoice | null
  /** Plain items: navigation to the user's own pages. */
  actions: readonly Action[]
  /** Each opens a submenu with its options (appearance, language). */
  submenus: readonly MenuChoice[]
  /** The last item, after a separator (sign out). */
  final: Action
}

const labelClass = 'px-2 py-1.5 text-xs text-muted-foreground'

/** The profile menu of the app shell: who is signed in, the workspace, own pages, appearance, sign out. */
export function AccountMenu({ trigger, title, detail, choice, actions, submenus, final }: AccountMenuProps) {
  return (
    <Menu.Root>
      <Menu.Trigger render={trigger} />
      <Menu.Portal>
        <Menu.Positioner sideOffset={4} align="end" className="z-50">
          <Menu.Popup className={`${menuPopupClass} max-w-72`}>
            <Menu.Group>
              <Menu.GroupLabel className="flex flex-col px-2 py-1.5">
                <span className="truncate text-sm font-medium">{title}</span>
                <span className="truncate text-xs text-muted-foreground">{detail}</span>
              </Menu.GroupLabel>
              {actions.map(action => (
                <Menu.Item key={action.label} onClick={action.onSelect} className={menuItemClass}>
                  {action.label}
                </Menu.Item>
              ))}
              {submenus.map(submenu => (
                <Menu.SubmenuRoot key={submenu.label}>
                  <Menu.SubmenuTrigger className={menuItemClass}>
                    <span className="flex-1">{submenu.label}</span>
                    <span className="text-muted-foreground">
                      {submenu.options.find(option => option.value === submenu.value)?.label}
                    </span>
                    <ChevronRight aria-hidden className="size-4" />
                  </Menu.SubmenuTrigger>
                  <Menu.Portal>
                    <Menu.Positioner sideOffset={4} className="z-50">
                      <Menu.Popup className={menuPopupClass}>
                        <ChoiceItems choice={submenu} />
                      </Menu.Popup>
                    </Menu.Positioner>
                  </Menu.Portal>
                </Menu.SubmenuRoot>
              ))}
            </Menu.Group>
            {choice ? (
              <Menu.Group>
                <Menu.Separator className="my-1 h-px bg-border" />
                <Menu.GroupLabel className={labelClass}>{choice.label}</Menu.GroupLabel>
                <ChoiceItems choice={choice} />
              </Menu.Group>
            ) : null}
            <Menu.Separator className="my-1 h-px bg-border" />
            <Menu.Item onClick={final.onSelect} className={menuItemClass}>
              {final.label}
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
