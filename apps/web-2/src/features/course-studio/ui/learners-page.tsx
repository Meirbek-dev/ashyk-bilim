import { useSuspenseQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { DataList } from '#/shared/components/data-list'
import { Link } from '#/shared/components/link'
import { ListState } from '#/shared/components/list-state'
import { SheetPanel } from '#/shared/components/sheet-panel'
import { Button } from '#/shared/ui/button'

import { can, courseStatus, type CourseStatus } from '../model/course'
import { courseGroupsOptions, courseOptions } from '../queries'
import { EnrollLearners } from './enroll-learners'
import { LearnersSection } from './learners-section'
import { LinkGroups } from './link-groups'
import { UnlinkGroup } from './unlink-group'

const accessText: Record<CourseStatus, () => string> = {
  published: m.studio_access_published,
  draft: m.studio_access_draft,
  archived: m.studio_access_archived,
}

/**
 * `learners`: the enrolled learners first (the table people come here for; "Add learners" opens the roster in a side
 * panel), then who can see the course (from its status) and the groups whose members see it while it is a draft.
 */
export function LearnersPage() {
  const { courseId } = useParams({ from: '/_authed/teach/courses/$courseId/learners' })
  const { data: course } = useSuspenseQuery(courseOptions(courseId))
  const groups = useSuspenseQuery(courseGroupsOptions(courseId))
  // An archived course is read-only: its group links are shown, not changed.
  const editable = can(course, 'update')
  const add =
    can(course, 'manage_contributors') && editable ? (
      <SheetPanel side="right" title={m.studio_roster_title()} trigger={<Button>{m.studio_roster_title()}</Button>}>
        <EnrollLearners courseId={courseId} />
      </SheetPanel>
    ) : null
  return (
    <div className="flex flex-col gap-12">
      <LearnersSection courseId={courseId} courseName={course.name} add={add} />
      <div className="grid gap-12 lg:grid-cols-2">
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
            <DataList items={groups.data} getKey={group => group.id} variant="rows">
              {group => (
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex min-w-0 grow basis-48 flex-col gap-1">
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
    </div>
  )
}
