import { createTranslator } from 'next-intl'
import { describe, expect, it } from 'vitest'

import ruMessages from '@/messages/ru-RU.json'

// «Структура Вопрос» / «Метаданные Вопрос»: the noun needs the genitive in ru.
describe('ru exam editor item noun agreement', () => {
  const t = createTranslator({
    locale: 'ru',
    messages: ruMessages,
    namespace: 'Features.Assessments.Studio.NativeItemStudio',
  })

  it('declines «Вопрос» and keeps a readable fallback for other nouns', () => {
    expect(t('outlineTitle', { itemNoun: 'Вопрос' })).toBe('Структура вопросов')
    expect(t('itemMetadataTitle', { itemNoun: 'Вопрос' })).toBe('Метаданные вопроса')
    expect(t('itemContentTitle', { itemNoun: 'Вопрос' })).toBe('Содержимое вопроса')
    expect(t('copyOfItem', { itemNoun: 'Вопрос' })).toBe('Копия вопроса')
    expect(t('itemContentTitle', { itemNoun: 'Учебная задача' })).toBe('Содержимое: Учебная задача')
  })
})
