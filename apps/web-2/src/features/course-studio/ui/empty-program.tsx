import type { ReactNode } from 'react'

import { m } from '#/paraglide/messages'

/** A program without chapters: what a chapter is, and the button to add the first one (when allowed). */
export function EmptyProgram({ create }: { create: ReactNode }) {
  return (
    <div className="flex max-w-prose flex-col items-start gap-4 py-8">
      <div className="flex flex-col gap-1">
        <p className="text-base font-medium">{m.studio_content_empty()}</p>
        {create ? <p className="text-sm text-muted-foreground">{m.studio_content_empty_hint()}</p> : null}
      </div>
      {create}
    </div>
  )
}
