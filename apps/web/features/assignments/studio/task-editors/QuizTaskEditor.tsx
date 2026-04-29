'use client';

import { Check, ListTodo, Plus, Trash2, X } from 'lucide-react';
import * as v from 'valibot';

import { QuizContentsSchema } from '@/schemas/assignmentTaskContents';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { generateUUID } from '@/lib/utils';

import type { AssignmentTaskEditorValue, TaskEditorValidationIssue, TaskTypeEditorModule } from './types';

interface QuizOption {
  optionUUID: string;
  text: string;
  fileID: string;
  type: 'text' | 'image' | 'audio' | 'video';
  assigned_right_answer: boolean;
}

interface QuizQuestion {
  questionUUID: string;
  questionText: string;
  options: QuizOption[];
}

function createOption(): QuizOption {
  return {
    optionUUID: `option_${generateUUID()}`,
    text: '',
    fileID: '',
    type: 'text',
    assigned_right_answer: false,
  };
}

function createQuestion(): QuizQuestion {
  return {
    questionUUID: `question_${generateUUID()}`,
    questionText: '',
    options: [createOption(), createOption()],
  };
}

function normalizeQuizContents(value: AssignmentTaskEditorValue) {
  const rawQuestions = Array.isArray(value.contents.questions) ? value.contents.questions : [createQuestion()];
  const questions = rawQuestions.map((rawQuestion, questionIndex): QuizQuestion => {
    const question = rawQuestion && typeof rawQuestion === 'object' ? (rawQuestion as Record<string, unknown>) : {};
    const rawOptions = Array.isArray(question.options) ? question.options : [createOption(), createOption()];
    return {
      questionUUID: typeof question.questionUUID === 'string' ? question.questionUUID : `question_${questionIndex}`,
      questionText: typeof question.questionText === 'string' ? question.questionText : '',
      options: rawOptions.map((rawOption, optionIndex): QuizOption => {
        const option = rawOption && typeof rawOption === 'object' ? (rawOption as Record<string, unknown>) : {};
        return {
          optionUUID: typeof option.optionUUID === 'string' ? option.optionUUID : `option_${optionIndex}`,
          text: typeof option.text === 'string' ? option.text : '',
          fileID: typeof option.fileID === 'string' ? option.fileID : '',
          type: option.type === 'image' || option.type === 'audio' || option.type === 'video' ? option.type : 'text',
          assigned_right_answer: option.assigned_right_answer === true,
        };
      }),
    };
  });

  const rawSettings = value.contents.settings && typeof value.contents.settings === 'object'
    ? (value.contents.settings as Record<string, unknown>)
    : {};

  return {
    kind: 'QUIZ' as const,
    questions,
    settings: {
      max_attempts: typeof rawSettings.max_attempts === 'number' ? rawSettings.max_attempts : null,
      time_limit_seconds: typeof rawSettings.time_limit_seconds === 'number' ? rawSettings.time_limit_seconds : null,
      max_score_penalty_per_attempt:
        typeof rawSettings.max_score_penalty_per_attempt === 'number'
          ? rawSettings.max_score_penalty_per_attempt
          : null,
      prevent_copy: rawSettings.prevent_copy !== false,
      track_violations: rawSettings.track_violations !== false,
      max_violations: typeof rawSettings.max_violations === 'number' ? rawSettings.max_violations : 2,
      block_on_violations: rawSettings.block_on_violations !== false,
    },
  };
}

function validate(value: AssignmentTaskEditorValue): TaskEditorValidationIssue[] {
  const issues: TaskEditorValidationIssue[] = [];
  if (value.max_grade_value <= 0) issues.push({ code: 'POINTS_REQUIRED', message: 'Points must be greater than 0.' });
  const contents = normalizeQuizContents(value);
  const parsed = v.safeParse(QuizContentsSchema, contents);
  if (!parsed.success) {
    issues.push({ code: 'QUIZ_INVALID', message: parsed.issues[0]?.message ?? 'Quiz content is invalid.' });
  }
  for (const [index, question] of contents.questions.entries()) {
    if (!question.questionText.trim()) {
      issues.push({ code: 'QUESTION_TEXT_REQUIRED', message: `Question ${index + 1} needs text.` });
    }
    if (!question.options.some((option) => option.assigned_right_answer)) {
      issues.push({ code: 'CORRECT_ANSWER_REQUIRED', message: `Question ${index + 1} needs a correct answer.` });
    }
  }
  return issues;
}

