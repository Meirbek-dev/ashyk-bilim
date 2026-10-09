/** @vitest-environment jsdom */
// UX-238: a blank (or whitespace) name used to disable «Create» silently; the
// video dialog now marks it inline like the other create dialogs.
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'

const mocks = vi.hoisted(() => ({ submitExternalVideo: vi.fn() }))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useFormatter: () => ({ number: (n: number) => String(n) }),
}))
vi.mock('@services/media/video-probe', () => ({ probeVideoFile: async () => 'ok' }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))

import { toast } from 'sonner'
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

  // BUG-B1/B3: an iPhone .mov is a valid pick; a rejected pick (AVI) leaves the input empty,
  // so «Create» cannot upload it from the form anyway.
  it('takes a .mov and clears a rejected .avi from the input', async () => {
    const { container } = render(
      <VideoModal chapterId="chapter-1" closeModal={vi.fn()} course={{ course_uuid: 'c1' }} />,
    )
    const input = container.querySelector<HTMLInputElement>('input[name="videoFile"]')!
    const pick = (picked: File) => {
      Object.defineProperty(input, 'files', { value: [picked], configurable: true })
      fireEvent.change(input)
    }
    pick(new File(['x'], 'IMG_0001.MOV', { type: 'video/quicktime' }))
    await waitFor(() => expect(screen.getByText('IMG_0001.MOV')).toBeInTheDocument())
    expect(toast.error).not.toHaveBeenCalled()

    const cleared = vi.spyOn(input, 'value', 'set')
    pick(new File(['x'], 'old.avi', { type: 'video/avi' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('errorInvalidVideoFileType'))
    expect(cleared).toHaveBeenCalledWith('')
    expect(screen.getByText('IMG_0001.MOV')).toBeInTheDocument()
  })
})
