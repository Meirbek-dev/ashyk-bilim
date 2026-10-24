import { useState } from 'react'

import type { UserProfile } from '#/shared/api/gen/types.gen'

import { EmailConfirmStep } from './email-confirm-step'
import { EmailRequestStep } from './email-request-step'

/**
 * The account's address (B-SET-22): the new one and the password send a code there; the code switches the account.
 * Nothing changes before the code, so «Указать другой адрес» simply starts over.
 */
export function EmailSection({ profile }: { profile: UserProfile }) {
  const [sentTo, setSentTo] = useState<string | null>(null)
  return sentTo ? (
    <EmailConfirmStep email={sentTo} onRestart={() => setSentTo(null)} />
  ) : (
    <EmailRequestStep profile={profile} onSent={setSentTo} />
  )
}
