'use client';

import React from 'react';
import type { KindReviewDetailProps } from './index';
import { getCanonicalAnswersByItem, SubmittedAnswers } from '@/features/grading/review/components/SubmissionInspector';

export default function ExamReviewDetail({ submission, activityUuid }: KindReviewDetailProps) {
  return (
    <SubmittedAnswers
      submission={submission}
      activityUuid={activityUuid}
      answersByItem={getCanonicalAnswersByItem(submission)}
    />
  );
}
