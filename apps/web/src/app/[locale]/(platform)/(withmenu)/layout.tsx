import MainShell from './main-shell';

export default function AppWithMenuLayout({ children }: { children: React.ReactNode }) {
  return <MainShell>{children}</MainShell>;
}
