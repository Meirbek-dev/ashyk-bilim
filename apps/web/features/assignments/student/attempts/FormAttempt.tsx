'use client';

import type { AssignmentTaskAnswer } from '@/features/assignments/domain';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';

import { normalizeFormAnswer } from '../attempt-utils';
import type { AttemptProps } from '../types';

interface FormQuestion {
  questionUUID?: string;
  questionText?: string;
  blanks?: Array<{ blankUUID?: string; placeholder?: string; hint?: string }>;
}

export default function FormAttempt({ task, answer, disabled, onChange }: AttemptProps) {
  const questions = Array.isArray(task.contents?.questions) ? (task.contents.questions as FormQuestion[]) : [];
  const normalized = normalizeFormAnswer(answer);

  const updateBlank = (blankId: string, value: string) => {
    const taskAnswer: AssignmentTaskAnswer = {
      task_uuid: task.assignment_task_uuid,
      content_type: 'form',
      form_data: {
        answers: {
          ...normalized.answers,
          [blankId]: value,
        },
      },
    };
    onChange(taskAnswer);
  };

  if (questions.length === 0) {
    return <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No form fields.</div>;
  }

  return (
    <div className="space-y-4">
      {questions.map((question, questionIndex) => (
        <div
          key={question.questionUUID ?? questionIndex}
          className="rounded-md border bg-muted/30 p-4"
        >
          <div className="mb-3 flex items-start gap-2">
            <Badge variant="secondary">Q{questionIndex + 1}</Badge>
            <p className="font-medium">{question.questionText || 'Prompt'}</p>
          </div>
          <div className="grid gap-3">
            {(question.blanks ?? []).map((blank, blankIndex) => {
              const blankId = blank.blankUUID ?? `blank_${blankIndex}`;
              return (
                <div
                  key={blankId}
                  className="space-y-2"
                >
                  <Label htmlFor={`${task.assignment_task_uuid}-${blankId}`}>
                    {blank.placeholder || `Answer ${blankIndex + 1}`}
                  </Label>
                  <Input
                    id={`${task.assignment_task_uuid}-${blankId}`}
                    value={normalized.answers[blankId] ?? ''}
                    disabled={disabled}
                    onChange={(event) => updateBlank(blankId, event.target.value)}
                  />
                  {blank.hint ? <p className="text-xs text-muted-foreground">{blank.hint}</p> : null}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
