import { Plus, X } from 'lucide-react'
import { useRef, type ReactNode } from 'react'

import { IconButton } from '#/shared/components/icon-button'
import { Button } from '#/shared/ui/button'
import { FieldDescription, FieldLegend, FieldSet } from '#/shared/ui/field'
import { Input } from '#/shared/ui/input'

type TextListProps = {
  legend: string
  /** Shown while the list can be edited. */
  hint: string
  values: string[]
  onChange: (values: string[]) => void
  /** The name of row N («Ответ 1»), its remove button's name, the add button. */
  rowLabel: (number: number) => string
  removeLabel: (number: number) => string
  addLabel: string
  editable: boolean
  /** The fewest rows the list keeps (the last cannot be removed below it). */
  min?: number
  /** More controls of the list's group, after it (the case switch of accepted answers). */
  children?: ReactNode
}

/** An editable list of short texts (accepted answers, distractors): a row each, remove, add (the cursor goes there). */
export function TextList(props: TextListProps) {
  const { legend, hint, values, onChange, rowLabel, removeLabel, addLabel, editable, min = 0, children } = props
  const list = useRef<HTMLOListElement>(null)
  const add = () => {
    onChange([...values, ''])
    // After React puts the row in: the new last input takes the cursor.
    requestAnimationFrame(() => list.current?.querySelector<HTMLInputElement>('li:last-child input')?.focus())
  }
  return (
    <FieldSet>
      <FieldLegend variant="label">{legend}</FieldLegend>
      {editable ? <FieldDescription>{hint}</FieldDescription> : null}
      <ol ref={list} className="flex flex-col gap-2">
        {values.map((value, at) => (
          // The rows carry no ids: the position is their identity while editing.
          <li key={at} className="flex items-center gap-2">
            <Input
              aria-label={rowLabel(at + 1)}
              placeholder={rowLabel(at + 1)}
              value={value}
              disabled={!editable}
              onChange={event => onChange(values.map((old, index) => (index === at ? event.target.value : old)))}
            />
            <IconButton
              label={removeLabel(at + 1)}
              icon={<X aria-hidden />}
              disabled={!editable || values.length <= min}
              onClick={() => onChange(values.filter((_, index) => index !== at))}
            />
          </li>
        ))}
      </ol>
      {editable ? (
        <div>
          <Button type="button" variant="outline" size="sm" onClick={add}>
            <Plus data-icon="inline-start" aria-hidden />
            {addLabel}
          </Button>
        </div>
      ) : null}
      {children}
    </FieldSet>
  )
}
