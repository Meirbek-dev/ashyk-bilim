import { useSuspenseQuery } from '@tanstack/react-query'

import { profileOptions } from '../queries'
import { AccessTokensListSection } from './access-tokens-list'
import { AccessTokensCreateSection } from './access-tokens-section'
import { DeleteAccountSection } from './delete-account-section'
import { EmailSection } from './email-section'
import { PasswordSection } from './password-section'
import { SessionsSection } from './sessions-section'
import { TotpSection } from './totp-section'

/** /settings/security: email, password, two-factor authentication, live sessions, access tokens of AI agents (MCP) and account deletion. */
export function SecurityPage() {
  const { data: profile } = useSuspenseQuery(profileOptions())
  return (
    <>
      <EmailSection profile={profile} />
      <PasswordSection hasPassword={profile.has_password} />
      <TotpSection profile={profile} />
      <SessionsSection />
      <AccessTokensCreateSection />
      <AccessTokensListSection />
      <DeleteAccountSection profile={profile} />
    </>
  )
}
