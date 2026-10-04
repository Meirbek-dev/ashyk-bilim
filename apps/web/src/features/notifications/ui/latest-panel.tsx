import { useMutation, useQueryClient, useSuspenseInfiniteQuery } from '@tanstack/react-query'
import { Link as RouterLink } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { ListState } from '#/shared/components/list-state'
import { Button, buttonVariants } from '#/shared/ui/button'
import { PopoverHeader, PopoverTitle } from '#/shared/ui/popover'

import { LATEST } from '../model/notifications'
import { markAllReadOptions, notificationsListOptions } from '../queries'
import { NotificationItem } from './notification-item'

type LatestPanelProps = { unread: number; onNavigate: () => void }

/** The bell's panel: the newest few, "Mark all as read" while anything is unread, the link to all (B-NOT-02). */
export function LatestPanel({ unread, onNavigate }: LatestPanelProps) {
  const query = useSuspenseInfiniteQuery(notificationsListOptions(false))
  const markAll = useMutation(markAllReadOptions(useQueryClient()))
  const latest = query.data.pages.flatMap(page => page.items).slice(0, LATEST)
  return (
    <>
      <PopoverHeader>
        <PopoverTitle>{m.notifications_latest()}</PopoverTitle>
      </PopoverHeader>
      <ListState
        pending={false}
        error={query.error}
        count={latest.length}
        filtered={false}
        emptyText={m.notifications_empty()}
        onRetry={() => void query.refetch()}
      >
        <ul className="flex max-h-96 flex-col gap-4 overflow-y-auto">
          {latest.map(notification => (
            <li key={notification.id}>
              <NotificationItem notification={notification} compact onNavigate={onNavigate} />
            </li>
          ))}
        </ul>
      </ListState>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-2">
        {unread > 0 ? (
          <Button variant="ghost" size="sm" disabled={markAll.isPending} onClick={() => markAll.mutate({})}>
            {m.notifications_mark_all()}
          </Button>
        ) : null}
        <RouterLink
          to="/notifications"
          onClick={onNavigate}
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          {m.notifications_all_link()}
        </RouterLink>
      </div>
    </>
  )
}
