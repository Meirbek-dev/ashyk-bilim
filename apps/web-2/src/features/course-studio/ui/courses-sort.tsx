import { useNavigate } from '@tanstack/react-router'
import { ArrowUpDown } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { ChoiceItems } from '#/shared/components/choice-items'
import { Button } from '#/shared/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '#/shared/ui/dropdown-menu'

import type { CoursesSearch } from '../model/course'

const labels = { updated: m.studio_sort_updated, name: m.studio_sort_name } as const

/** The list order in the URL (`?sort=name`; none is the server's newest first), as the old course table offered. */
export function CoursesSortMenu({ search }: { search: CoursesSearch }) {
  const navigate = useNavigate()
  const current = search.sort ?? 'updated'
  const label = m.studio_sort_label({ sort: labels[current]() })
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          // The icon says «order», the text which one: the full «Сортировка: …» stays the button's name.
          <Button variant="outline" aria-label={label}>
            <ArrowUpDown aria-hidden data-icon="inline-start" className="text-muted-foreground" />
            {labels[current]()}
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <ChoiceItems
          choice={{
            label,
            value: current,
            options: (['updated', 'name'] as const).map(value => ({ value, label: labels[value]() })),
            onValueChange: value =>
              void navigate({
                to: '/teach/courses',
                search: { ...search, sort: value === 'name' ? 'name' : undefined },
              }),
          }}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
