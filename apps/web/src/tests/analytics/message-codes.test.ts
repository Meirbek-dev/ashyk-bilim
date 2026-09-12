import { describe, expect, it } from 'vitest'
import { AnalyticsCode } from '@/lib/api/generated/zod'
import en from '@/messages/en-US.json'
import kk from '@/messages/kk-KZ.json'
import ru from '@/messages/ru-RU.json'

// DECISIONS "Pass-6 contract gaps": analytics alerts / forecasts / anomalies /
// insights / data-quality issues carry an `AnalyticsCode` + params, no prose.
// Every code the server can emit (the openapi enum, via the generated client)
// needs a title and a body in each catalog, or ru/kk users see raw codes.
describe('TeacherAnalytics.messages', () => {
  const catalogs = { 'ru-RU': ru, 'kk-KZ': kk, 'en-US': en } as const

  it.each(Object.entries(catalogs))('%s has a title and body for every AnalyticsCode', (_locale, catalog) => {
    const messages = catalog.TeacherAnalytics.messages as Record<string, { title?: string; body?: string }>
    for (const code of AnalyticsCode.options) {
      expect(messages[code]?.title?.trim(), `${code}.title`).toBeTruthy()
      expect(messages[code]?.body?.trim(), `${code}.body`).toBeTruthy()
    }
  })

  it('carries no message the server no longer emits', () => {
    const codes = new Set<string>(AnalyticsCode.options)
    for (const catalog of Object.values(catalogs)) {
      for (const key of Object.keys(catalog.TeacherAnalytics.messages)) {
        expect(codes.has(key), key).toBe(true)
      }
    }
  })
})
