'use client'

import { CodeChallengeBuilder } from '@/features/code-arena/authoring'
import type { KindAuthorProps } from './index'

export default function CodeChallengeAuthor({ activityUuid, courseUuid }: KindAuthorProps) {
  return <CodeChallengeBuilder activityUuid={activityUuid} courseUuid={courseUuid} />
}
