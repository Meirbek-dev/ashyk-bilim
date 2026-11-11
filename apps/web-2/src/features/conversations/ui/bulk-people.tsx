import { m } from '#/paraglide/messages'
import { formatNumber } from '#/shared/i18n/format'
import { Checkbox } from '#/shared/ui/checkbox'
import { Field, FieldLabel, FieldLegend, FieldSet } from '#/shared/ui/field'

import { MAX_RECIPIENTS } from '../model/attachments'
import { toggle, type BulkPerson } from '../model/bulk'

type BulkPeopleProps = {
  people: readonly BulkPerson[]
  picks: ReadonlySet<string>
  onChange: (picks: Set<string>) => void
}

/** Who the bulk send goes to: a tick per learner, at most fifty. */
export function BulkPeople({ people, picks, onChange }: BulkPeopleProps) {
  return (
    <FieldSet>
      <FieldLegend variant="label">
        {m.conversations_bulk_to({ count: formatNumber(picks.size), max: formatNumber(MAX_RECIPIENTS) })}
      </FieldLegend>
      <div className="flex max-h-56 flex-col gap-2 overflow-y-auto">
        {people.map(person => {
          const id = `bulk-${person.id}`
          return (
            <Field key={person.id} orientation="horizontal">
              <Checkbox
                id={id}
                checked={picks.has(person.id)}
                disabled={!picks.has(person.id) && picks.size >= MAX_RECIPIENTS}
                onCheckedChange={() => onChange(toggle(picks, person.id))}
              />
              <FieldLabel htmlFor={id} className="min-w-0 wrap-anywhere">
                {person.name}
              </FieldLabel>
            </Field>
          )
        })}
      </div>
    </FieldSet>
  )
}
