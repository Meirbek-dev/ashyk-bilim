import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it } from 'vitest'

import { EditorStatusBar } from '@/features/content-markdown/editor/EditorStatusBar'
import { getMarkdownPreset } from '@/features/content-markdown/presets/presets'
import { canPublishGrade, canSaveGradeDraft, canTeacherEditGrade, isScoreInputInvalid } from '@/features/grading/domain'
import ruMessages from '@/messages/ru-RU.json'

// BUG-030: the grader's feedback editors showed "3 слов" (no plural agreement),
// "12/8,000" (en thousands separator) and "Пояснение editor"; a PUBLISHED attempt
// silently ignored typing; 150 in a "/ 100" field was accepted.
function renderStatusBar(wordCount: number, charCount: number) {
  render(
    <NextIntlClientProvider locale="ru" messages={ruMessages}>
      <EditorStatusBar
        config={getMarkdownPreset('explanation')}
        charCount={charCount}
        wordCount={wordCount}
        isEmpty={false}
        saveState="idle"
        issues={[]}
      />
    </NextIntlClientProvider>,
  )
}

describe('review workspace formatting (BUG-030)', () => {
  it('agrees the word count with its Russian plural form', () => {
    renderStatusBar(3, 12)
    expect(screen.getByText('3 слова')).toBeInTheDocument()
  })

  it('formats the character budget with the locale separator, not en-US', () => {
    renderStatusBar(3, 12)
    // ru groups thousands with a narrow no-break space (Intl), never a comma.
    const budget = screen.getByText(/12\s*\/\s*8/)
    expect(budget.textContent).not.toContain('8,000')
    expect(budget.textContent?.replaceAll(/[\s  ]/g, '')).toBe('12/8000')
  })

  it('flags a score outside the field range instead of accepting it', () => {
    expect(isScoreInputInvalid('150')).toBe(true)
    expect(isScoreInputInvalid('-1')).toBe(true)
    expect(isScoreInputInvalid('abc')).toBe(true)
    expect(isScoreInputInvalid('7', 5)).toBe(true)
    expect(isScoreInputInvalid('100')).toBe(false)
    expect(isScoreInputInvalid('')).toBe(false)
  })

  it('keeps a PUBLISHED attempt editable for a re-publish only (server transition table)', () => {
    expect(canTeacherEditGrade('PUBLISHED')).toBe(true)
    expect(canPublishGrade('PUBLISHED')).toBe(true)
    expect(canSaveGradeDraft('PUBLISHED')).toBe(false)
  })
})
