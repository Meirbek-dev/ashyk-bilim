import { createTranslator } from 'next-intl'
import { describe, expect, it } from 'vitest'

import ruMessages from '@/messages/ru-RU.json'

// at_risk_total counts learner×course pairs: they read as «регистрации», with the ru few form.
describe('ru enrollment counts', () => {
  const t = createTranslator({ locale: 'ru', messages: ruMessages })

  it('declines «регистрация» for 1 / 3 / 5 / 21', () => {
    expect([1, 3, 5, 21].map(count => t('DashPage.Admin.enrollments', { count }))).toEqual([
      '1 регистрация',
      '3 регистрации',
      '5 регистраций',
      '21 регистрация',
    ])
  })

  it('labels the at-risk list and preview as enrollments', () => {
    expect(t('TeacherAnalytics.pages.atRiskPageDescription', { total: 3 })).toBe(
      '3 регистрации в охвате, по убыванию риска.',
    )
    expect(t('TeacherAnalytics.riskDistribution.preview', { shown: 2, total: 5 })).toBe(
      'Показаны топ-2 из 5 регистраций в зоне риска.',
    )
  })
})
