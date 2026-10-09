'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { useState } from 'react'
import * as zod from 'zod'

import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useRouter } from '@/i18n/navigation'
import { apiJson } from '@/lib/api-client'
import { cn } from '@/lib/utils'

// QA-D: the API writes in-app notifications (grade released, work returned, deadlines, course updates,
// replies) but this web never showed them - a teacher's announcement reached a learner only if they opened
// the course page. The generated client predates these operations; the schema is the contract's, loose on
// payload fields this bell does not read.
const Payload = zod
  .object({
    type: zod.string(),
    course_id: zod.string(),
    course_name: zod.string(),
    activity_id: zod.string().optional(),
    activity_name: zod.string().optional(),
    title: zod.string().optional(),
    author_name: zod.string().optional(),
    applicant_name: zod.string().optional(),
    due_at_unix: zod.number().nullable().optional(),
  })
  .loose()
const Notification = zod.object({
  id: zod.string(),
  payload: Payload,
  created_at_unix: zod.number(),
  read_at_unix: zod.number().nullable(),
})
type Notification = zod.infer<typeof Notification>
const NotificationPage = zod.object({ items: zod.array(Notification), next_cursor: zod.string().nullable() })
const UnreadCount = zod.object({ unread_count: zod.number() })

const KNOWN_TYPES = new Set([
  'grade_published',
  'submission_returned',
  'deadline_extended',
  'deadline_approaching',
  'course_update',
  'discussion_reply',
  'contributor_application',
])

function hrefFor({ payload }: Notification): string {
  if (payload.type === 'contributor_application') return `/dash/courses/${payload.course_id}/collaboration`
  if (payload.activity_id) return `/course/${payload.course_id}/activity/${payload.activity_id}`
  return `/course/${payload.course_id}`
}

export function NotificationBell() {
  const t = useTranslations('Components.NotificationBell')
  // The type is runtime data (filtered by KNOWN_TYPES); the typed `t` cannot see that.
  const tType = t as unknown as (key: string, values: Record<string, string>) => string
  const format = useFormatter()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)

  const unread = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => apiJson('me/notifications/unread-count', undefined, value => UnreadCount.parse(value)),
    refetchInterval: 60_000,
  })
  const list = useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: () => apiJson('me/notifications?limit=20', undefined, value => NotificationPage.parse(value)),
    enabled: open,
  })
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['notifications'] })
  const markRead = useMutation({
    mutationFn: (id: string) => apiJson(`me/notifications/${id}/read`, { method: 'POST' }),
    onSettled: refresh,
  })
  const markAll = useMutation({
    mutationFn: () => apiJson('me/notifications/read-all', { method: 'POST' }),
    onSettled: refresh,
  })

  const count = unread.data?.unread_count ?? 0
  const items = (list.data?.items ?? []).filter(item => KNOWN_TYPES.has(item.payload.type))
  // The list renders only while open (client side), so «now» is the moment it is looked at.
  const now = new Date()

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="relative h-10 w-10"
            aria-label={count > 0 ? t('openUnread', { count }) : t('open')}
          />
        }
      >
        <Bell className="size-5" aria-hidden />
        {count > 0 ? (
          <span className="bg-destructive text-destructive-foreground absolute top-1.5 right-1.5 min-w-4 rounded-full px-1 text-[10px] leading-4 font-semibold tabular-nums">
            {count > 99 ? '99+' : count}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] gap-1 p-0">
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <p className="text-sm font-semibold">{t('title')}</p>
          {count > 0 ? (
            <Button variant="ghost" size="sm" disabled={markAll.isPending} onClick={() => markAll.mutate()}>
              {t('markAllRead')}
            </Button>
          ) : null}
        </div>
        <div className="max-h-[60dvh] overflow-y-auto p-1">
          {list.isPending ? (
            <p className="text-muted-foreground px-3 py-6 text-center text-sm">{t('loading')}</p>
          ) : list.isError ? (
            <p className="text-destructive px-3 py-6 text-center text-sm">{t('loadFailed')}</p>
          ) : items.length === 0 ? (
            <p className="text-muted-foreground px-3 py-6 text-center text-sm">{t('empty')}</p>
          ) : (
            <ul className="flex flex-col">
              {items.map(item => {
                const { payload } = item
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={cn(
                        'hover:bg-muted flex w-full flex-col gap-0.5 rounded-md px-3 py-2 text-left',
                        item.read_at_unix === null && 'bg-primary/5',
                      )}
                      onClick={() => {
                        if (item.read_at_unix === null) markRead.mutate(item.id)
                        setOpen(false)
                        router.push(hrefFor(item))
                      }}
                    >
                      <span className="flex items-start gap-2 text-sm">
                        {item.read_at_unix === null ? (
                          <span className="bg-primary mt-1.5 size-2 shrink-0 rounded-full" aria-hidden />
                        ) : null}
                        <span className="min-w-0 [overflow-wrap:anywhere]">
                          {tType(`types.${payload.type}`, {
                            activity: payload.activity_name ?? '',
                            title: payload.title ?? '',
                            author: payload.author_name ?? '',
                            applicant: payload.applicant_name ?? '',
                          })}
                        </span>
                      </span>
                      <span className="text-muted-foreground truncate text-xs">
                        {payload.course_name} · {format.relativeTime(new Date(item.created_at_unix * 1000), now)}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
