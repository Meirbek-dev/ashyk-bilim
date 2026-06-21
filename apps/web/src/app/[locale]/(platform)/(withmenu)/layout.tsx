import { getSession } from '@/lib/auth/session'
import { SessionProvider } from '@/components/providers/session-provider'
import MainShell from './main-shell'

export default async function AppWithMenuLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()

  return (
    <SessionProvider initialSession={session}>
      <MainShell>{children}</MainShell>
    </SessionProvider>
  )
}
