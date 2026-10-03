import { useSuspenseQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { DataList } from '#/shared/ui/data-list'

import { can } from '../model/course'
import { splitRoster } from '../model/studio'
import { contributorsOptions, courseOptions } from '../queries'
import { AddContributors } from './add-contributors'
import { ContributorRow } from './contributor-row'

/** `team`: the creator and co-authors with their roles, then open applications; changes need `manage_contributors`. */
export function TeamPage() {
  const { courseId } = useParams({ from: '/_authed/teach/courses/$courseId/team' })
  const { data: course } = useSuspenseQuery(courseOptions(courseId))
  const { data: roster } = useSuspenseQuery(contributorsOptions(courseId))
  const manage = can(course, 'manage_contributors')
  const { team, pending } = splitRoster(roster)
  return (
    <div className="flex max-w-prose flex-col gap-12">
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold">{m.studio_team_title()}</h2>
          <p className="text-sm text-muted-foreground">{m.studio_team_hint()}</p>
        </div>
        {manage ? <AddContributors courseId={courseId} /> : null}
        <DataList items={team} getKey={row => row.user_id}>
          {row => <ContributorRow courseId={courseId} row={row} manage={manage} />}
        </DataList>
      </section>
      {pending.length > 0 ? (
        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold">{m.studio_applications_title()}</h2>
          <DataList items={pending} getKey={row => row.user_id}>
            {row => <ContributorRow courseId={courseId} row={row} manage={manage} />}
          </DataList>
        </section>
      ) : null}
    </div>
  )
}
