'use client';

import NextTopLoader from 'nextjs-toploader';
import { Toaster } from '@/components/ui/sonner';
import { SessionProvider } from '@/components/providers/session-provider';
import { ThemeProvider, useTheme } from '@/components/providers/theme-provider';
import { ReactQueryProvider } from '@/lib/react-query/providers';
import type { Session } from '@/lib/auth/types';
import type { ThemeMode } from '@/lib/themes';
import type { ReactNode } from 'react';

interface RootProvidersProps {
  children: ReactNode;
  initialSession?: Session | null;
  initialThemeMode?: ThemeMode;
}

function ThemedRootChrome({ children }: { children: ReactNode }) {
  const { theme: currentTheme } = useTheme();

  const topLoaderProps = {
    color: currentTheme.colors.primary,
    initialPosition: 0.1,
    crawlSpeed: 300,
    height: 3,
    easing: 'ease' as const,
    speed: 1000,
    showSpinner: false,
    shadow: `0 0 10px ${currentTheme.colors.primary}, 0 0 5px ${currentTheme.colors.primary}`,
    crawl: true,
  };

  return (
    <>
      <NextTopLoader {...topLoaderProps} />
      {children}
      <Toaster />
    </>
  );
}

export default function RootProviders({ children, initialSession, initialThemeMode }: RootProvidersProps) {
  return (
    <ReactQueryProvider>
      <SessionProvider initialSession={initialSession}>
        <ThemeProvider
          defaultThemeName={initialSession?.user.theme ?? 'modern-minimal'}
          initialMode={initialThemeMode}
        >
          <ThemedRootChrome>{children}</ThemedRootChrome>
        </ThemeProvider>
      </SessionProvider>
    </ReactQueryProvider>
  );
}
