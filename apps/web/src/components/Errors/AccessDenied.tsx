'use client';

import { useTranslations } from 'next-intl';
import { ShieldAlert, LogOut, Home } from 'lucide-react';
import { logout } from '@services/auth/auth';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Button } from '@components/ui/button';

interface AccessDeniedProps {
  courseuuid?: string;
  session?: any;
}

export default function AccessDenied({ courseuuid, session }: AccessDeniedProps) {
  const tErrors = useTranslations('Errors');
  const tGeneral = useTranslations('General');
  const tHeader = useTranslations('Header');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleLogout = () => {
    startTransition(async () => {
      await logout();
      router.push('/login');
    });
  };

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
      <div className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-8 shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-500">
          <ShieldAlert className="h-8 w-8" />
        </div>

        <h1 className="mb-3 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          {tErrors('accessDenied')}
        </h1>

        <p className="mb-8 text-sm text-zinc-500 dark:text-zinc-400">{tErrors('accessDeniedMessage')}</p>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button
            variant="outline"
            className="flex items-center gap-2 rounded-xl"
            onClick={() => router.push(session ? '/dash' : '/')}
          >
            <Home className="h-4 w-4" />
            {session ? tHeader('profile.dashboard') : tGeneral('home')}
          </Button>

          {session && (
            <Button
              variant="destructive"
              className="flex items-center gap-2 rounded-xl"
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
  );
}
