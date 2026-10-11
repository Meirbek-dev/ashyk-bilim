import { useSuspenseQuery } from '@tanstack/react-query'
import { useState } from 'react'
import * as v from 'valibot'

import { sessionOptions } from '#/shared/auth/session'
import { storageItem } from '#/shared/lib/storage'

import { EmailBannerForm } from './email-banner-form'

/** Hidden for the rest of the browser session by the user it was hidden for. */
const dismissed = storageItem('ab.email-banner-hidden', v.string(), 'session')

/**
 * «Подтвердите email» above the content while the account's address is unconfirmed (`email_verified`, B-AUTH-15):
 * the emailed code confirms it in place, «Отправить код ещё раз» mails a new one, «Скрыть» hides it until the next
 * browser session. Sign-in never depends on it.
 */
export function EmailBanner() {
  const { data: session } = useSuspenseQuery(sessionOptions())
  const [hidden, setHidden] = useState(() => dismissed.get())
  if (!session || session.user.email_verified || hidden === session.user.id) return null
  const hide = () => {
    dismissed.set(session.user.id)
    setHidden(session.user.id)
  }
  return <EmailBannerForm email={session.user.email} onHide={hide} />
}
