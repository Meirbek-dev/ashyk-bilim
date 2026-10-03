import { useSuspenseQuery } from '@tanstack/react-query'

import { profileOptions } from '../queries'
import { AvatarSection } from './avatar-section'
import { ProfileBuilder } from './profile-builder'
import { ProfileDetails } from './profile-details'

/** /settings/profile: what others see about the user, each part saved on its own. */
export function ProfilePage() {
  const { data: profile } = useSuspenseQuery(profileOptions())
  return (
    <>
      <ProfileDetails profile={profile} />
      <AvatarSection profile={profile} />
      <ProfileBuilder />
    </>
  )
}
