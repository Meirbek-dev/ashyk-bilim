/**
 * Unit tests for the grading service module.
 *
 * Covers the critical student and teacher API calls that drive the core
 * assessment workflow. Each test stubs `apiFetch` and verifies that:
 *  - the correct endpoint path is built
 *  - the correct HTTP method is used
 *  - request bodies / query-string params are correct
 *  - success responses are parsed and returned
 *  - failure responses throw with meaningful messages
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoisted mocks (declared before any imports that need them) ────────────────
const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  getResponseMetadata: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  apiFetch: mocks.apiFetch,
  getResponseMetadata: mocks.getResponseMetadata,
}));

vi.mock('next/cache', () => ({
  revalidateTag: mocks.revalidateTag,
}));

// Import AFTER mocks are registered
import {
  startSubmission,
  submitAssessment,
  getMySubmissions,
  getMySubmissionResult,
  getSubmissionsForActivity,
  getSubmissionStats,
  getSubmission,
  saveGrade,
  batchGradeSubmissions,
  publishActivityGrades,
  publishAssessmentGrades,
  extendDeadline,
} from '@/services/grading/grading';
import type { Submission, SubmissionsPage, SubmissionStats } from '@/types/grading';

// ── Test helpers ─────────────────────────────────────────────────────────────

function makeSubmission(overrides: Partial<Submission> = {}): Submission {
  return {
    id: 1,
    submission_uuid: 'sub_test_1',
    user_id: 10,
    activity_id: 42,
    status: 'GRADED',
    version: 1,
    final_score: 85,
    auto_score: 80,
    started_at: '2026-05-01T10:00:00Z',
    submitted_at: '2026-05-01T11:00:00Z',
    graded_at: '2026-05-01T12:00:00Z',
    created_at: '2026-05-01T10:00:00Z',
    updated_at: '2026-05-01T12:00:00Z',
    attempt_number: 1,
    is_late: false,
    grading_json: { feedback: 'Good work.', items: [], needs_manual_review: false, auto_graded: false },
    answers_json: {},
    metadata_json: {},
    ...overrides,
  } as Submission;
}

/** Set up apiFetch + getResponseMetadata to return a successful response. */
function mockSuccess(data: unknown) {
  const mockResponse = {};
  mocks.apiFetch.mockResolvedValue(mockResponse);
  mocks.getResponseMetadata.mockResolvedValue({ success: true, data, status: 200 });
}

/** Set up apiFetch + getResponseMetadata to return a failure response. */
function mockFailure(detail = 'An error occurred') {
  const mockResponse = {};
  mocks.apiFetch.mockResolvedValue(mockResponse);
  mocks.getResponseMetadata.mockResolvedValue({
    success: false,
    data: { detail },
    status: 400,
  });
}

// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Student: startSubmission ──────────────────────────────────────────────────

describe('startSubmission', () => {
  it('calls the correct endpoint with POST', async () => {
    mockSuccess(makeSubmission({ status: 'DRAFT' }));

    const result = await startSubmission(42, 'ASSIGNMENT');

    expect(mocks.apiFetch).toHaveBeenCalledWith(
      'grading/start/v2/42?assessment_type=ASSIGNMENT',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result.status).toBe('DRAFT');
  });

  it('throws on failure response', async () => {
    mockFailure('Activity not found');

    await expect(startSubmission(99, 'ASSIGNMENT')).rejects.toThrow('Activity not found');
  });
});

// ── Student: submitAssessment ─────────────────────────────────────────────────

describe('submitAssessment', () => {
  it('POSTs answers payload with correct query params', async () => {
    const submission = makeSubmission({ status: 'GRADED', final_score: 90 });
    mockSuccess(submission);

    const answers = { item_1: { kind: 'OPEN_TEXT', text: 'My answer' } };
    const result = await submitAssessment(42, 'ASSIGNMENT', answers, 0);

    expect(mocks.apiFetch).toHaveBeenCalledWith(
      'grading/submit/42?assessment_type=ASSIGNMENT&violation_count=0',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(answers),
      }),
    );
    expect(result.final_score).toBe(90);
  });

  it('includes violation_count in query string when > 0', async () => {
    mockSuccess(makeSubmission());

    await submitAssessment(42, 'EXAM', {}, 3);

    const [url] = mocks.apiFetch.mock.calls[0]!;
    expect(url).toContain('violation_count=3');
  });

  it('throws on failure', async () => {
    mockFailure('Submission window closed');

    await expect(submitAssessment(42, 'ASSIGNMENT', {})).rejects.toThrow(
      'Submission window closed',
    );
  });

  it('revalidates the submissions tag on success', async () => {
    mockSuccess(makeSubmission());

    await submitAssessment(42, 'ASSIGNMENT', {});

    expect(mocks.revalidateTag).toHaveBeenCalledWith('submissions', 'max');
  });
});

