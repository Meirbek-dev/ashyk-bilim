import { useHydrated } from '@tanstack/react-router'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { CourseId } from '#/shared/api/gen/types.gen'
import { Button } from '#/shared/ui/button'

import { NewPost } from './new-post'

/** One line until asked (B-DSC-19), then the composer with the editor focused; it stays open after a post. */
export function CollapsedComposer({ courseId }: { courseId: CourseId }) {
  const [open, setOpen] = useState(false)
  // Before hydration a click would do nothing on this SSR page: the button waits (AGENTS.md).
  const hydrated = useHydrated()
  if (open) return <NewPost courseId={courseId} focusOnMount />
  return (
    <Button
      variant="outline"
      className="w-full justify-start"
      disabled={!hydrated}
      data-hydrating={hydrated ? undefined : true}
      onClick={() => setOpen(true)}
    >
      {m.discussions_start()}
    </Button>
  )
}
