import { X } from 'lucide-react'
import type { ReactNode } from 'react'

import { m } from '#/paraglide/messages'
import { Button } from '#/shared/ui/button'
import { IconButton } from '#/shared/ui/icon-button'

type ItemListProps = {
  count: number
  onAdd: () => void
  onRemove: (index: number) => void
  /** The fields of item `index`. */
  fields: (index: number) => ReactNode
}

/** The items of one builder section (links, skills...): each a numbered group with its remove button. */
export function ItemList({ count, onAdd, onRemove, fields }: ItemListProps) {
  return (
    <div className="flex flex-col gap-4">
      {Array.from({ length: count }, (_, index) => (
        <fieldset key={index} className="flex flex-col gap-4 border-l-2 pl-4">
          <legend className="sr-only">{m.settings_builder_item({ n: index + 1 })}</legend>
          <div className="flex items-center justify-between gap-2">
            <span aria-hidden className="text-sm text-muted-foreground">
              {m.settings_builder_item({ n: index + 1 })}
            </span>
            <IconButton
              label={m.settings_builder_item_remove({ n: index + 1 })}
              icon={<X aria-hidden />}
              onClick={() => onRemove(index)}
            />
          </div>
          {fields(index)}
        </fieldset>
      ))}
      <div>
        <Button variant="ghost" onClick={onAdd}>
          {m.settings_builder_item_add()}
        </Button>
      </div>
    </div>
  )
}
