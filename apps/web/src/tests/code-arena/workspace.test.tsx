/** @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { CodeArenaWorkspace } from '@/features/code-arena/attempt/CodeArenaWorkspace'
import { ReferenceSolutionRunner } from '@/features/code-arena/authoring/ReferenceSolutionRunner'
import ruMessages from '@/messages/ru-RU.json'

const mocks = vi.hoisted(() => ({
  mobile: false,
  toastSuccess: vi.fn(),
  referenceCheck: vi.fn(),
}))

vi.mock('sonner', () => ({ toast: { success: mocks.toastSuccess, error: vi.fn() } }))
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => mocks.mobile }))
vi.mock('@/components/features/courses/code-challenges/CodeEditor', () => ({ CodeEditor: () => null }))
vi.mock('@/lib/api/generated/code/code', () => ({ referenceCheck: mocks.referenceCheck }))
vi.mock('@/features/assessments/hooks/code-challenge', () => {
  const idle = { isPending: false, mutateAsync: vi.fn() }
  return {
    useJudge0Languages: () => ({ data: [{ id: 71, name: 'Python', monaco_language: 'python' }], isError: false }),
    useCodeChallengeSubmissions: () => ({ data: [], isError: false }),
    useRunCustomTest: () => idle,
    useRunCodeChallengeTests: () => idle,
  }
})

// jsdom has no Web Animations API; Base UI's ScrollArea polls it.
Element.prototype.getAnimations ??= () => []
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as never

const settings = { uuid: 'asm', grading_strategy: 'PARTIAL_CREDIT', allowed_languages: [71] } as const

function renderWorkspace(onSubmit: () => Promise<{ status: string }>) {
  return render(
    <NextIntlClientProvider locale="ru" messages={ruMessages} timeZone="UTC">
      <CodeArenaWorkspace
        problem={{ activityUuid: 'act', title: 'T', prompt: 'p', inputSpec: '', outputSpec: '', constraints: [] }}
        settings={{ ...settings, allowed_languages: [71] }}
        answer={{ kind: 'CODE', language: 71, source: 'print(1)' }}
        initialLanguageId={71}
        initialCode="print(1)"
        onAnswerChange={vi.fn()}
        onSubmit={onSubmit}
      />
    </NextIntlClientProvider>,
  )
}

describe('code arena workspace', () => {
  beforeEach(() => {
    mocks.mobile = false
    mocks.toastSuccess.mockClear()
    mocks.referenceCheck.mockReset()
  })

  it('says «queued» only for an attempt that is actually waiting (UX-288)', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ status: 'GRADED' })
    renderWorkspace(onSubmit)
    fireEvent.click(screen.getByRole('button', { name: 'Отправить' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(mocks.toastSuccess).not.toHaveBeenCalled()

    onSubmit.mockResolvedValue({ status: 'PENDING' })
    fireEvent.click(screen.getByRole('button', { name: 'Отправить' }))
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith('Решение добавлено в очередь на проверку'))
  })

  it('stacks the problem above the editor on a phone (UX-290)', () => {
    mocks.mobile = true
    const { container } = renderWorkspace(vi.fn())
    expect(container.querySelector<HTMLElement>('#code-arena-main-layout')?.style.flexDirection).toBe('column')
  })
})

describe('reference solution check', () => {
  const draft = { ...settings, allowed_languages: [71] }
  const languages = [{ id: 71, name: 'Python', monaco_language: 'python' }]

  function renderRunner(onBeforeValidate: () => Promise<boolean>) {
    render(
      <NextIntlClientProvider locale="ru" messages={ruMessages} timeZone="UTC">
        <ReferenceSolutionRunner draft={draft} languages={languages} onBeforeValidate={onBeforeValidate} />
      </NextIntlClientProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Проверить решения' }))
  }

  it('saves the draft before the server checks the stored solutions (UX-281)', async () => {
    const order: string[] = []
    mocks.referenceCheck.mockImplementation(async () => {
      order.push('check')
      return { results: [] }
    })
    renderRunner(async () => {
      order.push('save')
      return true
    })
    await waitFor(() => expect(order).toEqual(['save', 'check']))
  })

  it('does not check when the save failed', async () => {
    const onBeforeValidate = vi.fn().mockResolvedValue(false)
    renderRunner(onBeforeValidate)
    await waitFor(() => expect(onBeforeValidate).toHaveBeenCalled())
    expect(mocks.referenceCheck).not.toHaveBeenCalled()
  })
})
