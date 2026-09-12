'use server'

import { listCourses } from '@/lib/api/generated/courses/courses'
import type { ListCoursesParams } from '@/lib/api/generated/zod'
import { toAppCourse } from '@/hooks/courses/courseKeys'
import { getSession } from '@/lib/auth/session'

/*
 `GET /courses?mine=true` returns the courses the caller may edit (creator,
 active contributor, or platform updater/manager) plus the `summary` block;
 `q` / `sort` / `preset` are applied on the server (DECISIONS "Teacher course
 listing is server-side"). The legacy page-numbered URL is kept by hopping
 `page - 1` cursors — one request per hop.
*/

export interface EditableCoursesSummary {
  total: number
  ready: number
  private: number
  attention: number
}

const EMPTY_SUMMARY: EditableCoursesSummary = { total: 0, ready: 0, private: 0, attention: 0 }

/** The web's `private` chip is the server's `drafts` preset. */
const toServerPreset = (preset: string): ListCoursesParams['preset'] => {
  const trimmed = preset.trim()
  if (trimmed === 'private') return 'drafts'
  return trimmed === '' ? 'all' : trimmed
}

export async function getEditableCourses(
  page = 1,
  limit = 20,
  query = '',
  sortBy = 'updated',
  preset = '',
): Promise<{ courses: AppCourse[]; total: number; summary: EditableCoursesSummary }> {
  const session = await getSession()
  if (!session) return { courses: [], total: 0, summary: EMPTY_SUMMARY }

  const base: ListCoursesParams = {
    mine: true,
    limit,
    sort: sortBy === 'name' ? 'name' : 'updated',
    preset: toServerPreset(preset),
    ...(query.trim() ? { q: query.trim() } : {}),
  }
  let cursor: string | null | undefined
  let result = await listCourses(base)
  for (let hop = 2; hop <= page && result.next_cursor; hop += 1) {
    cursor = result.next_cursor
    result = await listCourses({ ...base, cursor })
  }

  const courses = result.items.map(toAppCourse)
  const summary = result.summary ?? EMPTY_SUMMARY
  const unfiltered = base.preset === 'all' && !base.q
  // Exact when nothing filters the editable set; otherwise a lower bound that
  // still tells the pager whether a next page exists.
  const total = unfiltered ? summary.total : (page - 1) * limit + courses.length + (result.next_cursor ? 1 : 0)
  return { courses, total, summary }
}

/** Editable courses for the outline template combobox; `[]` on failure. */
export async function searchEditableCourses(query: string, limit = 20): Promise<AppCourse[]> {
  const { courses } = await getEditableCourses(1, limit, query, 'updated').catch(() => ({ courses: [] }))
  return courses
}
