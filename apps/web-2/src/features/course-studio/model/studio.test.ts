import * as v from 'valibot'
import { describe, expect, test } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import type { Block, Contributor, CourseSummary } from '#/shared/api/gen/types.gen'

import { coursesSearchSchema } from '../route'
import { courseStatus, presetCount } from './course'
import {
  certificateConfig,
  certificateFields,
  certificateFieldsSchema,
  createPlan,
  fileContent,
  mediaSource,
  readinessCode,
  readinessTarget,
  replacedMediaBlockIds,
  splitRoster,
  youtubeProblem,
  youtubeSchema,
} from './studio'

const summary: CourseSummary = { total: 9, private: 3, ready: 5, archived: 1, attention: 0 }

describe('course list', () => {
  test('B-CST-01 status: archived wins over published, otherwise public = published', () => {
    expect(courseStatus({ public: true, archived_at_unix: 1 })).toBe('archived')
    expect(courseStatus({ public: true, archived_at_unix: null })).toBe('published')
    expect(courseStatus({ public: false, archived_at_unix: null })).toBe('draft')
  })

  test('B-CST-01 the header count comes from the server summary of the preset', () => {
    expect(presetCount(summary, undefined)).toBe(9)
    expect(presetCount(summary, 'drafts')).toBe(3)
    expect(presetCount(summary, 'published')).toBe(5)
    expect(presetCount(summary, 'archived')).toBe(1)
  })

  test('B-CST-02 a blank search is no search; an unknown preset is rejected; an unknown sort is the default', () => {
    expect(v.parse(coursesSearchSchema, { q: '  ', preset: 'drafts' })).toEqual({
      q: undefined,
      preset: 'drafts',
      sort: undefined,
    })
    expect(v.safeParse(coursesSearchSchema, { preset: 'recent' }).success).toBe(false)
    expect(v.parse(coursesSearchSchema, { sort: 'name' }).sort).toBe('name')
    expect(v.parse(coursesSearchSchema, { sort: 'progress' }).sort).toBeUndefined()
  })
})

describe('readiness', () => {
  test('B-CST-05 every item links to where it is fixed', () => {
    expect(readinessTarget({ code: 'assessment-not-ready', activity_id: 'a1', title: 'Quiz' })).toEqual({
      activityId: 'a1',
    })
    expect(readinessTarget({ code: 'thumbnail-missing', activity_id: null, title: null })).toEqual({ tab: 'settings' })
    expect(readinessTarget({ code: 'certificate-not-configured', activity_id: null, title: null })).toEqual({
      tab: 'settings',
    })
    expect(readinessTarget({ code: 'no-live-activity', activity_id: null, title: null })).toEqual({ tab: 'content' })
  })

  test('B-CST-05 an unknown code is still listed (generic text), a known one maps to its text', () => {
    expect(readinessCode('activity-unpublished')).toBe('activity-unpublished')
    expect(readinessCode('something-new')).toBeNull()
  })
})

describe('creating an activity', () => {
  test('B-CST-08 quiz, exam and code go through the assessment door', () => {
    expect(createPlan('quiz', 'youtube')).toEqual({ door: 'assessment', kind: 'quiz' })
    expect(createPlan('exam', 'youtube')).toEqual({ door: 'assessment', kind: 'exam' })
    expect(createPlan('code_challenge', 'file')).toEqual({ door: 'assessment', kind: 'code_challenge' })
  })

  test('B-CST-08 file submission through its config; page, video and PDF as activities with the server pair', () => {
    expect(createPlan('file_submission', 'youtube')).toEqual({ door: 'file-submission' })
    expect(createPlan('dynamic', 'youtube')).toMatchObject({
      activity_type: 'dynamic',
      activity_sub_type: 'dynamic_page',
    })
    expect(createPlan('video', 'youtube')).toMatchObject({ activity_sub_type: 'video_youtube' })
    expect(createPlan('video', 'file')).toMatchObject({ activity_sub_type: 'video_hosted' })
    expect(createPlan('document', 'file')).toMatchObject({
      activity_type: 'document',
      activity_sub_type: 'document_pdf',
    })
  })
})

const row = (patch: Partial<Contributor>): Contributor => ({
  avatar_key: null,
  version: 1,
  allowed_actions: [],
  user_id: 'u',
  username: 'u',
  display_name: 'U',
  role: 'contributor',
  status: 'active',
  created_at_unix: 0,
  ...patch,
})

describe('team', () => {
  test('B-CST-15 the team keeps the server order; applications and deactivated co-authors are listed apart', () => {
    const rows = [
      row({ user_id: 'c', role: 'creator' }),
      row({ user_id: 'p', status: 'pending' }),
      row({ user_id: 'm', role: 'maintainer' }),
      row({ user_id: 'x', status: 'inactive' }),
    ]
    const { team, pending, inactive } = splitRoster(rows)
    expect(team.map(r => r.user_id)).toEqual(['c', 'm'])
    expect(pending.map(r => r.user_id)).toEqual(['p'])
    expect(inactive.map(r => r.user_id)).toEqual(['x'])
  })
})

