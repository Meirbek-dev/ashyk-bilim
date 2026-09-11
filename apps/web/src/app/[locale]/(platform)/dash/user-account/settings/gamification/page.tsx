import UserGamificationSettings from '@components/Dashboard/Pages/UserAccount/UserGamificationSettings/UserGamificationSettings'
import { getServerGamificationDashboard } from '@/services/gamification/server'
import { Suspense } from 'react'

export default function UserAccountGamificationPage() {
  return (
    <Suspense fallback={<UserGamificationSettings initialProfile={null} loading />}>
      <GamificationSettingsContent />
    </Suspense>
  )
}

// Fresh from the server on every visit: the client store is a per-tab cache
// that nothing in `/dash` refreshes, so it can lag behind what was last saved.
async function GamificationSettingsContent() {
  const dashboard = await getServerGamificationDashboard().catch(() => null)
  return <UserGamificationSettings initialProfile={dashboard?.profile ?? null} />
}
