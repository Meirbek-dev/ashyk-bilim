/**
 * Unit tests for the courses service module.
 *
 * Covers the key read and write operations used by the teacher and student
 * course workflows. We mock `apiFetch` at the module boundary and verify:
 *  - correct endpoint paths
 *  - correct HTTP methods / request bodies
 *  - proper normalisation of course data (nullish fields become empty strings, tags parsed)
 *  - 401/403 graceful returns
 *  - cache tag revalidation on mutations
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  getResponseMetadata: vi.fn(),
  errorHandling: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  apiFetch: mocks.apiFetch,
  getResponseMetadata: mocks.getResponseMetadata,
  errorHandling: mocks.errorHandling,
}));

vi.mock('next/cache', () => ({
  revalidateTag: mocks.revalidateTag,
}));

vi.mock('@services/config/config', () => ({
  getAPIUrl: vi.fn(() => 'http://api.test/'),
  getServerAPIUrl: vi.fn(() => 'http://api:8000/api/v1/'),
}));

vi.mock('@/lib/cacheTags', () => ({
  tags: { courses: 'courses' },
  courseTag: {
    detail: (uuid: string) => `course-${uuid}`,
    editableList: () => 'course-editable-list',
    publicList: () => 'course-public-list',
    access: (uuid: string) => `course-access-${uuid}`,
  },
}));

// Import AFTER mocks
import {
  getCourses,
  getCourse,
  getCourseMetadata,
  getEditableCourses,
  updateCourseMetadata,
  updateCourseAccess,
  getCourseUserRights,
  searchCourses,
} from '@/services/courses/courses';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeCourse(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    course_uuid: 'course_abc',
    name: 'Test Course',
    description: 'A test course description',
    about: 'About this course',
    learnings: '["Learn A","Learn B"]',
    tags: '["python","beginner"]',
    thumbnail_image: 'https://example.com/thumb.jpg',
    thumbnail_type: 'IMAGE',
    thumbnail_video: null,
    public: true,
    open_to_contributors: false,
    creator_id: 1,
    creation_date: '2026-01-01T00:00:00Z',
    update_date: '2026-05-01T00:00:00Z',
    authors: [
      {
        role: 'OWNER',
        user: {
          id: 1,
          user_uuid: 'user_teacher_1',
          avatar_image: null,
          first_name: 'Alice',
          middle_name: null,
          last_name: 'Smith',
          username: 'alice',
        },
      },
    ],
    ...overrides,
  };
}

function makeFullCourse(overrides: Record<string, unknown> = {}) {
  return {
    ...makeCourse(overrides),
    chapters: [
      {
        id: 10,
        chapter_uuid: 'chap_1',
        name: 'Chapter 1',
        order: 1,
        activities: [],
      },
    ],
  };
}

/** Create a Response-like mock with ok, status, json, headers */
function makeResponse(
  body: unknown,
  { status = 200, ok = true, headers = {} }: { status?: number; ok?: boolean; headers?: Record<string, string> } = {},
) {
  const headerMap = new Map(Object.entries(headers));
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(body),
    headers: { get: (key: string) => headerMap.get(key) ?? null },
  };
}

// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ── getCourses ────────────────────────────────────────────────────────────────