describe('certificate', () => {
  test('B-CST-21 printed fields default to automatic values and omit optional training details', () => {
    expect(certificateFields({})).toEqual({
      certification_name: '',
      certification_type: 'completion',
      certificate_instructor: '',
      course_start: '',
      course_end: '',
      training_hours: '',
    })
    expect(certificateFields({ certification_type: 'workshop', certification_name: 'X' })).toMatchObject({
      certification_name: 'X',
      certification_type: 'completion',
    })
  })

  test('B-CST-21 saving keeps the keys this page does not edit', () => {
    const fields = {
      ...certificateFields({}),
      certification_name: 'N',
      certification_type: 'mastery' as const,
      certificate_instructor: 'T',
    }
    expect(certificateConfig({ certificate_pattern: 'royal', certification_name: 'old' }, fields)).toEqual({
      certificate_pattern: 'royal',
      ...fields,
    })
  })

  test('B-CST-21 dates and hours are optional, with calendar, ordering and whole-hour validation', () => {
    const fields = certificateFields({})
    expect(v.safeParse(certificateFieldsSchema, fields).success).toBe(true)
    expect(
      v.safeParse(certificateFieldsSchema, {
        ...fields,
        course_start: '2026-09-01',
        course_end: '2026-09-30',
        training_hours: '72',
      }).success,
    ).toBe(true)
    for (const patch of [
      { course_start: '2026-02-30' },
      { course_start: '2026-09-30', course_end: '2026-09-01' },
      { training_hours: '0' },
      { training_hours: '1.5' },
    ]) {
      expect(v.safeParse(certificateFieldsSchema, { ...fields, ...patch }).success).toBe(false)
    }
  })
})

const block = (id: string, block_type: string): Block => ({
  id,
  block_type,
  activity_id: 'a',
  created_at_unix: 1,
  content: { file_key: id, file_name: id, file_size: 1, file_type: 'video/mp4' },
})

describe('media', () => {
  test('B-CST-29 replacing media releases old media claims and preserves the new file and editor blocks', () => {
    const blocks = [block('old', 'video'), block('new', 'video'), block('image', 'image'), block('pdf', 'pdf')]
    expect(replacedMediaBlockIds(blocks, 'video', 'new')).toEqual(['old'])
    expect(replacedMediaBlockIds(blocks, 'pdf', 'pdf')).toEqual([])
  })
  test('B-CST-29 a YouTube link must be a video the player can embed, over https', () => {
    expect(v.safeParse(youtubeSchema, { uri: ' https://youtu.be/dQw4w9WgXcQ?si=x ' }).output).toEqual({
      uri: 'https://youtu.be/dQw4w9WgXcQ?si=x',
    })
    for (const uri of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s',
      'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      'https://www.youtube.com/live/dQw4w9WgXcQ?si=x',
    ])
      expect({ uri, ok: v.safeParse(youtubeSchema, { uri }).success }).toEqual({ uri, ok: true })
    for (const uri of [
      'https://www.youtube.com/watch?v=1',
      'https://www.youtube.com/@channel',
      'https://vimeo.com/1',
      'http://youtu.be/dQw4w9WgXcQ',
      'dQw4w9WgXcQ',
    ])
      expect({ uri, ok: v.safeParse(youtubeSchema, { uri }).success }).toEqual({ uri, ok: false })
  })

  test('B-CST-29 a refused YouTube link says what is wrong with it', () => {
    expect(youtubeProblem('dQw4w9WgXcQ')).toBe('not-link')
    expect(youtubeProblem('http://youtu.be/dQw4w9WgXcQ')).toBe('not-link')
    expect(youtubeProblem('https://vimeo.com/1')).toBe('not-youtube')
    expect(youtubeProblem('https://www.youtube.com/@channel')).toBe('no-video')
    expect(youtubeProblem('https://m.youtube.com/watch?v=dQw4w9WgXcQ')).toBeNull()
    expect(v.safeParse(youtubeSchema, { uri: 'https://vimeo.com/1' }).issues?.[0]?.message).toBe(
      m.studio_youtube_not_youtube(),
    )
  })

  test('B-CST-29 stored shapes: YouTube {uri}, an uploaded file {filename: key, file_name}', () => {
    expect(mediaSource({ activity_sub_type: 'video_youtube', content: { uri: 'https://youtu.be/a' } })).toEqual({
      kind: 'youtube',
      uri: 'https://youtu.be/a',
    })
    const content = fileContent({ id: 'up1', key: 'k/v.mp4', size_bytes: 1 }, 'v.mp4')
    expect(content).toEqual({ filename: 'k/v.mp4', upload_id: 'up1', file_name: 'v.mp4' })
    expect(mediaSource({ activity_sub_type: 'video_hosted', content })).toEqual({
      kind: 'file',
      key: 'k/v.mp4',
      name: 'v.mp4',
    })
    expect(mediaSource({ activity_sub_type: 'document_pdf', content: {} })).toEqual({ kind: 'none' })
  })
})
