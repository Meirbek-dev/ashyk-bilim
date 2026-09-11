'use server'

import { listCourses } from '@/lib/api/generated/courses/courses'
import { collectPages } from '@/lib/api/contract'
import { toAppCourse } from '@/hooks/courses/courseKeys'
import { getSession } from '@/lib/auth/session'
import { getLocale } from 'next-intl/server'
import { deriveCourseWorkspaceCapabilities } from '@/lib/course-management-server'

/*
 v2 has no server-side "editable" listing (and adding one is a contract change):
 `GET /courses` already returns public courses plus the caller's own, so the
 editable set is derived here from the session's RBAC grants + `creator_id`
 (QUESTIONS.md Q-2026-09-10-2). Query / sort / preset / paging are applied
 client-side over the full walk.
 ponytail: full listing walk per request (≤ 20 pages of 100); revisit if a
 platform grows past ~2k courses.
*/

export interface EditableCoursesSummary {
  total: number
  ready: number
  private: number
  attention: number
}

const RECENT_WINDOW_SECONDS = 7 * 24 * 60 * 60

type EditableCourse = ReturnType<typeof toAppCourse>

const matchesQuery = (course: EditableCourse, query: string) =>
  !query || course.name.toLowerCase().includes(query) || course.description.toLowerCase().includes(query)

const matchesPreset = (course: EditableCourse, preset: string, nowUnix: number) => {
  switch (preset) {
    case 'drafts':
    case 'private':
      return !course.public
    case 'published':
      return course.public
    case 'recent':
      return nowUnix - course.updated_at_unix <= RECENT_WINDOW_SECONDS
    case 'attention':
      // ponytail: no readiness signal on the listing yet; empty until one exists.
      return false
    default:
      return true
  }
}

async function loadEditableCourses(): Promise<EditableCourse[]> {
  const session = await getSession()
  if (!session) return []
  const courses = await collectPages(cursor => listCourses({ limit: 100, ...(cursor ? { cursor } : {}) }))
  return courses.map(toAppCourse).filter(course => {
    const capabilities = deriveCourseWorkspaceCapabilities(session, course)
    return capabilities.canEditDetails || capabilities.canManageAccess
  })
}

export async function getEditableCourses(
  page = 1,
  limit = 20,
  query = '',
  sortBy = 'updated',
  preset = '',
): Promise<{ courses: AppCourse[]; total: number; summary: EditableCoursesSummary }> {
  const [all, locale] = await Promise.all([loadEditableCourses(), getLocale()])
  // Collation follows the viewer's locale (ru puts Cyrillic first), not the
  // server process locale.
  const collator = new Intl.Collator(locale, { sensitivity: 'base' })
  const summary = {
    total: all.length,
    ready: all.filter(course => course.public).length,
    private: all.filter(course => !course.public).length,
    attention: 0,
  }

  const needle = query.trim().toLowerCase()
  const nowUnix = Math.floor(Date.now() / 1000)
  const filtered = all
    .filter(course => matchesQuery(course, needle) && matchesPreset(course, preset.trim(), nowUnix))
    .sort((a, b) =>
      sortBy === 'name' ? collator.compare(a.name, b.name) : b.updated_at_unix - a.updated_at_unix,
    )

  const start = (page - 1) * limit
  return { courses: filtered.slice(start, start + limit), total: filtered.length, summary }
}

/** Editable courses for the outline template combobox; `[]` on failure. */
export async function searchEditableCourses(query: string, limit = 20): Promise<AppCourse[]> {
  const { courses } = await getEditableCourses(1, limit, query, 'updated').catch(() => ({ courses: [] }))
  return courses
}