// ── Student: getMySubmissions ─────────────────────────────────────────────────

describe('getMySubmissions', () => {
  it('fetches the student submissions list for an activity', async () => {
    const submissions = [makeSubmission(), makeSubmission({ submission_uuid: 'sub_2', attempt_number: 2 })];
    mockSuccess(submissions);

    const result = await getMySubmissions(42);

    expect(mocks.apiFetch).toHaveBeenCalledWith(
      'grading/submissions/me?activity_id=42',
      expect.any(Object),
    );
    expect(result).toHaveLength(2);
  });

  it('returns empty array on failure', async () => {
    mockFailure('Not found');

    const result = await getMySubmissions(99);

    expect(result).toEqual([]);
  });
});

// ── Student: getMySubmissionResult ────────────────────────────────────────────

describe('getMySubmissionResult', () => {
  it('fetches a single student submission by UUID', async () => {
    const submission = makeSubmission({ submission_uuid: 'sub_detail_1', status: 'PUBLISHED' });
    mockSuccess(submission);

    const result = await getMySubmissionResult('sub_detail_1');

    expect(mocks.apiFetch).toHaveBeenCalledWith(
      'grading/submissions/me/sub_detail_1',
      expect.any(Object),
    );
    expect(result?.status).toBe('PUBLISHED');
  });

  it('returns null on failure', async () => {
    mockFailure('Not found');

    const result = await getMySubmissionResult('nonexistent');

    expect(result).toBeNull();
  });
});

// ── Teacher: getSubmissionsForActivity ────────────────────────────────────────

describe('getSubmissionsForActivity', () => {
  it('includes activity_id in the query string', async () => {
    const page: SubmissionsPage = { items: [], total: 0, page: 1, page_size: 25, pages: 1 };
    mockSuccess(page);

    await getSubmissionsForActivity(42);

    const [url] = mocks.apiFetch.mock.calls[0]!;
    expect(url).toContain('activity_id=42');
  })

  it('appends optional filters to the query string', async () => {
    const page: SubmissionsPage = { items: [], total: 0, page: 1, page_size: 25, pages: 1 };
    mockSuccess(page);

    await getSubmissionsForActivity(42, {
      status: 'PENDING',
      search: 'alice',
      sortBy: 'submitted_at',
      sortDir: 'asc',
      page: 2,
      pageSize: 10,
    });

    const [url] = mocks.apiFetch.mock.calls[0]!
    expect(url).toContain('status=PENDING');
    expect(url).toContain('search=alice');
    expect(url).toContain('sort_by=submitted_at');
    expect(url).toContain('sort_dir=asc');
    expect(url).toContain('page=2');
    expect(url).toContain('page_size=10');
  });

  it('returns a safe empty page on failure', async () => {
    mockFailure('Forbidden');

    const result = await getSubmissionsForActivity(42);

    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });
});

// ── Teacher: getSubmissionStats ───────────────────────────────────────────────

describe('getSubmissionStats', () => {
  it('fetches stats for the given activity', async () => {
    const stats: SubmissionStats = {
      total: 5,
      graded_count: 3,
      needs_grading_count: 2,
      late_count: 1,
      avg_score: 78.5,
      pass_rate: 80,
    };
    mockSuccess(stats);

    const result = await getSubmissionStats(42);

    expect(mocks.apiFetch).toHaveBeenCalledWith(
      'grading/submissions/stats?activity_id=42',
      expect.any(Object),
    );
    expect(result?.total).toBe(5);
    expect(result?.avg_score).toBe(78.5);
  });

  it('returns null on failure', async () => {
    mockFailure('Not found');

    const result = await getSubmissionStats(99);

    expect(result).toBeNull();
  });
});

// ── Teacher: getSubmission (single) ──────────────────────────────────────────

describe('getSubmission', () => {
  it('fetches a specific submission by UUID', async () => {
    const submission = makeSubmission({ submission_uuid: 'sub_teacher_1', status: 'PENDING' });
    mockSuccess(submission);

    const result = await getSubmission('sub_teacher_1');

    expect(mocks.apiFetch).toHaveBeenCalledWith(
      'grading/submissions/sub_teacher_1',
      expect.any(Object),
    );
    expect(result?.status).toBe('PENDING');
  });

  it('returns null on 404', async () => {
    mockFailure('Not found');

    const result = await getSubmission('ghost');

    expect(result).toBeNull();
  });
});

// ── Teacher: saveGrade ────────────────────────────────────────────────────────

