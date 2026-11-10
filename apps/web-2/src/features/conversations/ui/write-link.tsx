import { useQuery } from '@tanstack/react-query'
import { Link as RouterLink, useHydrated } from '@tanstack/react-router'
import { MessageSquare } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { sessionOptions } from '#/shared/auth/session'
import { buttonVariants } from '#/shared/components/button-variants'

import { peerOptions } from '../queries'

type WriteLinkProps = {
  /** The person to write to. */
  userId: string
  /** What the message is about: the course (and activity) the writer starts from. */
  course?: string | undefined
  activity?: string | undefined
  /** «Написать учащемуся» (a grading page) instead of «Написать». */
  learner?: boolean
  /** Their name, for the accessible name of a bare «Написать» in a list of people. */
  name?: string | undefined
  variant?: 'outline' | 'ghost'
  /**
   * Shown without asking: a row of the course's own learner list, where staff may always write (docs/DIALOGS.md 3)
   * and fifty rows would be fifty requests; a ban or a deleted account shows its reason on the next page.
   */
  unchecked?: boolean
}

/**
 * «Написать» (docs/DIALOGS.md 9): shown only once the server says the viewer may write to this person (their own
 * conversation or a first message). It reads after hydration: an SSR page carries no per-person request.
 */
export function WriteLink(props: WriteLinkProps) {
  const { userId, course, activity, learner = false, name, variant = 'outline', unchecked = false } = props
  const hydrated = useHydrated()
  const { data: session } = useQuery(sessionOptions())
  // Oneself is no one to write to (the server answers 404): a teacher on their own course page asks nothing.
  const self = session?.user_id === userId
  const { data } = useQuery({ ...peerOptions(userId), enabled: hydrated && !unchecked && !self })
  if (self || (!unchecked && !data?.allowed_actions.includes('send'))) return null
  return (
    <RouterLink
      to="/conversations/new"
      search={{ to: userId, course, activity }}
      aria-label={name && !learner ? m.conversations_write_to({ name }) : undefined}
      className={buttonVariants({ variant, size: 'sm' })}
    >
      <MessageSquare aria-hidden />
      {learner ? m.conversations_write_learner() : m.conversations_write()}
    </RouterLink>
  )
}
