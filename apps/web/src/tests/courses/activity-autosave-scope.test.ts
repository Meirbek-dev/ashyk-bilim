import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { useActivityAutosave } from '@/hooks/useActivityAutosave'
import { APIError } from '@/lib/api/assertSuccess'
import { useCourseEditorStore } from '@/stores/courses/courseEditorStore'

const updateActivity = vi.fn()
vi.mock('@/hooks/mutations/useActivityMutations', () => ({
  useActivityMutations: () => ({ updateActivity }),
}))

// BUG-282: a 412 in one lesson stopped autosave in the next lesson opened
// in-app (the save status was course-wide) — its typing was lost.
describe('useActivityAutosave scope', () => {
  beforeEach(() => {
    updateActivity.mockReset()
    useCourseEditorStore.getState().openEditor('other-course', null)
    useCourseEditorStore.getState().openEditor('course-1', null)
  })

  it('a conflict in one activity never stops another', async () => {
    const { result, rerender } = renderHook(
      ({ id }) => useActivityAutosave({ activityUuid: id, courseUuid: 'course-1' }),
      {
        initialProps: { id: 'act-a' },
      },
    )
    updateActivity.mockResolvedValueOnce({ version: 5 })
    await act(() => result.current.flush({ version: 4 }))
    updateActivity.mockRejectedValueOnce(new APIError({ status: 412, code: 'precondition-failed', message: 'stale' }))
    await act(() => result.current.flush({ version: 4 }).catch(() => undefined))
    expect(result.current.saveStatus).toBe('conflict')

    rerender({ id: 'act-b' })
    expect(result.current.saveStatus).toBe('idle')
    act(() => result.current.onChange({ version: 2 }))
    expect(result.current.saveStatus).toBe('saving')
    updateActivity.mockResolvedValueOnce({ version: 3 })
    await act(() => result.current.flush({ version: 2 }))
    expect(updateActivity).toHaveBeenLastCalledWith('act-b', { version: 2 })
    expect(result.current.saveStatus).toBe('saved')
  })
})
