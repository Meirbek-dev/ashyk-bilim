'use client';

import CodeChallengeStudio from './code-challenge/CodeChallengeStudio';
import type { KindAuthorProps } from './index';

export default function CodeChallengeAuthor({ activityUuid }: KindAuthorProps) {
  return <CodeChallengeStudio activityUuid={activityUuid} />;
}
