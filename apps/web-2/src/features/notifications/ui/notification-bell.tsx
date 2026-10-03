import { useSuspenseQuery } from '@tanstack/react-query'
import { Bell } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'

import { m } from '#/paraglide/messages'
import { IconButton } from '#/shared/components/icon-button'
import { ListSkeleton } from '#/shared/components/list-skeleton'
import { formatNumber } from '#/shared/i18n/format'
import { Popover, PopoverContent, PopoverTrigger } from '#/shared/ui/popover'

import { badgeCount } from '../model/notifications'
import { unreadOptions } from '../queries'

// The panel's list loads on the first open.
const LatestPanel = lazy(() => import('./latest-panel').then(module => ({ default: module.LatestPanel })))

/** The shell's bell (B-NOT-01, B-NOT-02): the unread count from the server, the latest ones in a panel. */
export function NotificationBell() {
  const { data } = useSuspenseQuery(unreadOptions())
  const [open, setOpen] = useState(false)
  const count = data.unread_count
  const icon = (
    <span className="relative flex">
      <Bell aria-hidden />
      {count > 0 ? (
        <span
          aria-hidden
          className="absolute -top-2 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-xs leading-none text-primary-foreground tabular-nums"
        >
          {badgeCount(count, formatNumber)}
        </span>
      ) : null}
    </span>
  )
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <IconButton
            label={count > 0 ? m.notifications_bell_unread({ count }) : m.notifications_title()}
            icon={icon}
          />
        }
      />
      <PopoverContent align="end" className="w-80 max-w-dvw">
        {open ? (
          <Suspense fallback={<ListSkeleton />}>
            <LatestPanel unread={count} onNavigate={() => setOpen(false)} />
          </Suspense>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
