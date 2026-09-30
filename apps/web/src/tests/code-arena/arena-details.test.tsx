/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vite-plus/test'

import { codeItemToSettings } from '@/features/assessments/registry/code-challenge/CodeChallengeAttemptContent'
import { CodeArenaHeader } from '@/features/code-arena/attempt/CodeArenaHeader'
import { ResultsDock } from '@/features/code-arena/attempt/ResultsDock'
import type { AssessmentItem } from '@/features/assessments/domain/items'
import ruMessages from '@/messages/ru-RU.json'

// jsdom has no Web Animations API; Base UI polls it.
Element.prototype.getAnimations ??= () => []

const ru = (ui: React.ReactNode) =>
  render(
    <NextIntlClientProvider locale="ru" messages={ruMessages} timeZone="UTC">
      {ui}
    </NextIntlClientProvider>,
  )

describe('code arena details', () => {
  // UX-306: the item's metadata difficulty reaches the learner's settings.
  it('maps the item difficulty', () => {
    const item = {
      id: 'i',
      item_uuid: 'i',
      order: 0,
      kind: 'CODE',
      title: 'T',
      max_score: 1,
      metadata: { difficulty: 'hard', tags: [], outcome_ids: [] },
      body: { kind: 'CODE', prompt: 'p', languages: [71], starter_code: {}, tests: [] },
    } as AssessmentItem
    expect(codeItemToSettings(item)?.difficulty).toBe('HARD')
  })

  // UX-307: memory uses the locale's unit and decimal separator.
  it('formats case memory like the limits', () => {
    ru(
      <ResultsDock
        activeTab="result"
        onTabChange={vi.fn()}
        customInput=""
        onCustomInputChange={vi.fn()}
        consoleOutput=""
        results={[
          { test_case_id: 'a', status: 3, status_description: 'ok', passed: true, memory_kb: 8000, time_ms: 12 },
        ]}
        verdict="ACCEPTED"
      />,
    )
    expect(screen.getByText('7,8МБ')).toBeInTheDocument()
  })

  // UX-309: no dead (disabled, unnamed) chevrons in the header.
  it('header buttons all have names', () => {
    ru(
      <CodeArenaHeader
        problem={{ activityUuid: 'a', title: 'T', prompt: '', inputSpec: '', outputSpec: '', constraints: [] }}
        verdict={null}
        isRunning={false}
        onRunCustom={vi.fn()}
        onRunTests={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )
    for (const button of screen.getAllByRole('button')) {
      expect(button.textContent?.trim() || button.getAttribute('aria-label')).toBeTruthy()
    }
  })
})
