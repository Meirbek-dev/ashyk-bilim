import { Plus } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { Button } from '#/shared/ui/button'

import { GrantRow } from './grant-row'

const NEW_GRANT = 'course:read:*'

type GrantRowsProps = {
  grants: string[]
  /** Grants the server refused on the last save: their rows are marked. */
  refused: string[]
  disabled: boolean
  onChange: (grants: string[]) => void
}

/**
 * The grant editor: a row per grant with a picker for each part (resource, action, scope), a remove button, and «Добавить
 * право». The three columns are named once, above the rows. A scope the pickers do not offer (`all`, or none) stays as it
 * is until the author picks another. A grant with an unknown part is shown as sent, with only the remove button.
 */
export function GrantRows({ grants, refused, disabled, onChange }: GrantRowsProps) {
  const replace = (at: number, grant: string) => onChange(grants.map((old, index) => (index === at ? grant : old)))
  const remove = (at: number) => onChange(grants.filter((_, index) => index !== at))
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{m.admin_role_permissions_hint()}</p>
      {grants.length === 0 ? <p className="text-sm text-muted-foreground">{m.admin_role_permissions_empty()}</p> : null}
      {grants.length > 0 ? (
        <div className="flex flex-col gap-2">
          {/* The pickers carry their own names for a screen reader; this head is for the eye. */}
          <div
            aria-hidden
            className="hidden gap-2 border-b pr-10 pb-2 text-xs text-muted-foreground sm:grid sm:grid-cols-3"
          >
            <span>{m.admin_perm_field_resource()}</span>
            <span>{m.admin_perm_field_action()}</span>
            <span>{m.admin_perm_field_scope()}</span>
          </div>
          <ul className="flex flex-col gap-2">
            {grants.map((grant, at) => (
              // Grants carry no ids (two rows may say the same until saved): the position is their identity.
              <GrantRow
                key={at}
                grant={grant}
                marked={refused.includes(grant)}
                disabled={disabled}
                onReplace={next => replace(at, next)}
                onRemove={() => remove(at)}
              />
            ))}
          </ul>
        </div>
      ) : null}
      {refused.length > 0 ? (
        <p role="alert" className="text-sm text-destructive">
          {m.admin_role_permissions_refused()}
        </p>
      ) : null}
      {/* Its label, not its padding, starts on the rows' edge. */}
      <div className="-ml-2.5">
        <Button type="button" variant="ghost" disabled={disabled} onClick={() => onChange([...grants, NEW_GRANT])}>
          <Plus data-icon="inline-start" aria-hidden />
          {m.admin_perm_add()}
        </Button>
      </div>
    </div>
  )
}