describe('getCourses', () => {
  it('fetches the courses list with pagination params', async () => {
    const course = makeCourse();
    mocks.apiFetch.mockResolvedValue(makeResponse([course], { headers: { 'X-Total-Count': '1' } }));

    const result = await getCourses(undefined, 1, 20);

    expect(mocks.apiFetch).toHaveBeenCalledWith('courses/page/1/limit/20', expect.objectContaining({ method: 'GET' }));
    expect(result.total).toBe(1);
    expect(result.courses).toHaveLength(1);
  });

  it('normalises null thumbnail_video to empty string', async () => {
    mocks.apiFetch.mockResolvedValue(makeResponse([makeCourse({ thumbnail_video: null })]));

    const { courses } = await getCourses();

    expect(courses[0]!.thumbnail_video).toBe('');
  });

  it('parses JSON tags array', async () => {
    mocks.apiFetch.mockResolvedValue(makeResponse([makeCourse({ tags: '["python","beginner"]' })]));

    const { courses } = await getCourses();

    expect(courses[0]!.tags).toEqual(['python', 'beginner']);
  });

  it('falls back to comma-separated tags if not valid JSON', async () => {
    mocks.apiFetch.mockResolvedValue(makeResponse([makeCourse({ tags: 'python, beginner' })]));

    const { courses } = await getCourses();

    expect(courses[0]!.tags).toEqual(['python', 'beginner']);
  });

  it('normalises null author avatar to empty string', async () => {
    mocks.apiFetch.mockResolvedValue(makeResponse([makeCourse()]));

    const { courses } = await getCourses();

    expect(courses[0]!.authors[0]!.user.avatar_image).toBe('');
  });
});

// ── getCourse ─────────────────────────────────────────────────────────────────

describe('getCourse', () => {
  it('fetches a single course by UUID', async () => {
    const course = makeCourse({ description: null, about: null });
    mocks.errorHandling.mockResolvedValue(course);
    mocks.apiFetch.mockResolvedValue(makeResponse(course));

    const result = await getCourse('course_abc');

    expect(mocks.apiFetch).toHaveBeenCalledWith('courses/course_abc', expect.any(Object));
    expect(result.course_uuid).toBe('course_abc');
    // Null description normalised
    expect(result.description).toBe('');
    expect(result.about).toBe('');
  });
});

// ── getCourseMetadata ─────────────────────────────────────────────────────────

describe('getCourseMetadata', () => {
  it('prepends course_ prefix when not present', async () => {
    const full = makeFullCourse();
    mocks.errorHandling.mockResolvedValue(full);
    mocks.apiFetch.mockResolvedValue(makeResponse(full));

    await getCourseMetadata('abc');

    const [url] = mocks.apiFetch.mock.calls[0]!;
    expect(url).toContain('courses/course_abc/meta');
  });

  it('does NOT double-prepend course_ prefix', async () => {
    const full = makeFullCourse();
    mocks.errorHandling.mockResolvedValue(full);
    mocks.apiFetch.mockResolvedValue(makeResponse(full));

    await getCourseMetadata('course_abc');

    const [url] = mocks.apiFetch.mock.calls[0]!;
    expect(url).toContain('courses/course_abc/meta');
    expect(url).not.toContain('course_course_abc');
  });

  it('normalises chapters to empty array when absent', async () => {
    // Build a full-course fixture with chapters explicitly absent (null)
    const { chapters: _omitted, ...baseFields } = makeFullCourse();
    const fullWithoutChapters = { ...baseFields, chapters: null };
    mocks.errorHandling.mockResolvedValue(fullWithoutChapters);
    mocks.apiFetch.mockResolvedValue(makeResponse(fullWithoutChapters));

    const result = await getCourseMetadata('course_abc');

    expect(result.chapters).toEqual([]);
  });
});

// ── getEditableCourses ────────────────────────────────────────────────────────

