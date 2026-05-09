import { describe, expect, it } from 'vitest';

import { normalizeAnalyticsQuery } from '@/services/analytics/teacher';

describe('normalizeAnalyticsQuery', () => {
  it('drops invalid numeric filters before they reach the API', () => {
    const query = normalizeAnalyticsQuery({
      teacher_user_id: 'not-a-number',
      page: '-2',
      page_size: 'abc',
      window: '28d',
    });

    expect(query.teacher_user_id).toBeUndefined();
    expect(query.page).toBe(1);
    expect(query.page_size).toBe(25);
  });

  it('preserves valid scope filters', () => {
    const query = normalizeAnalyticsQuery({
      course_ids: '10',
      cohort_ids: '7',
      teacher_user_id: '3',
      timezone: 'Asia/Almaty',
    });

    expect(query.course_ids).toBe('10');
    expect(query.cohort_ids).toBe('7');
    expect(query.teacher_user_id).toBe(3);
    expect(query.timezone).toBe('Asia/Almaty');
  });
});
