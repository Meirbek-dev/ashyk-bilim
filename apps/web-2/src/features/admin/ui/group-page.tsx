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
import { GroupEditSection } from './group-edit-section'
import { GroupMembers } from './group-members'

/** One group: its members, and only the edits its `allowed_actions` list. Courses are linked from the course side. */
export function GroupPage() {
  const { groupId } = useParams({ from: '/_authed/teach/groups/$groupId' })
  const { data: group } = useSuspenseQuery(groupOptions(groupId))
  return (
    <DetailPage
      back={
        <RouterLink to="/teach/groups" className={buttonVariants({ variant: 'ghost' })}>
          <ArrowLeft aria-hidden />
          {m.admin_groups_all()}
        </RouterLink>
      }
      title={group.name}
      meta={`${m.admin_group_member_count({ count: group.member_count })} · ${m.admin_group_updated({ date: formatDate(group.updated_at_unix) })}`}
      primaryAction={canGroup(group, 'delete') ? <DeleteGroup group={group} /> : null}
    >
      {group.description ? <p className="max-w-prose wrap-anywhere">{group.description}</p> : null}
      {canGroup(group, 'update') ? <GroupEditSection group={group} /> : null}
      <GroupMembers group={group} />
    </DetailPage>
  )
}
