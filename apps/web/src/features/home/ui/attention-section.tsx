import { m } from '#/paraglide/messages'
import { DataList } from '#/shared/components/data-list'
import { StatusBadge } from '#/shared/components/status-badge'
import { formatDateTime } from '#/shared/i18n/format'

import type { attentionWork } from '../model/agenda'
import { HomeSection } from './home-section'
import { attentionKinds } from './labels'
import { PlayerLink } from './player-link'

/** Overdue and returned work from the learner's queue that the agenda does not carry; hidden when there is none. */
export function AttentionSection({ items }: { items: ReturnType<typeof attentionWork> }) {
  if (items.length === 0) return null
  return (
    <HomeSection title={m.home_attention_title()}>
      <DataList items={items} getKey={item => item.id}>
        {item => {
          const kind = attentionKinds[item.kind]
          return (
            <>
              <div>
                <StatusBadge tone={kind.tone}>{kind.label()}</StatusBadge>
              </div>
              <PlayerLink courseId={item.course_id} activityId={item.activity_id}>
                {item.activity_title}
              </PlayerLink>
              <p className="text-sm wrap-anywhere text-muted-foreground">
                {item.course_title}
                {item.due_at_unix ? ` · ${m.home_due_date({ date: formatDateTime(item.due_at_unix) })}` : null}
              </p>
            </>
          )
        }}
      </DataList>
    </HomeSection>
  )
}
