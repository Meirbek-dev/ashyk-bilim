import { useId, type ReactNode } from 'react'

type StudioSectionProps = {
  title: string
  /** One quiet line under the title: what the part holds, or its counts. */
  hint?: ReactNode
  children: ReactNode
}

/**
 * One part of the code item's form, between hairlines: its name and hint in a narrow column when the page is wide, the
 * fields beside them, so the eye runs down the names and every field starts on the same edge.
 */
export function StudioSection({ title, hint, children }: StudioSectionProps) {
  const id = useId()
  return (
    <div
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a labelled group of fields; a fieldset would take over the grid layout and its legend quirks.
      role="group"
      aria-labelledby={id}
      className="grid min-w-0 gap-x-10 gap-y-4 border-t pt-8 @4xl:grid-cols-[11rem_minmax(0,1fr)]"
    >
      <div className="flex flex-col gap-1">
        <h3 id={id} className="text-lg font-semibold">
          {title}
        </h3>
        {hint ? <div className="text-sm text-muted-foreground">{hint}</div> : null}
      </div>
      <div className="flex min-w-0 flex-col gap-4">{children}</div>
    </div>
  )
}
