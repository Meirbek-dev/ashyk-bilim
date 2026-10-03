import { useNavigate } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { Button } from '#/shared/ui/button'
import { ChoiceMenu } from '#/shared/ui/choice-menu'

import { type CourseSort, isCourseSort, sortOptions } from '../model/catalog'

const sortLabels = {
  progress: m.catalog_sort_progress,
  updated: m.catalog_sort_updated,
  name: m.catalog_sort_name,
} satisfies Record<CourseSort, () => string>

/** The catalog order, kept in the URL (`?sort=`); the menu offers only the orders that mean something to the caller. */
export function SortMenu({ sort, signedIn }: { sort: CourseSort; signedIn: boolean }) {
  const navigate = useNavigate({ from: '/courses/' })
  const label = m.catalog_sort_label({ sort: sortLabels[sort]() })
  return (
    <ChoiceMenu
      trigger={<Button variant="outline">{label}</Button>}
      choice={{
        label,
        value: sort,
        options: sortOptions(signedIn).map(value => ({ value, label: sortLabels[value]() })),
        onValueChange: value => {
          if (isCourseSort(value)) void navigate({ search: prev => ({ ...prev, sort: value }) })
        },
      }}
    />
  )
}
