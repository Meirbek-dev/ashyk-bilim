import { m } from '#/paraglide/messages'
import { presentError } from '#/shared/i18n/errors'

import { attemptGone, gateCode } from '../model/attempt'

/** Why saving or the hand-in shut, in the learner's words: the archive, a named gate, the test gone, else time. */
export const closedText = (closed: unknown) =>
  gateCode(closed) === 'course-archived'
    ? m.attempt_closed_archived()
    : gateCode(closed)
      ? presentError(closed)
      : attemptGone(closed)
        ? m.attempt_closed_gone()
        : m.attempt_closed()
