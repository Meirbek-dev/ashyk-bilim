import { describe, expect, it, vi } from 'vite-plus/test'

vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => ({ searchResults: 'Результаты поиска', courses: 'Курсы' })[key] ?? key,
}))
vi.mock('@services/media/media', () => ({ getPlatformThumbnailImage: () => '/thumb.png' }))

import { generateMetadata } from '@/app/[locale]/(platform)/(withmenu)/search/page'

// BUG-033c: the title carried the query in quotes, which a11y tooling flattens to
// "Результаты поиска  Python  -"; it must be single-spaced with no quotes.
describe('search page <title>', () => {
  it('has no quotes or double spaces around the query', async () => {
    const meta = await generateMetadata({
      params: Promise.resolve({ locale: 'ru-RU' }),
      searchParams: Promise.resolve({ q: 'Python' }),
    })
    expect(meta.title).toBe('Результаты поиска: Python - Ashyk Bilim')
    expect(String(meta.title)).not.toMatch(/\s{2}|"/)

    const typed = await generateMetadata({
      params: Promise.resolve({ locale: 'ru-RU' }),
      searchParams: Promise.resolve({ q: 'Python', type: 'courses' }),
    })
    expect(typed.title).toBe('Курсы: Python - Ashyk Bilim')
  })
})