function QuizTaskEditorComponent({ value, disabled, onChange }: Parameters<TaskTypeEditorModule['Component']>[0]) {
  const contents = normalizeQuizContents(value);

  const updateContents = (nextContents: ReturnType<typeof normalizeQuizContents>) => {
    onChange({ ...value, contents: nextContents });
  };

  return (
    <div className="space-y-5">
      <div className="rounded-md border bg-muted/40 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ListTodo className="size-4" />
          Quiz task
        </div>
        <p className="text-muted-foreground mt-1 text-sm">Build questions, options, scoring, and quiz controls.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="quiz-attempts">Max attempts</Label>
          <Input
            id="quiz-attempts"
            type="number"
            min={1}
            value={contents.settings.max_attempts ?? ''}
            placeholder="Unlimited"
            disabled={disabled}
            onChange={(event) =>
              updateContents({
                ...contents,
                settings: {
                  ...contents.settings,
                  max_attempts: event.target.value ? Math.max(1, Number(event.target.value) || 1) : null,
                },
              })
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="quiz-time">Time limit, minutes</Label>
          <Input
            id="quiz-time"
            type="number"
            min={1}
            value={contents.settings.time_limit_seconds ? contents.settings.time_limit_seconds / 60 : ''}
            placeholder="No limit"
            disabled={disabled}
            onChange={(event) =>
              updateContents({
                ...contents,
                settings: {
                  ...contents.settings,
                  time_limit_seconds: event.target.value ? Math.max(1, Number(event.target.value) || 1) * 60 : null,
                },
              })
            }
          />
        </div>
        <div className="flex items-center justify-between rounded-md border px-3 py-2">
          <Label htmlFor="quiz-prevent-copy">Prevent copy</Label>
          <Switch
            id="quiz-prevent-copy"
            checked={contents.settings.prevent_copy}
            disabled={disabled}
            onCheckedChange={(checked) =>
              updateContents({ ...contents, settings: { ...contents.settings, prevent_copy: checked } })
            }
          />
        </div>
      </div>

      <div className="space-y-4">
        {contents.questions.map((question, questionIndex) => (
          <div
            key={question.questionUUID}
            className="space-y-3 rounded-md border p-4"
          >
            <div className="flex items-center gap-3">
              <Badge variant="secondary">Q{questionIndex + 1}</Badge>
              <Input
                value={question.questionText}
                placeholder="Question text"
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
              {question.options.map((option, optionIndex) => (
                <div
                  key={option.optionUUID}
                  className="flex items-center gap-2"
                >
                  <Button
                    type="button"
                    variant={option.assigned_right_answer ? 'default' : 'outline'}
                    size="icon"
                    disabled={disabled}
                    onClick={() => {
                      const questions = contents.questions.map((item, index) =>
                        index === questionIndex
                          ? {
                              ...item,
                              options: item.options.map((candidate, candidateIndex) =>
                                candidateIndex === optionIndex
                                  ? { ...candidate, assigned_right_answer: !candidate.assigned_right_answer }
                                  : candidate,
                              ),
                            }
                          : item,
                      );
                      updateContents({ ...contents, questions });
                    }}
                    aria-label="Toggle correct answer"
                  >
                    {option.assigned_right_answer ? <Check className="size-4" /> : <X className="size-4" />}
                  </Button>
                  <Input
                    value={option.text}
                    placeholder={`Option ${String.fromCodePoint(65 + optionIndex)}`}
                    disabled={disabled}
                    onChange={(event) => {
                      const questions = contents.questions.map((item, index) =>
                        index === questionIndex
                          ? {
                              ...item,
                              options: item.options.map((candidate, candidateIndex) =>
                                candidateIndex === optionIndex ? { ...candidate, text: event.target.value } : candidate,
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
                    disabled={disabled || question.options.length <= 1}
                    onClick={() => {
                      const questions = contents.questions.map((item, index) =>
                        index === questionIndex
                          ? { ...item, options: item.options.filter((_, candidateIndex) => candidateIndex !== optionIndex) }
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
                    index === questionIndex ? { ...item, options: [...item.options, createOption()] } : item,
                  );
                  updateContents({ ...contents, questions });
                }}
              >
                <Plus className="size-4" />
                Add option
              </Button>
            </div>
          </div>
        ))}
      </div>

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

export const QuizTaskEditor: TaskTypeEditorModule = {
  type: 'QUIZ',
  label: 'Quiz task',
  description: 'Auto-gradable questions and options.',
  buildDefaultContents: () => normalizeQuizContents({
    assignment_task_uuid: '',
    assignment_type: 'QUIZ',
    title: '',
    description: '',
    hint: '',
    max_grade_value: 1,
    contents: {},
  }),
  validate,
  getPreviewPayload: normalizeQuizContents,
  Component: QuizTaskEditorComponent,
};
