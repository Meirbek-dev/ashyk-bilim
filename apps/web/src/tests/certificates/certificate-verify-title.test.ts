import { describe, expect, it, vi } from 'vite-plus/test'

const names = vi.hoisted(() => ({ certification: 'Blender', course: 'Blender' }))

vi.mock('server-only', () => ({}))
vi.mock('@components/Pages/Certificate/CertificateVerificationPage', () => ({ default: () => null }))
vi.mock('@services/courses/certifications', () => ({
  getCertificateByCode: async () => ({
    data: { certification: { config: { certification_name: names.certification } }, course: { name: names.course } },
  }),
}))
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string, values: Record<string, string>) =>
    `${key}:${Object.values(values ?? {}).join('|')}`,
}))

import { generateMetadata } from '@/app/[locale]/(platform)/(withmenu)/certificates/[uuid]/verify/page'

// UX-225: «Проверка сертификата - Blender (Blender)» when the certification is named like its course.
describe('certificate verify <title>', () => {
  it('names a same-named certification once', async () => {
    const meta = await generateMetadata({ params: Promise.resolve({ uuid: 'X' }) })
    expect(meta.title).toBe('titleSingle:Blender')
  })

  it('keeps both names when they differ', async () => {
    names.certification = 'Modeller'
    const meta = await generateMetadata({ params: Promise.resolve({ uuid: 'X' }) })
    expect(meta.title).toBe('title:Modeller|Blender')
  })
})
