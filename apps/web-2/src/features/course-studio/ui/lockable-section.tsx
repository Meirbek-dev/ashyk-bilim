import type { ComponentProps } from 'react'

import { SettingsSection } from '#/shared/components/templates/settings-section'

type LockableSectionProps = ComponentProps<typeof SettingsSection> & {
  /** Why the server refuses edits now (e.g. an assessment's `edit_lock`); null: an ordinary section. */
  lock: string | null
}

/** A settings section that may be closed for editing: then its fields stay visible but disabled, the reason replaces Save. */
export function LockableSection({ lock, ...section }: LockableSectionProps) {
  if (!lock) return <SettingsSection {...section} />
  return (
    <section aria-label={section.title} className="flex max-w-prose flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">{section.title}</h2>
        <p className="text-sm text-muted-foreground">{section.description}</p>
      </div>
      <p className="text-sm">{lock}</p>
      {/* ponytail: `inert` because the shared Switch / RadioGroup fields are Base UI spans a disabled fieldset does not
          reach (and take no `disabled`); it also hides the values from assistive tech. Drop it once they do. */}
      <fieldset disabled inert className="flex min-w-0 flex-col gap-4">
        {section.children}
      </fieldset>
    </section>
  )
}
