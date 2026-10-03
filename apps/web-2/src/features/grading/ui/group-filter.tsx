import { useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import type { CourseId } from '#/shared/api/gen/types.gen'
import { NativeSelect, NativeSelectOption } from '#/shared/ui/native-select'

import { groupsOptions } from '../queries'

type GroupFilterProps = {
  courseId: CourseId
  group: string | undefined
  onGroup: (group: string | undefined) => unknown
}

/** "All groups" or one of the course's groups (`?group=`, B-GRD-24); a course without groups shows no filter. */
export function GroupFilter({ courseId, group, onGroup }: GroupFilterProps) {
  const { data: groups } = useSuspenseQuery(groupsOptions(courseId))
  if (groups.length === 0) return null
  return (
    <NativeSelect
      aria-label={m.grading_group()}
      value={group ?? ''}
      onChange={event => onGroup(event.target.value || undefined)}
    >
      <NativeSelectOption value="">{m.grading_group_all()}</NativeSelectOption>
      {groups.map(item => (
        <NativeSelectOption key={item.id} value={item.id}>
          {item.name}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  )
}
