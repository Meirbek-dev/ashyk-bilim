import { getSession } from '@/lib/auth/session'
import { SessionProvider } from '@/components/providers/session-provider'
import type { ReactNode } from 'react'

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getSession()

  return <SessionProvider initialSession={session}>{children}</SessionProvider>
}
