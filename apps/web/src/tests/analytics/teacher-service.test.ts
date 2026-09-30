import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import {
  createTeacherIntervention,
  getTeacherCourseDetailByUuid,
  getTeacherAssessmentDetail,
  getTeacherInterventions,
  normalizeAnalyticsQuery,
} from '@/services/analytics/teacher'
import { apiJson } from '@/lib/api-client'

vi.mock('@/lib/api-client', () => ({ apiJson: vi.fn(), apiBody: vi.fn() }))

const id = '00000000-0000-4000-8000-000000000001'
beforeEach(() => vi.resetAllMocks())

describe('normalizeAnalyticsQuery', () => {
  it('defaults invalid pagination without silently broadening malformed scope filters', () => {
    const query = normalizeAnalyticsQuery({
      teacher_user_id: 'not-a-number',
      page: '-2',
      page_size: 'abc',
      window: '28d',
    })

    expect(query.teacher_user_id).toBe('not-a-number')
    expect(query.page).toBe(1)
    expect(query.page_size).toBe(25)
  })

  it('keeps sort_by only when the page honours it (UX-095)', () => {
    expect(normalizeAnalyticsQuery({ sort_by: 'health' }).sort_by).toBeUndefined()
    expect(normalizeAnalyticsQuery({ sort_by: 'health' }, ['risk', 'progress']).sort_by).toBeUndefined()
    expect(normalizeAnalyticsQuery({ sort_by: 'risk' }, ['risk', 'progress']).sort_by).toBe('risk')
  })

  it('preserves valid scope filters', () => {
    const query = normalizeAnalyticsQuery({
      course_ids: id,
      cohort_ids: id,
      teacher_user_id: id,
      timezone: 'Asia/Almaty',
    })

    expect(query.course_ids).toBe(id)
    expect(query.cohort_ids).toBe(id)
    expect(query.teacher_user_id).toBe(id)
    expect(query.timezone).toBe('Asia/Almaty')
  })
})

describe('v2 analytics requests', () => {
  it('uses UUID detail routes and rejects malformed identifiers before requesting', async () => {
    vi.mocked(apiJson).mockResolvedValue({})
    await getTeacherCourseDetailByUuid(id)
    expect(apiJson).toHaveBeenLastCalledWith(`analytics/teacher/courses/${id}`, undefined, expect.any(Function))
    await getTeacherAssessmentDetail({ assessmentType: 'exam', assessmentId: id })
    expect(apiJson).toHaveBeenLastCalledWith(
      `analytics/teacher/assessments/exam/${id}`,
      undefined,
      expect.any(Function),
    )
    expect(() => getTeacherCourseDetailByUuid('1')).toThrow()
    expect(apiJson).toHaveBeenCalledTimes(2)
  })

  it('validates intervention responses and preserves UUID scopes and epoch seconds', async () => {
    const response = { generated_at_unix: 1777982400, total: 0, page: 1, page_size: 50, items: [] }
    vi.mocked(apiJson).mockImplementation(async (_path, _init, parse) => parse!(response))
    expect(await getTeacherInterventions({ course_id: id, user_id: id })).toEqual(response)
    expect(apiJson).toHaveBeenLastCalledWith(
      `analytics/teacher/interventions?course_id=${id}&user_id=${id}`,
      undefined,
      expect.any(Function),
    )
    vi.mocked(apiJson).mockImplementation(async (_path, _init, parse) => parse!({ items: [] }))
    await expect(getTeacherInterventions()).rejects.toThrow()
  })

  it('validates intervention input and propagates request failures', async () => {
    const payload = { course_id: id, user_id: id, intervention_type: 'message_sent' }
    vi.mocked(apiJson).mockRejectedValue(new Error('service unavailable'))
    await expect(createTeacherIntervention(payload)).rejects.toThrow('service unavailable')
    expect(apiJson).toHaveBeenLastCalledWith(
      'analytics/teacher/interventions',
      expect.objectContaining({ method: 'POST' }),
      expect.any(Function),
    )
    expect(JSON.parse(String(vi.mocked(apiJson).mock.calls.at(-1)?.[1]?.body))).toEqual(payload)
    expect(() => createTeacherIntervention({ ...payload, user_id: '1' })).toThrow()
    expect(apiJson).toHaveBeenCalledTimes(1)
  })
})
