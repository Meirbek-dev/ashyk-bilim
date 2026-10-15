import * as v from 'valibot'

import { m } from '#/paraglide/messages'
import type { CourseLearning, LearningInput } from '#/shared/api/gen/types.gen'

// "What you'll learn" edited as text, one point per line; a leading emoji stays the point's emoji.

/** `UpdateCourseRequest.learnings`: at most 30 points of 1..=300 characters (server `validate_learnings`). */
export const MAX_LEARNINGS = 30
export const MAX_LEARNING_LENGTH = 300
const MAX_EMOJI_LENGTH = 16

/** Unicode scalars, as the server counts (`chars()`), not UTF-16 units. */
const chars = (text: string): number => Array.from(text).length

const EMOJI = /^(\p{Extended_Pictographic}(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|‍|️)*)\s+(.+)$/u

const lines = (text: string): string[] =>
  text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)

export const learningsText = (learnings: readonly Pick<CourseLearning, 'emoji' | 'text'>[]): string =>
  learnings.map(learning => (learning.emoji ? `${learning.emoji} ${learning.text}` : learning.text)).join('\n')

export function parseLearnings(text: string): LearningInput[] {
  return lines(text).map(line => {
    const match = EMOJI.exec(line)
    return match?.[1] && match[2] && chars(match[1]) <= MAX_EMOJI_LENGTH
      ? { emoji: match[1], text: match[2] }
      : { text: line }
  })
}

export const learningsSchema = v.object({
  learnings: v.pipe(
    v.string(),
    v.check(
      text => lines(text).length <= MAX_LEARNINGS,
      () => m.studio_learnings_too_many({ max: MAX_LEARNINGS }),
    ),
    v.check(
      text => parseLearnings(text).every(point => chars(point.text) <= MAX_LEARNING_LENGTH),
      () => m.studio_learnings_too_long({ max: MAX_LEARNING_LENGTH }),
    ),
  ),
})
