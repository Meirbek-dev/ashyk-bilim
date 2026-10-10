import { useDebouncedValue } from '@tanstack/react-pacer'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useDeferredValue, useState } from 'react'

import { m } from '#/paraglide/messages'
import type { Course } from '#/shared/api/gen/types.gen'
import { MultiCombobox } from '#/shared/components/multi-combobox'

import { pickableCoursesOptions } from '../queries'

/** Typing settles for this long before the picker asks the catalog. */
const SEARCH_WAIT_MS = 250

type CoursePickerProps = {
  /** The collection's courses when the page opened. */
  initial: readonly Pick<Course, 'id' | 'name'>[]
  /** The chosen course ids, in order. */
  onChange: (ids: string[]) => void
}

/** B-COL-15 The collection's courses as chips in collection order; more are found by name in the catalog. */
export function CoursePicker({ initial, onChange }: CoursePickerProps) {
  // The chips keep their names; the form keeps only the ids.
  const [picked, setPicked] = useState(() => initial.map(course => ({ value: course.id, label: course.name })))
  const [text, setText] = useState('')
  const [settled] = useDebouncedValue(text.trim(), { wait: SEARCH_WAIT_MS })
  // A new query suspends while it loads: the deferred value keeps the previous options on screen meanwhile.
  const q = useDeferredValue(settled)
  const { data: found } = useSuspenseQuery(pickableCoursesOptions(q))
  return (
    <MultiCombobox
      label={m.collections_field_courses()}
      description={m.collections_field_courses_hint()}
      placeholder={m.collections_courses_placeholder()}
      options={found.items.map(course => ({ value: course.id, label: course.name }))}
      value={picked}
      onValueChange={next => {
        setPicked(next)
        onChange(next.map(course => course.value))
      }}
      onQueryChange={setText}
      pending={text.trim() !== q}
    />
  )
}
