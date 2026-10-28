import { Plus, X } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { IconButton } from '#/shared/components/icon-button'
import { cn } from '#/shared/lib/utils'
import { Button } from '#/shared/ui/button'
import { NativeSelect, NativeSelectOption } from '#/shared/ui/native-select'

import { actionChoices, grantWords, resourceChoices, scopeChoices } from '../model/permissions'

type Choice = { value: string; label: string }

const NEW_GRANT = 'course:read:*'

/** A grant the pickers can show: every part is in the catalog (an unknown one keeps its row as sent). */
const pickable = (grant: string) => {
  const words = grantWords(grant)
  return words.action !== null && words.scope !== null && resourceChoices().some(c => c.value === grant.split(':')[0])
}

function Picker({
  label,
  value,
  choices,
  disabled,
  onChange,
}: {
  label: string
  value: string
  choices: Choice[]
  disabled: boolean
  onChange: (value: string) => void
}) {
  return (
    <NativeSelect
      aria-label={label}
      value={value}
      disabled={disabled}
      className="w-full"
      onChange={event => onChange(event.target.value)}
    >
      {choices.map(choice => (
        <NativeSelectOption key={choice.value} value={choice.value}>
          {choice.label}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  )
}

type GrantRowsProps = {
  grants: string[]
  /** Grants the server refused on the last save: their rows are marked. */
  refused: string[]
  disabled: boolean
  onChange: (grants: string[]) => void
}

/**
 * The grant editor: a row per grant with a picker for each part (resource, action, scope), a remove button, and «Добавить
 * право». A scope the pickers do not offer (`all`, or none) stays as it is until the author picks another. A grant with
 * an unknown part is shown as sent, with only the remove button.
 */
export function GrantRows({ grants, refused, disabled, onChange }: GrantRowsProps) {
  const replace = (at: number, grant: string) => onChange(grants.map((old, index) => (index === at ? grant : old)))
  const remove = (at: number) => onChange(grants.filter((_, index) => index !== at))
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{m.admin_role_permissions_hint()}</p>
      {grants.length === 0 ? <p className="text-muted-foreground">{m.admin_role_permissions_empty()}</p> : null}
      {grants.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {grants.map((grant, at) => {
            const [resource = '', action = '', scope = '*'] = grant.split(':')
            const marked = refused.includes(grant)
            const scopes = scopeChoices()
            const scopeOptions = scopes.some(c => c.value === scope)
              ? scopes
              : [...scopes, { value: scope, label: grantWords(grant).scope ?? scope }]
            return (
              // Grants carry no ids (two rows may say the same until saved): the position is their identity.
              <li
                key={at}
                className={cn(
                  // On a phone the three pickers stack: a rule tells one grant from the next.
                  'flex items-start gap-2 border-b pb-2 last:border-b-0 sm:border-b-0 sm:pb-0',
                  marked && 'rounded-lg ring-2 ring-destructive',
                )}
              >
                {pickable(grant) ? (
                  <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-3">
                    <Picker
                      label={m.admin_perm_field_resource()}
                      value={resource}
                      choices={resourceChoices()}
                      disabled={disabled}
                      onChange={next => replace(at, `${next}:${action}:${scope}`)}
                    />
                    <Picker
                      label={m.admin_perm_field_action()}
                      value={action}
                      choices={actionChoices()}
                      disabled={disabled}
                      onChange={next => replace(at, `${resource}:${next}:${scope}`)}
                    />
                    <Picker
                      label={m.admin_perm_field_scope()}
                      value={scope}
                      choices={scopeOptions}
                      disabled={disabled}
                      onChange={next => replace(at, `${resource}:${action}:${next}`)}
                    />
                  </div>
                ) : (
                  <span className="min-w-0 flex-1 py-1.5 font-mono text-sm wrap-anywhere text-muted-foreground">
                    {m.admin_perm_raw({ grant })}
                  </span>
                )}
                <IconButton
                  label={m.admin_perm_remove()}
                  icon={<X aria-hidden />}
                  disabled={disabled}
                  onClick={() => remove(at)}
                />
              </li>
            )
          })}
        </ul>
      ) : null}
      {refused.length > 0 ? (
        <p role="alert" className="text-sm text-destructive">
          {m.admin_role_permissions_refused()}
        </p>
      ) : null}
      <div>
        <Button type="button" variant="outline" disabled={disabled} onClick={() => onChange([...grants, NEW_GRANT])}>
          <Plus data-icon="inline-start" aria-hidden />
          {m.admin_perm_add()}
        </Button>
      </div>
    </div>
  )
}
