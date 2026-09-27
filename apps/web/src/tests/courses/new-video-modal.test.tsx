/** @vitest-environment jsdom */
// UX-238: a blank (or whitespace) name used to disable «Create» silently; the
// video dialog now marks it inline like the other create dialogs.
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'

const mocks = vi.hoisted(() => ({ submitExternalVideo: vi.fn() }))

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import VideoModal from '@/components/Objects/Modals/Activities/Create/NewActivityModal/VideoActivityModal'

describe('VideoModal validation', () => {
  it('marks a whitespace-only name inline instead of disabling submit', async () => {
    render(
      <VideoModal
        chapterId="chapter-1"
        closeModal={vi.fn()}
        course={{ course_uuid: 'c1' }}
        submitExternalVideo={mocks.submitExternalVideo}
      />,
    )
    fireEvent.change(screen.getByPlaceholderText('activityNamePlaceholder'), { target: { value: '   ' } })
    const create = screen.getByRole('button', { name: 'createActivity' })
    expect(create).toBeEnabled()
    fireEvent.click(create)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('errorActivityNameRequired'))
    expect(screen.getByPlaceholderText('activityNamePlaceholder')).toHaveAttribute('aria-invalid', 'true')
    expect(mocks.submitExternalVideo).not.toHaveBeenCalled()
  })
})
