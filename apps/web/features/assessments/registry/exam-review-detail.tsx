'use client';

/**
 * Exam-specific center-pane panel for GradingReviewWorkspace.
 *
 * Renders a question-level answer breakdown for exam submissions.
 * Fetches exam metadata (to resolve the exam UUID) and questions
 * using the standard exam query options, then renders each answer
 * with type-aware formatting.
 *
 * Phase 2: shown when assessment_type === 'EXAM'. Replaces the
 * generic SubmittedAnswers fallback for exam submissions.
 */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { LoaderCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { examActivityQueryOptions, examQuestionsQueryOptions } from '@/features/exams/queries/exams.query';
import type { KindReviewDetailProps } from './index';

// ── Local types ─────────────────────────────────────────────────────────────────

interface ExamQuestion {
  id: number;
  question_text: string;
  question_type: string;
  answer_options?: Array<{ text: string }>;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function ExamReviewDetail({ submission, activityUuid }: KindReviewDetailProps) {
  // Step 1: resolve exam UUID via the activity → exam lookup
  const { data: examActivity, isLoading: isLoadingExam } = useQuery({
    ...examActivityQueryOptions(activityUuid),
    enabled: Boolean(activityUuid),
  });

  const examUuid = (examActivity as { exam_uuid?: string } | undefined)?.exam_uuid;

  // Step 2: load questions (keyed by question ID for O(1) lookup)
  const { data: questionsRaw, isLoading: isLoadingQuestions } = useQuery({
    ...examQuestionsQueryOptions(examUuid ?? ''),
    enabled: Boolean(examUuid),
  });

  const questions: ExamQuestion[] = Array.isArray(questionsRaw) ? (questionsRaw as ExamQuestion[]) : [];
  const questionsMap = new Map(questions.map((q) => [q.id, q]));

  // answers_json holds the exam answer dict keyed by question ID (string)
  const answersRaw = submission.answers_json as Record<string, unknown> | null | undefined;
  const answerEntries = answersRaw ? Object.entries(answersRaw) : [];

  // Violations may be embedded in answers_json.violations once the backend projects
  // ExamAttempt into Submission.
  const violations = Array.isArray((answersRaw as Record<string, unknown> | undefined)?.['violations'])
    ? (answersRaw as Record<string, unknown[]>)['violations']
    : [];

  if (isLoadingExam || isLoadingQuestions) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" />
        Loading exam data…
      </div>
    );
  }

  if (answerEntries.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
        {examUuid
          ? 'No answer payload was recorded for this exam submission.'
          : 'Exam data is not available yet. Backend projection of exam attempts to Submission is pending.'}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Violations summary */}
      {violations.length > 0 && (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h4 className="text-sm font-semibold text-amber-900">
            {violations.length} violation{violations.length !== 1 ? 's' : ''} recorded
          </h4>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-amber-800">
            {violations.map((v, i) => {
              const vv = v as { type?: string; timestamp?: string };
              return (
                <li key={i}>
                  {vv.type ?? 'Unknown'} — {vv.timestamp ? new Date(vv.timestamp).toLocaleString() : '--'}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Per-question answers */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Answers</h3>
        {answerEntries.map(([qid, userAnswer], index) => {
          const question = questionsMap.get(Number(qid));
          const opts = question?.answer_options ?? [];

          return (
            <div key={qid} className="rounded-lg border bg-card p-4">
              <div className="mb-2 flex items-center gap-2">
                <Badge variant="secondary">Q{index + 1}</Badge>
                {question?.question_type && (
                  <Badge variant="outline">{question.question_type.replaceAll('_', ' ')}</Badge>
                )}
              </div>
              {question && (
                <p className="mb-2 text-sm font-medium">{question.question_text}</p>
              )}
              <div className="text-sm text-muted-foreground">
                {renderAnswer(question?.question_type, userAnswer, opts)}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}

// ── Answer renderer ────────────────────────────────────────────────────────────

function renderAnswer(
  questionType: string | undefined,
  userAnswer: unknown,
  opts: Array<{ text: string }>,
): React.ReactNode {
  switch (questionType) {
    case 'SINGLE_CHOICE':
    case 'TRUE_FALSE': {
      return <span>{opts[userAnswer as number]?.text ?? String(userAnswer)}</span>;
    }
    case 'MULTIPLE_CHOICE': {
      const indices = Array.isArray(userAnswer) ? (userAnswer as number[]) : [];
      const texts = indices.map((idx) => opts[idx]?.text ?? String(idx)).join(', ');
      return <span>{texts || '—'}</span>;
    }
    case 'MATCHING': {
      const pairs =
        typeof userAnswer === 'object' && userAnswer !== null
          ? (userAnswer as Record<string, string>)
          : {};
      return (
        <div className="space-y-1">
          {Object.entries(pairs).map(([left, right]) => (
            <div key={left} className="text-xs">
              {left} → {right}
            </div>
          ))}
        </div>
      );
    }
    default: {
      if (
        typeof userAnswer === 'string' ||
        typeof userAnswer === 'number' ||
        typeof userAnswer === 'boolean'
      ) {
        return <span>{String(userAnswer)}</span>;
      }
      return (
        <pre className="max-h-40 overflow-auto rounded bg-muted p-2 text-xs">
          {JSON.stringify(userAnswer, null, 2)}
        </pre>
      );
    }
  }
}
