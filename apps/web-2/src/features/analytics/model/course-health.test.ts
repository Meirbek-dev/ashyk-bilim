import { describe, expect, test } from 'vite-plus/test'

import { funnelLabel, healthValue } from './course-health'

describe('course health', () => {
  test('B-ANL-27 funnel codes and health signals read as words; unknown codes stay as sent', () => {
    expect(funnelLabel('active_7d')).toBe('Активны за 7 дней')
    expect(funnelLabel('Глава 1')).toBe('Глава 1')
    expect(healthValue({ signal: 'content_freshness', value: 30 })).toBe('Содержимое обновлялось 30 дн. назад')
    expect(healthValue({ signal: 'content_freshness', value: null })).toBe('Нет данных об обновлении содержимого')
    expect(healthValue({ signal: 'grading_backlog', value: 4 })).toBe('Ждут проверки: 4')
  })
})
