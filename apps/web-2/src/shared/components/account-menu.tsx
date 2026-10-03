import type { ReactElement } from 'react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '#/shared/ui/dropdown-menu'

import { ChoiceItems, type MenuChoice } from './choice-items'

type Action = { label: string; onSelect: () => void }

type AccountMenuProps = {
  /** An IconButton with the user avatar. */
  trigger: ReactElement
  /** Who is signed in: the name, then a quieter line (the login). */
  title: string
  detail: string
  /** An inline choice right under the name (the workspace on phones, spec 5.2). */
  choice?: MenuChoice | null
  /** Plain items: navigation to the own pages of the user. */
  actions: readonly Action[]
  /** Each opens a submenu with its options (appearance, language). */
  submenus: readonly MenuChoice[]
  /** The last item, after a separator (sign out). */
  final: Action
}

/** The profile menu of the app shell on the stock DropdownMenu: who, the workspace, own pages, appearance, sign out. */
export function AccountMenu({ trigger, title, detail, choice, actions, submenus, final }: AccountMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={trigger} />
      <DropdownMenuContent align="end" className="max-w-72 min-w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col">
            <span className="truncate text-sm font-medium text-foreground">{title}</span>
            <span className="truncate">{detail}</span>
          </DropdownMenuLabel>
          {actions.map(action => (
            <DropdownMenuItem key={action.label} onClick={action.onSelect}>
              {action.label}
            </DropdownMenuItem>
          ))}
          {submenus.map(submenu => (
            <DropdownMenuSub key={submenu.label}>
              <DropdownMenuSubTrigger>
                <span className="flex-1">{submenu.label}</span>
                <span className="text-muted-foreground">
                  {submenu.options.find(option => option.value === submenu.value)?.label}
                </span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <ChoiceItems choice={submenu} />
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ))}
        </DropdownMenuGroup>
        {choice ? (
          <DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{choice.label}</DropdownMenuLabel>
            <ChoiceItems choice={choice} />
          </DropdownMenuGroup>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={final.onSelect}>{final.label}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
