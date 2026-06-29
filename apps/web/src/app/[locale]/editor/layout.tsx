import { getSession } from '@/lib/auth/session'
import { SessionProvider } from '@/components/providers/session-provider'
import type { ReactNode } from 'react'

import { Suspense } from 'react'

async function SessionWrapper({ children }: { children: ReactNode }) {
  const session = await getSession()
  return <SessionProvider initialSession={session}>{children}</SessionProvider>
}

export default async function EditorLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <SessionWrapper>{children}</SessionWrapper>
    </Suspense>
  )
}
