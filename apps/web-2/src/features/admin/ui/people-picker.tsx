import { useDebouncedValue } from '@tanstack/react-pacer'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useDeferredValue, useState } from 'react'

import { m } from '#/paraglide/messages'
import type { UserHit } from '#/shared/api/gen/types.gen'
import { Combobox } from '#/shared/ui/combobox'

import { peopleOptions } from '../queries'

/** Typing settles for this long before the picker asks `search`. */
const SEARCH_WAIT_MS = 250

type PeoplePickerProps = { label: string; value: readonly UserHit[]; onValueChange: (people: UserHit[]) => void }

const option = (person: UserHit) => ({ value: person.id, label: `${person.display_name} (@${person.username})` })

/** Several people by name or username (the platform search); the chosen ones keep their chips across searches. */
export function PeoplePicker({ label, value, onValueChange }: PeoplePickerProps) {
  const [text, setText] = useState('')
  const [settled] = useDebouncedValue(text.trim(), { wait: SEARCH_WAIT_MS })
  // A new query suspends while it loads: the deferred value keeps the previous options on screen meanwhile.
  const q = useDeferredValue(settled)
  const { data: found } = useSuspenseQuery(peopleOptions(q))
  const known = [...value, ...found]
  return (
    <Combobox
      label={label}
      placeholder={m.admin_search_placeholder()}
      options={found.map(option)}
      value={value.map(option)}
      onValueChange={next =>
        onValueChange(next.flatMap(picked => known.find(person => person.id === picked.value) ?? []))
      }
      onQueryChange={setText}
      pending={text.trim() !== q}
    />
  )
}