describe('saveGrade', () => {
  it('PATCHes the grade endpoint with correct payload', async () => {
    const gradedSubmission = makeSubmission({ status: 'GRADED', final_score: 91 });
    mockSuccess(gradedSubmission);

    const gradeInput = { final_score: 91, feedback: 'Excellent.', status: 'GRADED', item_feedback: [] };
    const result = await saveGrade('sub_grade_1', gradeInput);

    expect(mocks.apiFetch).toHaveBeenCalledWith(
      'grading/submissions/sub_grade_1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify(gradeInput),
      }),
    );
    expect(result.final_score).toBe(91);
  });

  it('includes If-Match header when version is provided', async () => {
    mockSuccess(makeSubmission());

    await saveGrade('sub_v2', { final_score: 80, feedback: '', status: 'GRADED', item_feedback: [] }, 3);

    const [, options] = mocks.apiFetch.mock.calls[0]!
    expect(options.headers['If-Match']).toBe('3');
  });

  it('uses assessment-scoped endpoint when assessmentUuid is given', async () => {
    mockSuccess(makeSubmission());

    await saveGrade('sub_assess_1', { final_score: 75, feedback: '', status: 'GRADED', item_feedback: [] }, undefined, 'asm_uuid_1');

    const [url] = mocks.apiFetch.mock.calls[0]!
    expect(url).toBe('assessments/asm_uuid_1/submissions/sub_assess_1');
  });

  it('throws on failure with server detail message', async () => {
    mockFailure('Submission already published');

    await expect(
      saveGrade('sub_err', { final_score: 80, feedback: '', status: 'GRADED', item_feedback: [] }),
    ).rejects.toThrow('Submission already published');
  });

  it('revalidates submissions tag on success', async () => {
    mockSuccess(makeSubmission());

    await saveGrade('sub_ok', { final_score: 60, feedback: '', status: 'GRADED', item_feedback: [] });

    expect(mocks.revalidateTag).toHaveBeenCalledWith('submissions', 'max');
  });
});

// ── Teacher: batchGradeSubmissions ────────────────────────────────────────────

describe('batchGradeSubmissions', () => {
  it('PATCHes the batch grade endpoint', async () => {
    const response = { processed: 2, failed: 0, results: [] };
    mockSuccess(response);

    const grades: { submission_uuid: string; final_score: number; status: 'GRADED' | 'PUBLISHED' | 'RETURNED' }[] = [
      { submission_uuid: 'sub_1', final_score: 80, status: 'GRADED' },
      { submission_uuid: 'sub_2', final_score: 90, status: 'PUBLISHED' },
    ];
    await batchGradeSubmissions(grades);

    expect(mocks.apiFetch).toHaveBeenCalledWith(
      'grading/submissions/batch',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ grades }),
      }),
    );
  });

  it('throws on failure', async () => {
    mockFailure('Batch operation failed');

    await expect(batchGradeSubmissions([])).rejects.toThrow('Batch operation failed');
  });
});

// ── Teacher: publishActivityGrades ───────────────────────────────────────────

describe('publishActivityGrades', () => {
  it('POSTs to the publish-grades endpoint for activity', async () => {
    mockSuccess({ published_count: 5 });

    const result = await publishActivityGrades(42);

    expect(mocks.apiFetch).toHaveBeenCalledWith(
      'grading/activities/42/publish-grades',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result.published_count).toBe(5);
  });

  it('throws on failure', async () => {
    mockFailure('Not authorized');

    await expect(publishActivityGrades(42)).rejects.toThrow('Not authorized');
  });
});

// ── Teacher: publishAssessmentGrades ─────────────────────────────────────────

describe('publishAssessmentGrades', () => {
  it('POSTs to the assessment-scoped publish-grades endpoint', async () => {
    mockSuccess({ published_count: 3 });

    await publishAssessmentGrades('asm_uuid_publish');

    expect(mocks.apiFetch).toHaveBeenCalledWith(
      'assessments/asm_uuid_publish/publish-grades',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

// ── Teacher: extendDeadline ───────────────────────────────────────────────────

describe('extendDeadline', () => {
  it('POSTs to the extend-deadline endpoint with correct body', async () => {
    mockSuccess({ action_uuid: 'action_1', status: 'QUEUED' });

    await extendDeadline(42, {
      user_uuids: ['user_a', 'user_b'],
      new_due_at: '2026-06-01T00:00:00Z',
      reason: 'Medical extension',
    });

    expect(mocks.apiFetch).toHaveBeenCalledWith(
      'grading/activities/42/extend-deadline',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          user_uuids: ['user_a', 'user_b'],
          new_due_at: '2026-06-01T00:00:00Z',
          reason: 'Medical extension',
        }),
      }),
    );
  });

  it('throws on failure', async () => {
    mockFailure('Activity not found');

    await expect(
      extendDeadline(99, { user_uuids: [], new_due_at: '2026-06-01T00:00:00Z' }),
    ).rejects.toThrow('Activity not found');
  });
});
