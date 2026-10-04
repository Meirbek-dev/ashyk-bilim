import { m } from '#/paraglide/messages'
import type { AgendaCourseUpdate } from '#/shared/api/gen/types.gen'
import { DataList } from '#/shared/components/data-list'
import { Link } from '#/shared/components/link'
import { formatDate } from '#/shared/i18n/format'

import { HomeSection } from './home-section'

/** Announcements of the learner's courses in the last 14 days, each into the course's updates; hidden when none. */
export function UpdatesSection({ updates }: { updates: readonly AgendaCourseUpdate[] }) {
  if (updates.length === 0) return null
  return (
    <HomeSection title={m.home_updates_title()}>
      <DataList items={updates} getKey={update => update.update_id}>
        {update => (
          <>
            <h3 className="text-base font-medium wrap-anywhere">
              <Link to="/courses/$courseId/updates" params={{ courseId: update.course_id }}>
                {update.title}
              </Link>
            </h3>
            <p className="text-sm wrap-anywhere text-muted-foreground">
              {update.course_name} · {formatDate(update.created_at_unix)}
            </p>
          </>
        )}
      </DataList>
    </HomeSection>
  )
}
