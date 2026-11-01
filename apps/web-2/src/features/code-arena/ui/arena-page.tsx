import { Link as RouterLink, useLoaderData, useParams } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'

import { ActivityHeader, PreviewNote } from '#/features/player'
import { m } from '#/paraglide/messages'
import { FocusPage } from '#/shared/components/templates/focus-page'
import { buttonVariants } from '#/shared/components/button-variants'

import { ARENA_ROUTE } from './arena-route'
import { Challenge } from './challenge'

/**
 * A code challenge (spec 5.3): focus layout, back to the activity in the player. The loader names the course and the
 * activity from the learner state and says whether the activity is locked.
 */
export function ArenaPage() {
  const { courseId, activityId } = useParams({ from: ARENA_ROUTE })
  const { title, courseTitle, locked, preview } = useLoaderData({ from: ARENA_ROUTE })
  // Staff previewing leave to the studio: a draft challenge is in no player outline.
  const back = preview ? (
    <RouterLink
      to="/teach/courses/$courseId/activities/$activityId/edit"
      params={{ courseId, activityId }}
      className={buttonVariants({ variant: 'ghost' })}
    >
      <ArrowLeft aria-hidden />
      {m.player_preview_studio()}
    </RouterLink>
  ) : (
    <RouterLink
      to="/learn/$courseId/$activityId"
      params={{ courseId, activityId }}
      className={buttonVariants({ variant: 'ghost' })}
    >
      <ArrowLeft aria-hidden />
      {m.code_back()}
    </RouterLink>
  )
  return (
    <FocusPage back={back} title={courseTitle} wide>
      <article className="mx-auto flex w-full max-w-(--breakpoint-2xl) min-w-0 flex-col gap-gutter">
        <ActivityHeader type="code_challenge" title={title} />
        {preview ? <PreviewNote /> : null}
        {locked ? (
          <p className="text-muted-foreground">{m.code_locked()}</p>
        ) : (
          <Challenge courseId={courseId} activityId={activityId} />
        )}
      </article>
    </FocusPage>
  )
}
