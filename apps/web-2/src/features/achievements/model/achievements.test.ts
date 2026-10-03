import { describe, expect, test } from 'vite-plus/test'

import type { Profile } from '#/shared/api/gen/types.gen'

import { activeStreak, homeStreak, levelProgress } from './achievements'

const DAY = 86_400
const NOW = 20_729 * DAY + 3600 // 01:00 UTC

const profile = (patch: Partial<Profile>): Profile => ({
  created_at_unix: 0,
  daily_xp_earned: 0,
  learning_streak: 0,
  last_learning_at_unix: null,
  last_login_at_unix: null,
  last_xp_award_at_unix: null,
  level: 3,
  level_progress_percent: 37.5,
  login_streak: 0,
  longest_learning_streak: 0,
  longest_login_streak: 0,
  preferences: {},
  total_activities_completed: 0,
  total_courses_completed: 0,
  total_xp: 375,
  updated_at_unix: 0,
  user_id: 'u',
  xp_in_current_level: 75,
  xp_to_next_level: 125,
  ...patch,
})

describe('achievements model', () => {
  test('B-ACH-02 level progress comes from the server fields; the last level has no next one', () => {
    expect(levelProgress(profile({}))).toEqual({ percent: 38, next: 4, left: 125 })
    expect(levelProgress(profile({ level: 100, xp_to_next_level: 0, level_progress_percent: 0 }))).toEqual({
      percent: 100,
      next: null,
      left: 0,
    })
  })

  test('B-ACH-03 a streak counts while its last day is today or yesterday (UTC), otherwise it is 0', () => {
    expect(activeStreak(5, NOW - 1800, NOW)).toBe(5)
    expect(activeStreak(5, NOW - 2 * 3600, NOW)).toBe(5) // 23:00 yesterday UTC
    expect(activeStreak(5, NOW - DAY - 3 * 3600, NOW)).toBe(0) // two UTC days ago
    expect(activeStreak(5, null, NOW)).toBe(0)
  })

  test('B-ACH-08 the /home line shows a live learning streak and nothing otherwise', () => {
    expect(homeStreak(profile({ learning_streak: 4, last_learning_at_unix: NOW - 60 }), NOW)).toBe(4)
    expect(homeStreak(profile({ learning_streak: 4, last_learning_at_unix: NOW - 3 * DAY }), NOW)).toBeNull()
    expect(homeStreak(profile({ learning_streak: 0, last_learning_at_unix: NOW }), NOW)).toBeNull()
  })
})
