import { useSuspenseQuery } from '@tanstack/react-query'
import { Link as RouterLink } from '@tanstack/react-router'
import { MessagesSquare } from 'lucide-react'

import { badgeCount } from '#/features/notifications'
import { m } from '#/paraglide/messages'
import { buttonVariants } from '#/shared/components/button-variants'
import { formatNumber } from '#/shared/i18n/format'
import { Tooltip, TooltipContent, TooltipTrigger } from '#/shared/ui/tooltip'

import { unreadOptions } from '../queries'

/** The top bar's way to «Диалоги» (docs/DIALOGS.md 9): an icon link with the bell's badge of unread conversations. */
export function MessagesLink() {
  const { data } = useSuspenseQuery(unreadOptions())
  const count = data.conversations
  const label = count > 0 ? m.conversations_link_unread({ count }) : m.conversations_title()
  return (
    <Tooltip>
      <TooltipTrigger
        delay={300}
        render={
          <RouterLink
            to="/conversations"
            aria-label={label}
            className={buttonVariants({ variant: 'ghost', size: 'icon' })}
          />
        }
      >
        <span className="relative flex">
          <MessagesSquare aria-hidden />
          {count > 0 ? (
            <span
              aria-hidden
              className="absolute -top-2 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-highlight px-1 text-xs leading-none text-highlight-foreground tabular-nums"
            >
              {badgeCount(count, formatNumber)}
            </span>
          ) : null}
        </span>
      </TooltipTrigger>
      <TooltipContent>{m.conversations_title()}</TooltipContent>
    </Tooltip>
  )
}
