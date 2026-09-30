// UX-266: «Копировать структуру» without a source is a field error on
// `sourceCourseUuid`, not a root issue the form never reads.
import { describe, expect, it } from 'vite-plus/test'
import * as v from 'valibot'

import { courseCreateSchema } from '@/schemas/courseSchemas'

const values = {
  title: 'Курс',
  description: '',
  structureMode: 'copy-outline',
  sourceCourseUuid: '',
  initialVisibility: 'private',
  destination: 'overview',
}

describe('courseCreateSchema source course', () => {
  it('puts the missing source on the sourceCourseUuid field', () => {
    const result = v.safeParse(courseCreateSchema, values)
    expect(result.success).toBe(false)
    const issue = result.issues?.find(item => item.message === 'source_course_required')
    expect(issue?.path?.map(segment => segment.key)).toEqual(['sourceCourseUuid'])
  })

  it('accepts a blank outline without a source', () => {
    expect(v.safeParse(courseCreateSchema, { ...values, structureMode: 'blank' }).success).toBe(true)
  })
})
