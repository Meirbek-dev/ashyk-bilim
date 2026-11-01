import { useSuspenseQuery } from '@tanstack/react-query'
import { useEffect } from 'react'

import { dashboardOptions } from '#/shared/api/gen/@tanstack/react-query.gen'
import { gamificationOn } from '#/shared/auth/access'

/** Reports the profile's gamification switch to the nav (B-ACH-13); renders nothing. */
export function NavByProfile({ onGamification }: { onGamification: (on: boolean) => void }) {
  const { data: gamification } = useSuspenseQuery({ ...dashboardOptions(), select: gamificationOn })
  useEffect(() => onGamification(gamification), [gamification, onGamification])
  return null
}
