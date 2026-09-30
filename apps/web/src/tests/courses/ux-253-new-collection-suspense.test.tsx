/** @vitest-environment jsdom */
// UX-253: /collections/new awaits the session check inside a <Suspense>
// boundary (Next 16: uncached data outside one blocks the route).
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'

vi.mock('@/lib/auth/permissions', () => ({ requirePermission: () => new Promise(() => {}) }))
vi.mock('@/app/_shared/withmenu/collections/new/NewCollection', () => ({ default: () => <div>form</div> }))
vi.mock('next-intl/server', () => ({ getTranslations: vi.fn() }))
vi.mock('@services/media/media', () => ({ getPlatformThumbnailImage: () => '' }))

import PlatformNewCollectionPage from '@/app/[locale]/(platform)/(withmenu)/collections/new/page'

describe('UX-253 /collections/new', () => {
  it('renders the Suspense fallback while the session check is pending', () => {
    const { container } = render(<PlatformNewCollectionPage />)
    expect(container.querySelector('.animate-pulse')).not.toBeNull()
  })
})
