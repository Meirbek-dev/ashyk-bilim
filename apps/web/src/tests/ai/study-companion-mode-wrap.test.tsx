/** @vitest-environment jsdom */
// UX-173: at 390 px the five study modes overflowed the landing (scrollWidth
// 466). The mode group wraps inside its container instead.
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { expect, it, vi } from 'vite-plus/test'

import { StudyCompanionPanel } from '@/features/student-study/components/study-companion-panel'
import ruMessages from '@/messages/ru-RU.json'

vi.mock('@/features/student-study/api/use-study-companion', () => ({ useQueueStudyCompanion: () => vi.fn() }))
vi.mock('@/features/ai-experience', () => ({
  useAIRunController: () => ({ pending: false, state: null, error: null, latestArtifact: null, start: vi.fn() }),
  AIRunProgress: () => null,
  AIStreamingText: () => null,
  AIErrorRecovery: () => null,
}))

it('wraps the study mode group instead of overflowing a phone', () => {
  render(
    <NextIntlClientProvider locale="ru" messages={ruMessages}>
      <StudyCompanionPanel courseUuid="c1" />
    </NextIntlClientProvider>,
  )
  const group = screen.getByRole('button', { name: ruMessages.AiExperience.studyCompanion.explain }).parentElement
  expect(group).toHaveClass('flex-wrap', 'max-w-full')
})
