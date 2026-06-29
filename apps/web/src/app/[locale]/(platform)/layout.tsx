import { getSession } from '@/lib/auth/session'
import { SessionProvider } from '@/components/providers/session-provider'
import type { ReactNode } from 'react'

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getSession()

  return <SessionProvider initialSession={session}>{children}</SessionProvider>
}
