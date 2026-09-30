import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('next/navigation', () => ({ usePathname: () => '/ru/dash/user-account/settings/security' }))
vi.mock('@components/ui/AppLink', () => ({
  default: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <a className={className}>{children}</a>
  ),
}))

import SettingsTabs from '@components/Dashboard/Misc/SettingsTabs'

// UX-177: at 390 px the tab row widened the whole page; it must scroll inside
// its own box, with tabs that keep their width instead of squeezing.
describe('SettingsTabs on a narrow screen', () => {
  it('scrolls the tab list horizontally inside its container', () => {
    const { container } = render(
      <SettingsTabs
        tabs={[
          { id: 'general', labelKey: 'general' },
          { id: 'security', labelKey: 'security' },
        ]}
        getHref={tab => `/dash/user-account/settings/${tab.id}`}
        translationNamespace="DashPage.UserAccountSettings"
      />,
    )
    const list = container.querySelector('[data-slot=tabs-list]')
    expect(list?.className).toContain('overflow-x-auto')
    expect(list?.className).toContain('max-w-full')
    for (const link of container.querySelectorAll('a')) expect(link.className).toContain('shrink-0')
  })
})
