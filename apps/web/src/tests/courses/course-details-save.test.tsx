/** @vitest-environment jsdom */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'

import { APIError } from '@/lib/api/assertSuccess'
import { useSaveSection } from '@/hooks/useSaveSection'

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast }))
vi.mock('next-intl', () => ({
  useTranslations: () => Object.assign((key: string) => key, { has: () => true }),
}))
vi.mock('@components/Contexts/CourseContext', () => ({
  useCourse: () => ({ refreshCourseMeta: vi.fn(), refreshCourseEditor: vi.fn() }),
}))

// UX-242: the course details save ran through a 'use server' action, so a 422
// `learnings`/`duplicate` came back as a 500 with a generic message shown twice.
describe('course details save keeps problem+json (UX-242, BUG-035)', () => {
  // Client-called write services must stay plain functions (a server action
  // turns a 4xx problem+json into a 500 and drops the code / error class).
  it.each([
    'courses/course-writes.ts',
    'courses/certifications.ts',
    'courses/updates.ts',
    'usergroups/usergroups.ts',
    'assessments/assessment-actions.ts',
  ])('%s is not a server action', file => {
    const source = readFileSync(resolve(__dirname, '../../services', file), 'utf8')
    expect(source).not.toMatch(/^\s*['"]use server['"]/m)
  })

  it('binds field errors inline and shows one message, not toast + alert', async () => {
    const onError = vi.fn()
    const setError = vi.fn()
    const { result } = renderHook(() => useSaveSection({ section: 'general', onError, setError }))
    const error = new APIError({
      code: 'validation-failed',
      message: 'invalid',
      status: 422,
      fieldErrors: [{ field: 'learnings', code: 'duplicate', message: 'duplicate learning id' }],
    })

    await act(() =>
      result.current.saveWithoutRefresh(async () => {
        throw error
      }),
    )

    expect(setError).toHaveBeenCalledWith('learnings', { type: 'server', message: 'fields.duplicate' })
    expect(onError).toHaveBeenCalledTimes(1)
    expect(toast.error).not.toHaveBeenCalled()
  })
})
