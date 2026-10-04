import { describe, expect, test } from 'vite-plus/test'

// Through the public entry: /home (slice 3.1) imports learnerWorkOptions from there.
import { learnerWorkOptions, teachWorkOptions } from './index'

describe('work queue options', () => {
  test('B-INB-09 the learner queue is the same request with role=learner, cached apart from the teacher one', () => {
    const learner = learnerWorkOptions().queryKey[0]
    const teacher = teachWorkOptions().queryKey[0]
    expect(learner.query).toEqual({ role: 'learner', limit: 100 })
    expect(teacher.query).toEqual({ role: 'teacher', limit: 100 })
  })

  test('B-INB-01 the inbox asks for the teacher queue', () => {
    expect(teachWorkOptions().queryKey[0].query?.role).toBe('teacher')
  })
})
