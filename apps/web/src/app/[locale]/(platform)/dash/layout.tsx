import type { Metadata } from 'next'

import DashShell from './dash-shell'

export const metadata: Metadata = {
  title: 'Панель управления Ashyk Bilim',
}

export default function PlatformDashLayout({ children }: { children: React.ReactNode }) {
  return <DashShell>{children}</DashShell>
}
