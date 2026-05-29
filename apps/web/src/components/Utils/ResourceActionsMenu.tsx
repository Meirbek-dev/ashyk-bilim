'use client'

import { MoreVertical } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import type { LucideIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Fragment } from 'react'
import type React from 'react'

export interface ResourceAction {
  id: string
  label?: string
  labelKey?: string
  icon?: LucideIcon
  onClick: () => void
  variant?: 'default' | 'destructive'
  requiresAction?: string
  separator?: boolean
}

interface ResourceActionsMenuProps {
  availableActions: string[]
  actions: ResourceAction[]
  trigger?: React.ReactElement
  align?: 'start' | 'center' | 'end'
}

/**
 * Dynamic menu component that renders actions based on backend available_actions.
 *
 * This component takes an array of possible actions and filters them based on
 * the available_actions array from the backend, ensuring the UI only shows
 * actions the user is permitted to perform.
 *
 * @example
 * ```tsx
 * const actions = [
 *   {
 *     id: 'edit',
 *     label: 'Edit',
 *     icon: Edit,
 *     onClick: handleEdit,
 *     requiresAction: 'update',
 *   },
 *   {
 *     id: 'delete',
 *     label: 'Delete',
 *     icon: Trash2,
 *     onClick: handleDelete,
 *     variant: 'destructive',
 *     requiresAction: 'delete',
 *     separator: true,
 *   },
 * ];
 *
 * <ResourceActionsMenu
 *   availableActions={resource.available_actions}
 *   actions={actions}
 * />
 * ```
 */
export function ResourceActionsMenu({ availableActions, actions, trigger, align = 'end' }: ResourceActionsMenuProps) {
  const t = useTranslations('Components.ResourceActionsMenu')

  // Filter actions based on available_actions from backend
  const filteredActions = actions.filter(action => {
    // If requiresAction is specified, check if it's in availableActions
    if (action.requiresAction) {
      return availableActions.includes(action.requiresAction)
    }
    // If no requiresAction specified, always show (for custom logic)
    return true
  })

  // Don't render menu if no actions are available
  if (filteredActions.length === 0) {
    return null
  }

  const defaultTrigger = (
    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
      <MoreVertical className="h-4 w-4" />
      <span className="sr-only">{t('openMenu', { default: 'Open menu' })}</span>
    </Button>
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={trigger ?? defaultTrigger} />
      <DropdownMenuContent align={align}>
        {filteredActions.map((action, index) => {
          const Icon = action.icon
          const showSeparator = action.separator && index < filteredActions.length - 1

          return (
            <Fragment key={action.id}>
              <DropdownMenuItem
                onClick={action.onClick}
                className={action.variant === 'destructive' ? 'text-destructive focus:text-destructive' : ''}
              >
                {Icon && <Icon className="mr-2 h-4 w-4" />}
                {action.labelKey ? t(action.labelKey) : action.label}
              </DropdownMenuItem>
              {showSeparator && <DropdownMenuSeparator />}
            </Fragment>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

