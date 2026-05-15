import { PlatformContextProvider } from '@/components/Contexts/PlatformContext';
import { getPlatform } from '@/services/platform/platform';
import { Suspense } from 'react';
import type { ReactNode } from 'react';
import '@styles/globals.css';

async function PlatformLayoutContent({ children }: { children: ReactNode }) {
  const initialPlatform = await getPlatform();

  return <PlatformContextProvider initialPlatform={initialPlatform}>{children}</PlatformContextProvider>;
}

export default function PlatformLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<PlatformContextProvider>{/* Don't render children in fallback to avoid duplicate IDs */}</PlatformContextProvider>}>
      <PlatformLayoutContent>{children}</PlatformLayoutContent>
    </Suspense>
  );
}
