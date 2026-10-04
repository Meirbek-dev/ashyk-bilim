import { useSuspenseQuery } from '@tanstack/react-query'

import { profileOptions } from '../queries'
import { PasswordSection } from './password-section'
import { SessionsSection } from './sessions-section'
import { TotpSection } from './totp-section'

/** /settings/security: password, two-factor authentication and live sessions. */
export function SecurityPage() {
  const { data: profile } = useSuspenseQuery(profileOptions())
  return (
    <>
      <PasswordSection hasPassword={profile.has_password} />
      <TotpSection profile={profile} />
      <SessionsSection />
    </>
  )
}
