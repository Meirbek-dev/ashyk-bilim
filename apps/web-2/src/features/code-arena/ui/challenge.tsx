import { useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'

import { codeItemOf } from '../model/arena'
import { challengeOptions } from '../queries'
import { AttemptArea } from './attempt-area'
import { AttemptLog } from './attempt-log'
import { Problem } from './problem'

/** The statement and the work on it; not set up (no code item, no language, unpublished): one sentence (B-COD-02). */
export function Challenge({ courseId, activityId }: { courseId: string; activityId: string }) {
  const { data: challenge } = useSuspenseQuery(challengeOptions(activityId))
  const code = codeItemOf(challenge)
  if (!challenge || !code)
    return (
      <section className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">{m.code_not_configured_title()}</h2>
        <p className="text-muted-foreground">{m.code_not_configured_text()}</p>
      </section>
    )
  // Wide: the statement and the log on the left, the workspace on the right and in sight while the left scrolls, like
  // a desktop IDE; narrow: one column, the statement first (B-COD-12), then the workspace, and the log of runs and
  // attempts last: on a phone the editor is not two long lists away from the task it answers.
  return (
    <div className="grid min-w-0 gap-10 border-t pt-gutter @5xl:grid-cols-12 @5xl:grid-rows-[auto_1fr] @5xl:gap-x-gutter">
      <div className="min-w-0 @5xl:col-span-5">
        <Problem code={code} />
      </div>
      <div className="flex min-w-0 flex-col gap-10 @5xl:col-span-7 @5xl:col-start-6 @5xl:row-span-2 @5xl:row-start-1">
        <AttemptArea courseId={courseId} challenge={challenge} code={code} />
      </div>
      <div className="flex min-w-0 flex-col gap-10 @5xl:col-span-5 @5xl:col-start-1">
        <AttemptLog challenge={challenge} code={code} />
      </div>
    </div>
  )
}
