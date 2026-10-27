import { useMutation, useQueryClient, useSuspenseInfiniteQuery, useSuspenseQuery } from '@tanstack/react-query'
import { Link as RouterLink } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { hasCapability } from '#/shared/auth/access'
import { sessionOptions } from '#/shared/auth/session'
import { ListState } from '#/shared/components/list-state'
import { buttonVariants } from '#/shared/components/button-variants'
import { SubmitButton } from '#/shared/components/submit-button'
import { PopoverHeader, PopoverTitle } from '#/shared/ui/popover'

import { foldThreadReplies, LATEST } from '../model/notifications'
import { markAllReadOptions, notificationsListOptions } from '../queries'
import { emptyListText } from './labels'
import { NotificationItem } from './notification-item'

type LatestPanelProps = { unread: number; onNavigate: () => void }

/** The bell's panel: the newest few, "Mark all as read" while anything is unread, the link to all (B-NOT-02). */
export function LatestPanel({ unread, onNavigate }: LatestPanelProps) {
  const query = useSuspenseInfiniteQuery(notificationsListOptions(false))
  const markAll = useMutation(markAllReadOptions(useQueryClient()))
  const { data: session } = useSuspenseQuery(sessionOptions())
  const latest = foldThreadReplies(query.data.pages.flatMap(page => page.items)).slice(0, LATEST)
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
        emptyText={emptyListText(hasCapability(session, 'teach'))}
        onRetry={() => void query.refetch()}
      >
        <ul className="flex max-h-96 flex-col gap-4 overflow-y-auto">
          {latest.map(({ notification, folded }) => (
            <li key={notification.id}>
              <NotificationItem notification={notification} folded={folded} compact onNavigate={onNavigate} />
            </li>
          ))}
        </ul>
      </ListState>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-2">
        {unread > 0 ? (
          <SubmitButton variant="ghost" size="sm" pending={markAll.isPending} onClick={() => markAll.mutate({})}>
            {m.notifications_mark_all()}
          </SubmitButton>
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
