import { PlatformContextProvider } from '@/components/Contexts/PlatformContext';
import { getPlatform } from '@/services/platform/platform';

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const initialPlatform = await getPlatform();

  return <PlatformContextProvider initialPlatform={initialPlatform}>{children}</PlatformContextProvider>;
}
