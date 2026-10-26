import { useState } from 'react'

import type { UserProfile } from '#/shared/api/gen/types.gen'
import { storageItem } from '#/shared/lib/storage'

import { EMAIL_CODE_TTL_MS, pendingEmailFor, vPendingEmail } from '../model/settings'
import { EmailConfirmStep } from './email-confirm-step'
import { EmailRequestStep } from './email-request-step'

/** The sent change, kept while its code works: a reload or a visit to the mailbox does not lose the code step. */
const pending = storageItem('ab.email-change', vPendingEmail)

/**
 * The account's address (B-SET-22): the new one and the password send a code there; the code switches the account.
 * Nothing changes before the code, so «Указать другой адрес» simply starts over (B-SET-24: the step survives a reload).
 */
export function EmailSection({ profile }: { profile: UserProfile }) {
  const [sentTo, setSentTo] = useState<string | null>(() => pendingEmailFor(pending.get(), profile.id, Date.now()))
  const sent = (email: string) => {
    pending.set({ user: profile.id, email, until: Date.now() + EMAIL_CODE_TTL_MS })
    setSentTo(email)
  }
  const restart = () => {
    pending.remove()
    setSentTo(null)
  }
  return sentTo ? (
    <EmailConfirmStep email={sentTo} onRestart={restart} />
  ) : (
    <EmailRequestStep profile={profile} onSent={sent} />
  )
}
