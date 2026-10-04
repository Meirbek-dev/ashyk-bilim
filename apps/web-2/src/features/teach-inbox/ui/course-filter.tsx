import { useNavigate } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import type { WorkItem } from '#/shared/api/gen/types.gen'
import { ChoiceItems } from '#/shared/components/choice-items'
import { Button } from '#/shared/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '#/shared/ui/dropdown-menu'

import { courseOptions } from '../model/inbox'

const ALL = ''

/**
 * The course filter (`?course=`, applied by the server): the courses of the loaded rows, plus the one in the URL if
 * none of them is it. While filtered, the rows are of that course only: "All courses" brings the others back.
 */
export function CourseFilter({ items, course }: { items: readonly WorkItem[]; course: string | undefined }) {
  const navigate = useNavigate({ from: '/teach/' })
  const courses = courseOptions(items).map(option => ({ value: option.id, label: option.title }))
  if (course && !courses.some(option => option.value === course))
    courses.push({ value: course, label: m.inbox_course_selected() })
  const options = [{ value: ALL, label: m.inbox_course_all() }, ...courses]
  const value = course ?? ALL
  const label = options.find(option => option.value === value)?.label ?? m.inbox_course_all()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline">{label}</Button>} />
      <DropdownMenuContent align="start">
        <ChoiceItems
          choice={{
            label,
            value,
            options,
            onValueChange: next => void navigate({ search: prev => ({ ...prev, course: next || undefined }) }),
          }}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
