'use client';

import { Plus, TextCursorInput, Trash2 } from 'lucide-react';
import * as v from 'valibot';

import { FormContentsSchema } from '@/schemas/assignmentTaskContents';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { generateUUID } from '@/lib/utils';

import type { AssignmentTaskEditorValue, TaskEditorValidationIssue, TaskTypeEditorModule } from './types';

interface FormBlank {
  blankUUID: string;
  placeholder: string;
  correctAnswer: string;
  hint: string;
}

interface FormQuestion {
  questionUUID: string;
  questionText: string;
  blanks: FormBlank[];
}

function createBlank(): FormBlank {
  return {
    blankUUID: `blank_${generateUUID()}`,
    placeholder: '',
    correctAnswer: '',
    hint: '',
  };
}

function createQuestion(): FormQuestion {
  return {
    questionUUID: `question_${generateUUID()}`,
    questionText: '',
    blanks: [createBlank()],
  };
}

function normalizeFormContents(value: AssignmentTaskEditorValue) {
  const rawQuestions = Array.isArray(value.contents.questions) ? value.contents.questions : [createQuestion()];
  return {
    kind: 'FORM' as const,
    questions: rawQuestions.map((rawQuestion, questionIndex): FormQuestion => {
      const question = rawQuestion && typeof rawQuestion === 'object' ? (rawQuestion as Record<string, unknown>) : {};
      const rawBlanks = Array.isArray(question.blanks) ? question.blanks : [createBlank()];
      return {
        questionUUID: typeof question.questionUUID === 'string' ? question.questionUUID : `question_${questionIndex}`,
        questionText: typeof question.questionText === 'string' ? question.questionText : '',
        blanks: rawBlanks.map((rawBlank, blankIndex): FormBlank => {
          const blank = rawBlank && typeof rawBlank === 'object' ? (rawBlank as Record<string, unknown>) : {};
          return {
            blankUUID: typeof blank.blankUUID === 'string' ? blank.blankUUID : `blank_${blankIndex}`,
            placeholder: typeof blank.placeholder === 'string' ? blank.placeholder : '',
            correctAnswer: typeof blank.correctAnswer === 'string' ? blank.correctAnswer : '',
            hint: typeof blank.hint === 'string' ? blank.hint : '',
          };
        }),
      };
    }),
  };
}

function validate(value: AssignmentTaskEditorValue): TaskEditorValidationIssue[] {
  const issues: TaskEditorValidationIssue[] = [];
  if (value.max_grade_value <= 0) issues.push({ code: 'POINTS_REQUIRED', message: 'Points must be greater than 0.' });
  const contents = normalizeFormContents(value);
  const parsed = v.safeParse(FormContentsSchema, contents);
  if (!parsed.success) {
    issues.push({ code: 'FORM_INVALID', message: parsed.issues[0]?.message ?? 'Form content is invalid.' });
  }
  for (const [index, question] of contents.questions.entries()) {
    if (!question.questionText.trim()) {
      issues.push({ code: 'QUESTION_TEXT_REQUIRED', message: `Question ${index + 1} needs text.` });
    }
  }
  return issues;
}

function FormTaskEditorComponent({ value, disabled, onChange }: Parameters<TaskTypeEditorModule['Component']>[0]) {
  const contents = normalizeFormContents(value);
  const updateContents = (nextContents: ReturnType<typeof normalizeFormContents>) => {
    onChange({ ...value, contents: nextContents });
  };

  return (
    <div className="space-y-5">
      <div className="rounded-md border bg-muted/40 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <TextCursorInput className="size-4" />
          Form task
        </div>
        <p className="text-muted-foreground mt-1 text-sm">Create fill-in fields with optional correct answers.</p>
      </div>

      {contents.questions.map((question, questionIndex) => (
        <div
          key={question.questionUUID}
          className="space-y-3 rounded-md border p-4"
        >
          <div className="flex items-center gap-3">
            <Badge variant="secondary">Q{questionIndex + 1}</Badge>
            <Input
              value={question.questionText}
              placeholder="Question or prompt"
              disabled={disabled}
              onChange={(event) => {
                const questions = contents.questions.map((item, index) =>
                  index === questionIndex ? { ...item, questionText: event.target.value } : item,
                );
                updateContents({ ...contents, questions });
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={disabled || contents.questions.length <= 1}
              onClick={() =>
                updateContents({
                  ...contents,
                  questions: contents.questions.filter((_, index) => index !== questionIndex),
                })
              }
            >
              <Trash2 className="size-4" />
            </Button>
          </div>

          <div className="space-y-2 pl-10">
            {question.blanks.map((blank, blankIndex) => (
              <div
                key={blank.blankUUID}
                className="grid gap-2 rounded-md border bg-background p-3 md:grid-cols-[1fr_1fr_1fr_auto]"
              >
                <Input
                  value={blank.placeholder}
                  placeholder="Student field label"
                  disabled={disabled}
                  onChange={(event) => {
                    const questions = contents.questions.map((item, index) =>
                      index === questionIndex
                        ? {
                            ...item,
                            blanks: item.blanks.map((candidate, candidateIndex) =>
                              candidateIndex === blankIndex ? { ...candidate, placeholder: event.target.value } : candidate,
                            ),
                          }
                        : item,
                    );
                    updateContents({ ...contents, questions });
                  }}
                />
                <Input
                  value={blank.correctAnswer}
                  placeholder="Correct answer"
                  disabled={disabled}
                  onChange={(event) => {
                    const questions = contents.questions.map((item, index) =>
                      index === questionIndex
                        ? {
                            ...item,
                            blanks: item.blanks.map((candidate, candidateIndex) =>
                              candidateIndex === blankIndex
                                ? { ...candidate, correctAnswer: event.target.value }
                                : candidate,
                            ),
                          }
                        : item,
                    );
                    updateContents({ ...contents, questions });
                  }}
                />
                <Input
                  value={blank.hint}
                  placeholder="Hint"
                  disabled={disabled}
                  onChange={(event) => {
                    const questions = contents.questions.map((item, index) =>
                      index === questionIndex
                        ? {
                            ...item,
                            blanks: item.blanks.map((candidate, candidateIndex) =>
                              candidateIndex === blankIndex ? { ...candidate, hint: event.target.value } : candidate,
                            ),
                          }
                        : item,
                    );
                    updateContents({ ...contents, questions });
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={disabled || question.blanks.length <= 1}
                  onClick={() => {
                    const questions = contents.questions.map((item, index) =>
                      index === questionIndex
                        ? { ...item, blanks: item.blanks.filter((_, candidateIndex) => candidateIndex !== blankIndex) }
                        : item,
                    );
                    updateContents({ ...contents, questions });
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => {
                const questions = contents.questions.map((item, index) =>
                  index === questionIndex ? { ...item, blanks: [...item.blanks, createBlank()] } : item,
                );
                updateContents({ ...contents, questions });
              }}
            >
              <Plus className="size-4" />
              Add blank
            </Button>
          </div>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => updateContents({ ...contents, questions: [...contents.questions, createQuestion()] })}
      >
        <Plus className="size-4" />
        Add question
      </Button>
    </div>
  );
}

export const FormTaskEditor: TaskTypeEditorModule = {
  type: 'FORM',
  label: 'Form task',
  description: 'Structured written responses.',
  buildDefaultContents: () => normalizeFormContents({
    assignment_task_uuid: '',
    assignment_type: 'FORM',
    title: '',
    description: '',
    hint: '',
    max_grade_value: 1,
    contents: {},
  }),
  validate,
  getPreviewPayload: normalizeFormContents,
  Component: FormTaskEditorComponent,
};
