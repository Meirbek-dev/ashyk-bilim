import { describe, expect, it } from 'vitest'
import { getMimeCategories } from '@/features/file-submissions/mime-categories'
import enUS from '@/messages/en-US.json'
import kkKZ from '@/messages/kk-KZ.json'
import ruRU from '@/messages/ru-RU.json'

describe('getMimeCategories', () => {
  it('returns catalog keys (no hard-coded labels), one per distinct category', () => {
    const keys = getMimeCategories(['application/pdf', 'image/png', 'image/jpeg', 'text/x-python']).map(c => c.key)
    expect(keys).toEqual(['documents', 'images', 'code'])
    expect(getMimeCategories([]).map(c => c.key)).toEqual(['anyFile'])
    expect(getMimeCategories(['application/octet-stream']).map(c => c.key)).toEqual(['anyFile'])
  })

  it('has every category key in all three catalogs', () => {
    const keys = [
      'pdf', 'documents', 'images', 'spreadsheets', 'presentations', 'archives',
      'textAndCode', 'text', 'code', 'video', 'audio', 'anyFile',
    ]
    for (const catalog of [ruRU, kkKZ, enUS]) {
      const labels = (catalog as { FileSubmission: { mimeCategories: Record<string, string> } }).FileSubmission.mimeCategories
      for (const key of keys) expect(labels[key], key).toBeTruthy()
    }
  })
})
