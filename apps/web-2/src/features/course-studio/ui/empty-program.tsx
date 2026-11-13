import type { ReactNode } from 'react'

import { m } from '#/paraglide/messages'

/**
 * A program without chapters: what a chapter is, and the button to add the first one (when allowed), in the quiet
 * field of every empty list (`EmptyState` holds one sentence; this one has a name and a hint).
 */
export function EmptyProgram({ create }: { create: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-lg bg-muted/60 px-6 py-10 text-center">
      <div className="flex max-w-prose flex-col gap-1">
        <p className="text-base font-medium">{m.studio_content_empty()}</p>
        {create ? <p className="text-sm text-pretty text-muted-foreground">{m.studio_content_empty_hint()}</p> : null}
      </div>
      {create}
    </div>
  )
}
