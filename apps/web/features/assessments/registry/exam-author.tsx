'use client';

import { useMemo } from 'react';

import PageLoading from '@components/Objects/Loaders/PageLoading';
import { useExamActivity, useExamQuestions } from '@/features/exams/hooks/useExam';
import type { KindAuthorProps } from './index';
import QuestionManagement from './exam/QuestionManagement';

export default function ExamAuthor({ activityUuid }: KindAuthorProps) {
  const { data: exam, isLoading: isExamLoading } = useExamActivity(activityUuid);
  const examUuid = (exam as { exam_uuid?: string } | null | undefined)?.exam_uuid ?? null;
  const { data: questions, isLoading: isQuestionsLoading, refetch: refetchQuestions } = useExamQuestions(examUuid);
  const questionList = useMemo(() => (Array.isArray(questions) ? questions : []), [questions]);

  if (isExamLoading || isQuestionsLoading) return <PageLoading />;

  if (!exam || !examUuid) {
    return (
      <div className="text-muted-foreground rounded-md border border-dashed p-6 text-sm">
        Exam data is unavailable for this activity.
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6">
      <QuestionManagement
        examUuid={examUuid}
        questions={questionList}
        onQuestionsChange={() => {
          void refetchQuestions();
        }}
      />
    </div>
  );
}
