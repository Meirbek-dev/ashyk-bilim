import { useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import type { Course } from '#/shared/api/gen/types.gen'
import { DataList } from '#/shared/ui/data-list'
import { ListState } from '#/shared/ui/list-state'

import { can } from '../model/course'
import { updatesOptions } from '../queries'
import { CreateUpdateDialog } from './create-update-dialog'
import { UpdateItem } from './update-item'

/** The course's announcements (learners read them in the course page's `updates` tab); written here. */
export function UpdatesSection({ course }: { course: Course }) {
  const updates = useSuspenseQuery(updatesOptions(course.id))
  const editable = can(course, 'update')
  return (
    <section aria-label={m.studio_updates_title()} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold">{m.studio_updates_title()}</h2>
          <p className="text-sm text-muted-foreground">{m.studio_updates_hint()}</p>
        </div>
        {editable ? <CreateUpdateDialog courseId={course.id} /> : null}
      </div>
      <ListState
        pending={false}
        error={updates.error}
        count={updates.data.length}
        filtered={false}
        emptyText={m.studio_updates_empty()}
        onRetry={() => void updates.refetch()}
      >
        <DataList items={updates.data} getKey={update => update.id}>
          {update => <UpdateItem courseId={course.id} update={update} editable={editable} />}
        </DataList>
      </ListState>
    </section>
  )
}
