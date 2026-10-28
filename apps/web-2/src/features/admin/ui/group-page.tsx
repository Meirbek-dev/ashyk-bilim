import { useSuspenseQuery } from '@tanstack/react-query'
import { Link as RouterLink, useParams } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { buttonVariants } from '#/shared/components/button-variants'
import { DetailPage } from '#/shared/components/templates/detail-page'
import { formatDate } from '#/shared/i18n/format'

import { canGroup } from '../model/admin'
import { groupOptions } from '../group-queries'
import { DeleteGroup } from './delete-group'
import { GroupCourses } from './group-courses'
import { GroupEditSection } from './group-edit-section'
import { GroupMembers } from './group-members'

/** One group: its courses, its members, and only the edits its `allowed_actions` list. Courses are linked from the
 * course side. */
export function GroupPage() {
  const { groupId } = useParams({ from: '/_authed/teach/groups/$groupId' })
  const { data: group } = useSuspenseQuery(groupOptions(groupId))
  return (
    <DetailPage
      back={
        <RouterLink to="/teach/groups" activeOptions={{ exact: true }} className={buttonVariants({ variant: 'ghost' })}>
          <ArrowLeft aria-hidden />
          {m.admin_groups_all()}
        </RouterLink>
      }
      title={group.name}
      meta={`${m.admin_group_member_count({ count: group.member_count })} · ${m.admin_group_updated({ date: formatDate(group.updated_at_unix) })}`}
    >
      {group.description ? <p className="max-w-prose wrap-anywhere">{group.description}</p> : null}
      {/* Teachers see every group but change only their own: say why there is nothing to press. */}
      {group.allowed_actions.length === 0 ? (
        <p className="max-w-prose text-sm text-muted-foreground">{m.admin_group_read_only()}</p>
      ) : null}
      <GroupCourses group={group} />
      <GroupMembers group={group} />
      {/* Renaming is rare: the courses and people the page is visited for come first. */}
      {canGroup(group, 'update') ? <GroupEditSection group={group} /> : null}
      {canGroup(group, 'delete') ? <DeleteGroup group={group} /> : null}
    </DetailPage>
  )
}
