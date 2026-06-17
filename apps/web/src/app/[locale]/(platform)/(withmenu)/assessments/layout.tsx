import { SessionProvider } from '@/components/providers/session-provider'
import { requireSession } from '@/lib/auth/session'
import type { ReactNode } from 'react'

export default async function AssessmentsLayout({ children }: { children: ReactNode }) {
  const session = await requireSession()

  return <SessionProvider initialSession={session}>{children}</SessionProvider>
}
