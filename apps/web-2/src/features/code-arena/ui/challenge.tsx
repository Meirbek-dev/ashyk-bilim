import { useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'

import { codeItemOf } from '../model/arena'
import { challengeOptions } from '../queries'
import { AttemptArea } from './attempt-area'
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
  return (
    <>
      <Problem code={code} />
      <AttemptArea courseId={courseId} challenge={challenge} code={code} />
    </>
  )
}
