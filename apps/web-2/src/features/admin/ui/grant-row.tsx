import { X } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { IconButton } from '#/shared/components/icon-button'
import { cn } from '#/shared/lib/utils'

import { actionChoices, grantWords, resourceChoices, scopeChoices } from '../model/permissions'
import { GrantPicker } from './grant-picker'

/** A grant the pickers can show: every part is in the catalog (an unknown one keeps its row as sent). */
const pickable = (grant: string) => {
  const words = grantWords(grant)
  return words.action !== null && words.scope !== null && resourceChoices().some(c => c.value === grant.split(':')[0])
}

type GrantRowProps = {
  grant: string
  marked: boolean
  disabled: boolean
  onReplace: (grant: string) => void
  onRemove: () => void
}

/** One grant of the editor: three pickers (or the grant as sent) and the remove button. */
export function GrantRow({ grant, marked, disabled, onReplace, onRemove }: GrantRowProps) {
  const [resource = '', action = '', scope = '*'] = grant.split(':')
  const scopes = scopeChoices()
  const scopeOptions = scopes.some(c => c.value === scope)
    ? scopes
    : [...scopes, { value: scope, label: grantWords(grant).scope ?? scope }]
  return (
    <li
      className={cn(
        // On a phone the three pickers stack: a rule tells one grant from the next.
        'flex items-start gap-2 border-b pb-2 last:border-b-0 sm:border-b-0 sm:pb-0',
        marked && 'rounded-lg ring-2 ring-destructive',
      )}
    >
      {pickable(grant) ? (
        <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-3">
          <GrantPicker
            label={m.admin_perm_field_resource()}
            value={resource}
            choices={resourceChoices()}
            disabled={disabled}
            onChange={next => onReplace(`${next}:${action}:${scope}`)}
          />
          <GrantPicker
            label={m.admin_perm_field_action()}
            value={action}
            choices={actionChoices()}
            disabled={disabled}
            onChange={next => onReplace(`${resource}:${next}:${scope}`)}
          />
          <GrantPicker
            label={m.admin_perm_field_scope()}
            value={scope}
            choices={scopeOptions}
            disabled={disabled}
            onChange={next => onReplace(`${resource}:${action}:${next}`)}
          />
        </div>
      ) : (
        <span className="min-w-0 flex-1 py-1.5 font-mono text-sm wrap-anywhere text-muted-foreground">
          {m.admin_perm_raw({ grant })}
        </span>
      )}
      <IconButton label={m.admin_perm_remove()} icon={<X aria-hidden />} disabled={disabled} onClick={onRemove} />
    </li>
  )
}
