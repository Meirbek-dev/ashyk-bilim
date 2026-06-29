'use client'

import { useTranslations } from 'next-intl'
import { Home, LogOut, ShieldAlert } from 'lucide-react'
import { logout } from '@services/auth/auth'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { Button } from '@components/ui/button'

interface AccessDeniedProps {
  courseuuid?: string
  session?: unknown
}

export default function AccessDenied({ session }: AccessDeniedProps) {
  const tErrors = useTranslations('Errors')
  const tGeneral = useTranslations('General')
  const tHeader = useTranslations('Header')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const handleLogout = () => {
    startTransition(async () => {
      await logout()
      router.push('/login')
    })
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
      <div className="bg-card w-full max-w-md rounded-md border p-8">
        <ShieldAlert className="text-destructive mx-auto mb-5 h-8 w-8" strokeWidth={1.5} />

        <h1 className="mb-2 text-lg font-semibold tracking-tight">{tErrors('accessDenied')}</h1>

        <p className="text-muted-foreground mb-7 text-sm">{tErrors('accessDeniedMessage')}</p>

        <div className="flex flex-col gap-2.5 sm:flex-row sm:justify-center">
          <Button
            variant="outline"
            className="flex items-center gap-2"
            onClick={() => router.push(session ? '/dash' : '/')}
          >
            <Home className="h-4 w-4" />
            {session ? tHeader('profile.dashboard') : tGeneral('home')}
          </Button>

          {!!session && (
            <Button
              variant="destructive"
              className="flex items-center gap-2"
              onClick={handleLogout}
              disabled={isPending}
            >
              <LogOut className="h-4 w-4" />
              {tHeader('profile.signOut')}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
