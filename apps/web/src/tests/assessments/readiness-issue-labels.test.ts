import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTranslator } from 'next-intl'
import type { AbstractIntlMessages } from 'next-intl'

import { localizeValidationIssue, validationIssueMessageKey } from '@/features/assessments/domain/readiness'
import { ITEM_KIND_LABEL_KEYS } from '@/features/assessments/domain/items'
import ruMessages from '@/messages/ru-RU.json'
import kkMessages from '@/messages/kk-KZ.json'
import enMessages from '@/messages/en-US.json'

// BUG-029: the studio readiness strip rendered the server's English `message`
// and raw `code` ("add at least one item / assessment.empty"). Every code the
// server can emit (crates/domain/src/assessments, crates/core/src/assessments.rs)
// must resolve through the catalog; only an unknown code falls back to `message`.
const SERVER_READINESS_CODES = [
  'assessment.empty',
  'assessment.title_missing',
  'choice.correct_missing',
  'choice.option_duplicate',
  'choice.option_text_missing',
  'choice.options_missing',
  'choice.prompt_missing',
  'choice.too_many_correct',
  'code.languages_missing',
  'code.prompt_missing',
  'code.test_io_missing',
  'code.test_weight_invalid',
  'code.tests_missing',
  'form.field_id_duplicate',
  'form.field_label_missing',
  'form.fields_missing',
  'form.prompt_missing',
  'item.kind_forbidden',
  'item.max_score_invalid',
  'item.title_missing',
  'matching.left_duplicate',
  'matching.pair_value_missing',
  'matching.pairs_missing',
  'matching.prompt_missing',
  'matching.right_duplicate',
  'open_text.min_words_invalid',
  'open_text.prompt_missing',
  'schedule.after_due_at',
]

const NAMESPACE = 'Features.Assessments.Studio.NativeItemStudio.validation'

// Untyped messages: the tests iterate server codes, not statically known keys.
type LooseTranslator = ((key: string, values?: Record<string, string | number>) => string) & {
  has: (key: string) => boolean
}
function translator(locale: string, messages: AbstractIntlMessages, namespace: string): LooseTranslator {
  return createTranslator({ locale, messages, namespace }) as unknown as LooseTranslator
}

function resolverFor(messages: AbstractIntlMessages, locale: string) {
  const t = translator(locale, messages, NAMESPACE)
  return (key: string) => (t.has(key) ? t(key) : undefined)
}

describe('readiness issue labels (BUG-029)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each([
    ['ru-RU', ruMessages],
    ['kk-KZ', kkMessages],
    ['en-US', enMessages],
  ])('%s has a catalog entry for every server readiness code', (locale, messages) => {
    const t = translator(locale, messages, NAMESPACE)
    const missing = SERVER_READINESS_CODES.filter(code => !t.has(validationIssueMessageKey(code)))
    expect(missing).toEqual([])
  })

  it('renders the Russian catalog text for a known code, never the server message', () => {
    const resolve = resolverFor(ruMessages, 'ru')
    expect(localizeValidationIssue({ code: 'assessment.empty', message: 'add at least one item' }, resolve)).toBe(
      'Оценка не содержит учебных задач.',
    )
    expect(localizeValidationIssue({ code: 'choice.prompt_missing', message: 'prompt is empty' }, resolve)).toBe(
      'Требуется формулировка вопроса выбора.',
    )
  })

  it('falls back to the server message for an unknown code and logs it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const resolve = resolverFor(ruMessages, 'ru')
    expect(localizeValidationIssue({ code: 'future.unknown_rule', message: 'something new' }, resolve)).toBe(
      'something new',
    )
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('future.unknown_rule'))
  })

  it('maps every unified item kind to a localized label instead of the enum', () => {
    const t = translator('ru', ruMessages, 'Features.Assessments.Studio.NativeItemStudio.kindLabels')
    for (const [kind, key] of Object.entries(ITEM_KIND_LABEL_KEYS)) {
      expect(t.has(key), `kindLabels.${key} for ${kind}`).toBe(true)
      expect(t(key)).not.toBe(kind)
    }
    expect(t(ITEM_KIND_LABEL_KEYS.CHOICE)).toBe('Выбор')
  })

  it('localizes the lifecycle label used by the "stage changed" toast', () => {
    const t = translator('ru', ruMessages, 'Features.Assessments.Studio')
    const lifecycle = 'PUBLISHED'
    expect(t('lifecycleChanged', { state: t(`lifecycle.${lifecycle.toLowerCase()}`) })).toBe(
      'Этап изменён на Опубликовано',
    )
  })
})
