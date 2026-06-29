import MainShell from './main-shell'

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false

export default function AppWithMenuLayout({ children }: { children: React.ReactNode }) {
  return <MainShell>{children}</MainShell>
}