describe('getEditableCourses', () => {
  it('fetches editable courses list', async () => {
    const course = makeCourse();
    mocks.apiFetch.mockResolvedValue(
      makeResponse([course], {
        headers: {
          'X-Total-Count': '1',
          'X-Summary-Total': '1',
          'X-Summary-Ready': '1',
          'X-Summary-Private': '0',
          'X-Summary-Attention': '0',
        },
      }),
    );

    const result = await getEditableCourses();

    expect(mocks.apiFetch).toHaveBeenCalledWith(
      expect.stringContaining('courses/editable/page/1/limit/20'),
      expect.any(Object),
    );
    expect(result.total).toBe(1);
    expect(result.summary.ready).toBe(1);
  });

  it('appends query and sortBy params when provided', async () => {
    mocks.apiFetch.mockResolvedValue(makeResponse([], { headers: { 'X-Total-Count': '0' } }));

    await getEditableCourses(1, 20, 'python', 'name');

    const [url] = mocks.apiFetch.mock.calls[0]!;
    expect(url).toContain('query=python');
    expect(url).toContain('sort_by=name');
  });

  it('returns empty list on 401', async () => {
    mocks.apiFetch.mockResolvedValue(makeResponse(null, { status: 401, ok: false }));

    const result = await getEditableCourses();

    expect(result.courses).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('returns empty list on 403', async () => {
    mocks.apiFetch.mockResolvedValue(makeResponse(null, { status: 403, ok: false }));

    const result = await getEditableCourses();

    expect(result.courses).toEqual([]);
  });
});

// ── getCourseUserRights ───────────────────────────────────────────────────────

describe('getCourseUserRights', () => {
  it('fetches user rights for a course', async () => {
    const rights = { can_edit: true, can_manage_members: false };
    mocks.apiFetch.mockResolvedValue(makeResponse(rights));
    mocks.errorHandling.mockResolvedValue(rights);

    const result = await getCourseUserRights('course_abc');

    expect(mocks.apiFetch).toHaveBeenCalledWith('courses/course_abc/rights');
    expect(result).toEqual(rights);
  });
});

// ── searchCourses ─────────────────────────────────────────────────────────────

describe('searchCourses', () => {
  it('fetches search results with encoded query', async () => {
    const courses = [makeCourse()];
    mocks.apiFetch.mockResolvedValue(makeResponse(courses));
    mocks.errorHandling.mockResolvedValue(courses);

    const result = await searchCourses('python basics', 1, 10, undefined);

    expect(mocks.apiFetch).toHaveBeenCalledWith(expect.stringContaining('query=python%20basics'));
    expect(result).toHaveLength(1);
  });
});

// ── updateCourseMetadata ──────────────────────────────────────────────────────

describe('updateCourseMetadata', () => {
  it('PUTs metadata and revalidates relevant tags on success', async () => {
    mocks.apiFetch.mockResolvedValue(makeResponse(makeCourse()));
    mocks.getResponseMetadata.mockResolvedValue({ success: true, data: makeCourse(), status: 200 });

    await updateCourseMetadata('course_abc', {
      name: 'Updated Course',
      description: 'New desc',
      about: 'New about',
      learnings: '["Skill A"]',
      tags: '["tag1"]',
      thumbnail_type: 'IMAGE',
    });

    expect(mocks.apiFetch).toHaveBeenCalledWith(
      'courses/course_abc/metadata',
      expect.objectContaining({ method: 'PUT' }),
    );
    expect(mocks.revalidateTag).toHaveBeenCalledWith('courses', 'max');
    expect(mocks.revalidateTag).toHaveBeenCalledWith('course-course_abc', 'max');
  });

  it('does NOT revalidate when response is not successful', async () => {
    mocks.apiFetch.mockResolvedValue(makeResponse(null, { status: 400, ok: false }));
    mocks.getResponseMetadata.mockResolvedValue({ success: false, data: { detail: 'Conflict' }, status: 400 });

    await updateCourseMetadata('course_abc', { name: 'Oops' });

    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });
});

// ── updateCourseAccess ────────────────────────────────────────────────────────

describe('updateCourseAccess', () => {
  it('PUTs access settings and revalidates access tag', async () => {
    mocks.apiFetch.mockResolvedValue(makeResponse(makeCourse()));
    mocks.getResponseMetadata.mockResolvedValue({ success: true, data: makeCourse(), status: 200 });

    await updateCourseAccess('course_abc', { public: true });

    expect(mocks.apiFetch).toHaveBeenCalledWith(
      'courses/course_abc/access',
      expect.objectContaining({ method: 'PUT' }),
    );
    expect(mocks.revalidateTag).toHaveBeenCalledWith('course-access-course_abc', 'max');
  });
});
