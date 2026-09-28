// UX-267: /unauthorized metadata comes from the static catalogs (cached), not
// from `getTranslations` — Next 16 flagged that as URL data in generateMetadata().
import { describe, expect, it, vi } from 'vite-plus/test'

import ruMessages from '@/messages/ru-RU.json'
import kkMessages from '@/messages/kk-KZ.json'

vi.mock('next-intl/server', () => ({
  getTranslations: () => {
    throw new Error('generateMetadata must not read request-bound translations (UX-267)')
  },
}))

import { generateMetadata } from '@/app/[locale]/(platform)/unauthorized/page'

describe('/unauthorized <title>', () => {
  it('is the localized title without touching next-intl/server', async () => {
    const ru = await generateMetadata({ params: Promise.resolve({ locale: 'ru-RU' }) })
    expect(ru.title).toBe(`${ruMessages.UnauthorizedPage.title} - Ashyk Bilim`)
    const kk = await generateMetadata({ params: Promise.resolve({ locale: 'kk-KZ' }) })
    expect(kk.title).toBe(`${kkMessages.UnauthorizedPage.title} - Ashyk Bilim`)
  })
})
