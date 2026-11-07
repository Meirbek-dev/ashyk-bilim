import { useEffect, useRef } from 'react'

import type { ActivityType } from '#/shared/api/gen/types.gen'
import { ActivityIcon } from '#/shared/components/activity-icon'
import { activityTypeMeta } from '#/shared/i18n/labels'

/**
 * The activity's heading in the player: its type and label on one line over the title, so a long title takes the
 * column's full width. `tool`: a screen the learner works in (the code arena), where the work leads, not the title.
 */
export function ActivityHeader({ type, title, tool = false }: { type: ActivityType; title: string; tool?: boolean }) {
  const heading = useRef<HTMLHeadingElement>(null)
  // «Следующая», «Предыдущая» or the contents keep the focus on that link while the activity changes under it, and a
  // screen reader read out the next link instead of the page: the new title (the player mounts one per activity)
  // takes the focus. A page load keeps its own.
  useEffect(() => {
    if (document.activeElement !== document.body) heading.current?.focus()
  }, [])
  return (
    <header className={`flex flex-col ${tool ? 'gap-1' : 'gap-3'}`}>
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <ActivityIcon type={type} size="sm" />
        {activityTypeMeta[type].label()}
      </p>
      <h1
        ref={heading}
        tabIndex={-1}
        // A long real title at the largest size fills the first screen: it steps down a size.
        className={`${tool || title.length > 32 ? 'text-2xl' : 'text-3xl'} font-semibold text-balance wrap-anywhere outline-none`}
      >
        {title}
      </h1>
    </header>
  )
}
