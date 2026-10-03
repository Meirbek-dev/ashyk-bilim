import { useSuspenseQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { DataList } from '#/shared/ui/data-list'
import { Link } from '#/shared/ui/link'
import { ListState } from '#/shared/ui/list-state'

import { can, courseStatus, type CourseStatus } from '../model/course'
import { courseGroupsOptions, courseOptions } from '../queries'
import { LinkGroups } from './link-groups'
import { UnlinkGroup } from './unlink-group'

const accessText: Record<CourseStatus, () => string> = {
  published: m.studio_access_published,
  draft: m.studio_access_draft,
  archived: m.studio_access_archived,
}

/** `learners`: who can see the course (from its status) and the groups whose members see it while it is a draft. */
export function LearnersPage() {
  const { courseId } = useParams({ from: '/_authed/teach/courses/$courseId/learners' })
  const { data: course } = useSuspenseQuery(courseOptions(courseId))
  const groups = useSuspenseQuery(courseGroupsOptions(courseId))
  // An archived course is read-only: its group links are shown, not changed.
  const editable = can(course, 'update')
  return (
    <div className="flex max-w-prose flex-col gap-12">
      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">{m.studio_access_title()}</h2>
        <p>{accessText[courseStatus(course)]()}</p>
        <div>
          <Link to="/teach/courses/$courseId/publish" params={{ courseId }}>
            {m.studio_go_publish()}
          </Link>
        </div>
      </section>
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold">{m.studio_groups_title()}</h2>
          <p className="text-sm text-muted-foreground">{m.studio_groups_hint()}</p>
        </div>
        {editable ? <LinkGroups courseId={courseId} linked={groups.data} /> : null}
        <ListState
          pending={false}
          error={groups.error}
          count={groups.data.length}
          filtered={false}
          emptyText={m.studio_groups_empty()}
          onRetry={() => void groups.refetch()}
        >
          <DataList items={groups.data} getKey={group => group.id}>
            {group => (
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <h3 className="text-base font-medium wrap-anywhere">{group.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {m.studio_group_members({ count: group.member_count })}
                  </p>
                </div>
                {editable && group.allowed_actions.includes('manage_courses') ? (
                  <UnlinkGroup courseId={courseId} group={group} />
                ) : null}
              </div>
            )}
          </DataList>
        </ListState>
      </section>
    </div>
  )
}
