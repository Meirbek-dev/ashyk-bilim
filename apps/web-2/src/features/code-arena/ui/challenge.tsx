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
  // a desktop IDE; narrow: one column, the statement first (B-COD-12).
  return (
    <div className="grid min-w-0 gap-12 @5xl:grid-cols-12 @5xl:gap-gutter">
      <div className="flex min-w-0 flex-col gap-12 @5xl:col-span-5">
        <Problem code={code} />
        <AttemptLog challenge={challenge} code={code} />
      </div>
      <div className="flex min-w-0 flex-col gap-12 @5xl:col-span-7">
        <AttemptArea courseId={courseId} challenge={challenge} code={code} />
      </div>
    </div>
  )
}
