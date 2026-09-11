import { describe, expect, it } from 'vitest'
import { createTranslator } from 'next-intl'
import type { AbstractIntlMessages } from 'next-intl'

import { labelActivityType } from '@/features/grading/gradebook/GradebookToolbar'
import ruMessages from '@/messages/ru-RU.json'

// BUG-031: the gradebook column subtitle showed raw "QUIZ" for a quiz assessment
// (`gradebookFromWire` keys activities as `TYPE_<KIND>`; the label map only knew
// `type_custom`), while the exam column said "Экзамен".
describe('gradebook activity kind labels (BUG-031)', () => {
  // Loosely typed: the wire kinds under test are data, not statically known keys.
  const t = createTranslator({
    locale: 'ru',
    messages: ruMessages as AbstractIntlMessages,
    namespace: 'Features.Grading.Gradebook',
  }) as unknown as (key: string) => string

  it('labels every assessment kind the gradebook wire can produce', () => {
    for (const kind of ['quiz', 'exam', 'code_challenge']) {
      const wireType = `TYPE_${kind.toUpperCase()}`
      const label = labelActivityType(t, wireType)
      expect(label, wireType).not.toBe(kind.toUpperCase().replaceAll('_', ' '))
      expect(label).toBe(labelActivityType(t, kind))
    }
    expect(labelActivityType(t, 'TYPE_QUIZ')).toBe(t('activityTypes.quiz'))
    expect(labelActivityType(t, 'TYPE_CUSTOM')).toBe(t('activityTypes.quiz'))
    expect(labelActivityType(t, 'TYPE_EXAM')).toBe('Экзамен')
  })
})
