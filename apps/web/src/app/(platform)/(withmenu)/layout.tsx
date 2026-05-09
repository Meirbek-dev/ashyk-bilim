import MainShell from './main-shell';
import '@styles/globals.css';

export default function PlatformWithMenuLayout({ children }: { children: React.ReactNode }) {
  return <MainShell>{children}</MainShell>;
}
