import { describe, expect, it, vi } from 'vite-plus/test'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/fonts', () => ({ jetBrainsMono: { variable: '' } }))
vi.mock('@/lib/auth/session', () => ({ getSession: async () => ({ userId: 'u1' }) }))
vi.mock('@services/courses/courses', () => ({ getCourseMetadata: async () => ({ name: 'gauntlet12-course' }) }))
vi.mock('@services/courses/activities', () => ({ getActivity: async () => ({ name: 'Урок 1 — лекция' }) }))
vi.mock('@/features/student-activity/api/runtime', () => ({ getStudentActivityRuntime: async () => ({}) }))
vi.mock('@/app/_shared/withmenu/course/[courseuuid]/activity/[activityid]/activity', () => ({ default: () => null }))
vi.mock('@/components/Errors/AccessDenied', () => ({ default: () => null }))
vi.mock('@/components/Errors/ResourceNotFound', () => ({ default: () => null }))
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
  getLocale: async () => 'ru',
  setRequestLocale: () => {},
}))

import { generateMetadata } from '@/app/[locale]/(platform)/(withmenu)/course/[courseuuid]/activity/[activityid]/page'

// UX-052: the activity <title> ended with the course name; every other page ends with the app name.
describe('activity page <title>', () => {
  it('carries the app-name suffix', async () => {
    const meta = await generateMetadata({ params: Promise.resolve({ courseuuid: 'c1', activityid: 'a1' }) })
    expect(meta.title).toBe('Урок 1 — лекция - gauntlet12-course - Ashyk Bilim')
  })
})
