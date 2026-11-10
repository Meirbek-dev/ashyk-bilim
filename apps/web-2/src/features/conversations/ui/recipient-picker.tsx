import { useDebouncedValue } from '@tanstack/react-pacer'
import { Suspense, useDeferredValue, useId, useState } from 'react'
import { m } from '#/paraglide/messages'
import { ListSkeleton } from '#/shared/components/list-skeleton'
import { Input } from '#/shared/ui/input'
import { Recipients } from './recipients-list'

/** Typing settles for this long before the list asks again. */
const SEARCH_WAIT_MS = 250

export function RecipientPicker() {
  const id = useId()
  const [text, setText] = useState('')
  const [settled] = useDebouncedValue(text.trim(), { wait: SEARCH_WAIT_MS })
  // A new search suspends while it loads: the deferred value keeps the previous rows on screen meanwhile.
  const q = useDeferredValue(settled)
  return (
    <div className="flex max-w-2xl flex-col gap-gutter">
      <div className="flex flex-col gap-2">
        <label htmlFor={id} className="text-sm font-medium">
          {m.conversations_search_label()}
        </label>
        <Input id={id} type="search" value={text} onChange={event => setText(event.target.value)} />
      </div>
      <section aria-label={m.conversations_recipients_label()}>
        <Suspense fallback={<ListSkeleton />}>
          <Recipients q={q} />
        </Suspense>
      </section>
    </div>
  )
}
