import MainShell from './main-shell';

export default function PlatformWithMenuLayout({ children }: { children: React.ReactNode }) {
  return <MainShell>{children}</MainShell>;
}
