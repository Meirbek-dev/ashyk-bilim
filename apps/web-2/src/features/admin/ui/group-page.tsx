import { useSuspenseQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { Link } from '#/shared/components/link'
import { DetailPage } from '#/shared/components/templates/detail-page'
import { formatDate } from '#/shared/i18n/format'

import { canGroup } from '../model/admin'
import { groupOptions, membersOptions } from '../queries'
import { DeleteGroup } from './delete-group'
import { GroupEditSection } from './group-edit-section'
import { GroupMembers } from './group-members'

/** One group: its members, and only the edits its `allowed_actions` list. Courses are linked from the course side. */
export function GroupPage() {
  const { groupId } = useParams({ from: '/_authed/teach/groups/$groupId' })
  const { data: group } = useSuspenseQuery(groupOptions(groupId))
  // The count follows the members list on screen, which takes adds and removals at once (they answer 204).
  const { data: members } = useSuspenseQuery(membersOptions(groupId))
  return (
    <DetailPage
      title={group.name}
      meta={`${m.admin_group_member_count({ count: members.length })} · ${m.admin_group_updated({ date: formatDate(group.updated_at_unix) })}`}
      primaryAction={canGroup(group, 'delete') ? <DeleteGroup group={group} /> : null}
    >
      <Link to="/teach/groups">{m.admin_groups_all()}</Link>
      {group.description ? <p className="max-w-prose wrap-anywhere">{group.description}</p> : null}
      {canGroup(group, 'update') ? <GroupEditSection group={group} /> : null}
      <GroupMembers group={group} />
    </DetailPage>
  )
}
