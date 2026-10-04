import { Link as RouterLink, useLoaderData, useParams } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { FocusPage } from '#/shared/components/templates/focus-page'
import { activityTypeMeta } from '#/shared/i18n/labels'
import { buttonVariants } from '#/shared/ui/button'

import { ARENA_ROUTE } from './arena-route'
import { Challenge } from './challenge'

const meta = activityTypeMeta.code_challenge

/**
 * A code challenge (spec 5.3): focus layout, back to the activity in the player. The loader names the course and the
 * activity from the learner state and says whether the activity is locked.
 */
export function ArenaPage() {
  const { courseId, activityId } = useParams({ from: ARENA_ROUTE })
  const { title, courseTitle, locked } = useLoaderData({ from: ARENA_ROUTE })
  const back = (
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
      <article className="mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-gutter">
        <header className="flex flex-col gap-1">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <meta.icon aria-hidden className={`size-4 ${meta.ink}`} />
            {meta.label()}
          </p>
          <h1 className="text-2xl font-semibold wrap-anywhere">{title}</h1>
        </header>
        {locked ? (
          <p className="text-muted-foreground">{m.code_locked()}</p>
        ) : (
          <Challenge courseId={courseId} activityId={activityId} />
        )}
      </article>
    </FocusPage>
  )
}
