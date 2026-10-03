import { Command as Cmdk } from 'cmdk'
import type { ReactNode, Ref } from 'react'

import { controlClass } from './form/control-classes'
import { menuItemClass } from './menu-classes'

/** One choice of a command list: arrows highlight it, Enter or a click runs `onSelect`. */
export type CommandEntry = {
  /** Unique within the list: cmdk tracks the highlighted entry by it. */
  id: string
  label: string
  /** A lucide icon, `aria-hidden`. */
  icon?: ReactNode
  /** Quiet text on the right: a username, a shortcut. */
  hint?: string
  onSelect: () => void
}

export type CommandGroup = { heading: string; entries: readonly CommandEntry[] }

type CommandProps = {
  /** Names the input and the list for screen readers. */
  label: string
  placeholder: string
  value: string
  onValueChange: (value: string) => void
  groups: readonly CommandGroup[]
  /** Shown when no group has an entry. */
  emptyText: string
  /** Shown while the caller is still loading entries for the current value. */
  loadingText?: string | undefined
  /** The input, for a dialog's `initialFocus`. */
  inputRef?: Ref<HTMLInputElement>
}

/**
 * A command list (spec N-4) on cmdk: one input over keyboard-navigable groups. Filtering is the caller's (entries
 * come from the server and the access table), so cmdk only handles focus, arrows, Enter and the ARIA combobox.
 */
export function Command(props: CommandProps) {
  const { label, placeholder, value, onValueChange, groups, emptyText, loadingText, inputRef } = props
  return (
    <Cmdk label={label} shouldFilter={false} loop className="flex flex-col gap-2">
      <Cmdk.Input
        ref={inputRef}
        value={value}
        onValueChange={onValueChange}
        placeholder={placeholder}
        className={`h-control ${controlClass}`}
      />
      <Cmdk.List label={label} className="max-h-80 overflow-y-auto">
        {loadingText ? (
          <Cmdk.Loading label={loadingText} className="px-2 py-2 text-sm text-muted-foreground">
            {loadingText}
          </Cmdk.Loading>
        ) : (
          <Cmdk.Empty className="px-2 py-6 text-sm text-muted-foreground">{emptyText}</Cmdk.Empty>
        )}
        {groups.map(group => (
          <Cmdk.Group
            key={group.heading}
            heading={
              <span className="block px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground">{group.heading}</span>
            }
          >
            {group.entries.map(entry => (
              <Cmdk.Item
                key={entry.id}
                value={entry.id}
                onSelect={entry.onSelect}
                className={`${menuItemClass} aria-selected:bg-accent aria-selected:text-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0`}
              >
                {entry.icon}
                <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                {entry.hint ? <span className="text-xs text-muted-foreground">{entry.hint}</span> : null}
              </Cmdk.Item>
            ))}
          </Cmdk.Group>
        ))}
      </Cmdk.List>
    </Cmdk>
  )
}
