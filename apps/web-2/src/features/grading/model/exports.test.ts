import { describe, expect, test } from 'vite-plus/test'

import { gradebookCsvHref, queueCsvHref } from './exports'

describe('CSV exports', () => {
  test('B-GRD-06 the queue CSV is a same-origin link to the server export in the interface language', () => {
    expect(queueCsvHref('assessment', 'as-1')).toBe('/api/v2/assessments/as-1/submissions/export?lang=ru')
    expect(queueCsvHref('file', 'fs-1')).toBe('/api/v2/file-submissions/fs-1/submissions/export?lang=ru')
  })

  test('B-GRD-19 the gradebook CSV is the course export in the interface language', () => {
    expect(gradebookCsvHref('c-1')).toBe('/api/v2/courses/c-1/gradebook/export?lang=ru')
  })
})
