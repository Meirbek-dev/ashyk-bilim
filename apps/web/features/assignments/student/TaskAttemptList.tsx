'use client';

import { FileUp, ListTodo, TextCursorInput } from 'lucide-react';

import type { AssignmentTaskAnswer } from '@/features/assignments/domain';
import type { AssignmentTaskRead } from '@/features/assignments/domain';
import { ChoiceItemAttempt } from '@/features/assessments/items/choice';
import type { ChoiceAttemptItem, ChoiceAnswer } from '@/features/assessments/items/choice';
import { FileUploadAttempt, normalizeFileUploadConstraints } from '@/features/assessments/items/file-upload';
import { FormItemAttempt, normalizeFormItem } from '@/features/assessments/items/form';
import { OpenTextAttempt, normalizeOpenText } from '@/features/assessments/items/open-text';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

import type { AssignmentAnswerMap } from './types';
import { normalizeQuizAnswer } from './attempt-utils';

interface TaskAttemptListProps {
  tasks: AssignmentTaskRead[];
  answers: AssignmentAnswerMap;
  disabled?: boolean;
  courseUuid?: string | null;
  activityUuid?: string | null;
  assignmentUuid: string;
  onAnswerChange: (answer: AssignmentTaskAnswer) => void;
}

export default function TaskAttemptList({
  tasks,
  answers,
  disabled,
  courseUuid,
  activityUuid,
  assignmentUuid,
  onAnswerChange,
}: TaskAttemptListProps) {
  if (tasks.length === 0) {
    return (
      <div className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">No tasks.</div>
    );
  }

  return (
    <div className="space-y-5">
      {tasks.map((task, index) => {
        const answer = answers[task.assignment_task_uuid] ?? null;
        const Icon =
          task.assignment_type === 'QUIZ' ? ListTodo : task.assignment_type === 'FORM' ? TextCursorInput : FileUp;
        return (
          <Card key={task.assignment_task_uuid}>
            <CardContent className="space-y-4 p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">Task {index + 1}</Badge>
                    <Badge variant="outline">
                      <Icon className="size-3" />
                      {task.assignment_type.replaceAll('_', ' ')}
                    </Badge>
                    <Badge variant="outline">{task.max_grade_value} pts</Badge>
                  </div>
                  <h2 className="mt-3 text-lg font-semibold">{task.title || 'Untitled task'}</h2>
                  {task.description ? <p className="text-muted-foreground mt-1 text-sm">{task.description}</p> : null}
                </div>
              </div>

              <AssignmentTaskAttempt
                task={task}
                answer={answer}
                disabled={disabled}
                courseUuid={courseUuid}
                activityUuid={activityUuid}
                assignmentUuid={assignmentUuid}
                onAnswerChange={onAnswerChange}
              />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function AssignmentTaskAttempt({
  task,
  answer,
  disabled,
  courseUuid,
  activityUuid,
  assignmentUuid,
  onAnswerChange,
}: {
  task: AssignmentTaskRead;
  answer: AssignmentTaskAnswer | null;
  disabled?: boolean;
  courseUuid?: string | null;
  activityUuid?: string | null;
  assignmentUuid: string;
  onAnswerChange: (answer: AssignmentTaskAnswer) => void;
}) {
  if (task.assignment_type === 'QUIZ') {
    return (
      <AssignmentQuizAttempt
        task={task}
        answer={answer}
        disabled={disabled}
        onAnswerChange={onAnswerChange}
      />
    );
  }

  if (task.assignment_type === 'FORM') {
    return (
      <FormItemAttempt
        item={{ ...normalizeFormItem(task.contents), taskUuid: task.assignment_task_uuid }}
        answer={answer as { content_type?: 'form'; form_data?: { answers?: Record<string, string> } } | null}
        disabled={disabled}
        onAnswerChange={(nextAnswer) => onAnswerChange(nextAnswer as AssignmentTaskAnswer)}
      />
    );
  }

  if (task.assignment_type === 'OTHER') {
    return (
      <OpenTextAttempt
        item={{ ...normalizeOpenText(task.contents), taskUuid: task.assignment_task_uuid }}
        answer={answer as { text?: string } | null}
        disabled={disabled}
        onAnswerChange={(nextAnswer) => onAnswerChange(nextAnswer as AssignmentTaskAnswer)}
      />
    );
  }

  return (
    <FileUploadAttempt
      item={{
        taskUuid: task.assignment_task_uuid,
        assignmentUuid,
        courseUuid,
        activityUuid,
        referenceFile: task.reference_file,
        constraints: normalizeFileUploadConstraints(task.contents),
      }}
      answer={answer as { content_type?: 'file'; file_key?: string | null } | null}
      disabled={disabled}
      onAnswerChange={(nextAnswer) => onAnswerChange(nextAnswer as AssignmentTaskAnswer)}
    />
  );
}

interface AssignmentQuizQuestion {
  questionUUID?: string;
  questionText?: string;
  options?: { optionUUID?: string; text?: string }[];
}

function AssignmentQuizAttempt({
  task,
  answer,
  disabled,
  onAnswerChange,
}: {
  task: AssignmentTaskRead;
  answer: AssignmentTaskAnswer | null;
  disabled?: boolean;
  onAnswerChange: (answer: AssignmentTaskAnswer) => void;
}) {
  const questions = Array.isArray(task.contents?.questions)
    ? (task.contents.questions as AssignmentQuizQuestion[])
    : [];
  const normalized = normalizeQuizAnswer(answer);

  if (questions.length === 0) {
    return <div className="text-muted-foreground rounded-md border border-dashed p-4 text-sm">No quiz questions.</div>;
  }

  return (
    <div className="space-y-4">
      {questions.map((question, questionIndex) => {
        const questionId = question.questionUUID ?? `question_${questionIndex}`;
        const item: ChoiceAttemptItem = {
          id: questionId,
          kind: 'CHOICE_MULTIPLE',
          prompt: question.questionText || 'Question',
          options: (question.options ?? []).map((option, optionIndex) => ({
            id: option.optionUUID ?? `option_${optionIndex}`,
            text: option.text || 'Option',
          })),
        };
        return (
          <div
            key={questionId}
            className="bg-muted/30 rounded-md border p-4"
          >
            <div className="mb-3 flex items-start gap-2">
              <Badge variant="secondary">Q{questionIndex + 1}</Badge>
              <p className="font-medium">{item.prompt}</p>
            </div>
            <ChoiceItemAttempt
              item={item}
              answer={normalized.answers[questionId] ?? []}
              disabled={disabled}
              onAnswerChange={(nextAnswer: ChoiceAnswer) =>
                onAnswerChange({
                  task_uuid: task.assignment_task_uuid,
                  content_type: 'quiz',
                  quiz_answers: {
                    answers: {
                      ...normalized.answers,
                      [questionId]: Array.isArray(nextAnswer) ? nextAnswer.map(String) : [],
                    },
                  },
                })
              }
            />
          </div>
        );
      })}
    </div>
  );
}
