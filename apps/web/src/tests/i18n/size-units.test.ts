// UX-321: a size is «5 МБ», never «5МБ»; the thumbnail toast carries the
// formatted size (useFormatBytes) with its own unit.
import { describe, expect, it } from 'vite-plus/test'

import enMessages from '@/messages/en-US.json'
import kkMessages from '@/messages/kk-KZ.json'
import ruMessages from '@/messages/ru-RU.json'

const strings = (value: unknown): string[] =>
  typeof value === 'string' ? [value] : value && typeof value === 'object' ? Object.values(value).flatMap(strings) : []

describe('size units (UX-321)', () => {
  it.each([
    ['ru', ruMessages],
    ['kk', kkMessages],
    ['en', enMessages],
  ])('%s spaces every size from its unit', (_locale, messages) => {
    expect(strings(messages).filter(s => /[0-9}](МБ|MB|КБ|KB)(?![A-Za-zА-Яа-я])/.test(s))).toEqual([])
    expect(messages.CourseEdit.General.Thumbnail.errors.fileTooLarge).toContain('({fileSize})')
    // UX-323: a duration placeholder is spaced from its unit too («2 с», «18 мс»).
    expect(strings(messages).filter(s => /\{value\}(мс|с|ms|s)(?![A-Za-zА-Яа-я])/.test(s))).toEqual([])
  })
})
