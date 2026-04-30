'use client';

import * as v from 'valibot';

import type { AssignmentTaskType } from '@/features/assignments/domain';
import { ChoiceItemAuthor } from '@/features/assessments/items/choice';
import type { ChoiceAuthorValue } from '@/features/assessments/items/choice';
import { FileUploadConstraintsEditor, normalizeFileUploadConstraints } from '@/features/assessments/items/file-upload';
import { FormItemAuthor, normalizeFormItem } from '@/features/assessments/items/form';
import { OpenTextAuthor, normalizeOpenText } from '@/features/assessments/items/open-text';
import { FileContentsSchema, FormContentsSchema, QuizContentsSchema } from '@/schemas/assignmentTaskContents';
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

function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function normalizeQuizContents(value: AssignmentTaskEditorValue) {
  const rawQuestions = Array.isArray(value.contents.questions) ? value.contents.questions : [createQuizQuestion()];
  const rawSettings =
    value.contents.settings && typeof value.contents.settings === 'object'
      ? (value.contents.settings as Record<string, unknown>)
      : {};

  return {
    kind: 'QUIZ' as const,
    questions: rawQuestions.map((rawQuestion, questionIndex): QuizQuestion => {
      const question = rawQuestion && typeof rawQuestion === 'object' ? (rawQuestion as Record<string, unknown>) : {};
      const rawOptions = Array.isArray(question.options) ? question.options : [createQuizOption(), createQuizOption()];
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
    }),
    settings: {
      max_attempts: typeof rawSettings.max_attempts === 'number' ? rawSettings.max_attempts : null,
      time_limit_seconds: typeof rawSettings.time_limit_seconds === 'number' ? rawSettings.time_limit_seconds : null,
      max_score_penalty_per_attempt:
        typeof rawSettings.max_score_penalty_per_attempt === 'number'
          ? rawSettings.max_score_penalty_per_attempt
          : null,
    },
  };
}

function createQuizOption(): QuizOption {
  return {
    optionUUID: createId('option'),
    text: '',
    fileID: '',
    type: 'text',
    assigned_right_answer: false,
  };
}

function createQuizQuestion(): QuizQuestion {
  return {
    questionUUID: createId('question'),
    questionText: '',
    options: [createQuizOption(), createQuizOption()],
  };
}

function validatePoints(value: AssignmentTaskEditorValue): TaskEditorValidationIssue[] {
  return value.max_grade_value <= 0 ? [{ code: 'POINTS_REQUIRED', message: 'Points must be greater than 0.' }] : [];
}

function FileEditorComponent({ value, disabled, onChange }: Parameters<TaskTypeEditorModule['Component']>[0]) {
  return (
    <FileUploadConstraintsEditor
      value={normalizeFileUploadConstraints(value.contents)}
      disabled={disabled}
      onChange={(contents) => onChange({ ...value, contents: contents as unknown as Record<string, unknown> })}
    />
  );
}

function FormEditorComponent({ value, disabled, onChange }: Parameters<TaskTypeEditorModule['Component']>[0]) {
  return (
    <FormItemAuthor
      value={normalizeFormItem(value.contents)}
      disabled={disabled}
      onChange={(contents) => onChange({ ...value, contents: contents as unknown as Record<string, unknown> })}
    />
  );
}

function TextEditorComponent({ value, disabled, onChange }: Parameters<TaskTypeEditorModule['Component']>[0]) {
  return (
    <OpenTextAuthor
      value={normalizeOpenText(value.contents)}
      disabled={disabled}
      onChange={(contents) => onChange({ ...value, contents: contents as unknown as Record<string, unknown> })}
    />
  );
}

function QuizEditorComponent({ value, disabled, onChange }: Parameters<TaskTypeEditorModule['Component']>[0]) {
  const contents = normalizeQuizContents(value);

  return (
    <div className="space-y-5">
      {contents.questions.map((question, questionIndex) => {
        const choiceValue: ChoiceAuthorValue = {
          kind: 'CHOICE_MULTIPLE',
          prompt: question.questionText,
          options: question.options.map((option) => ({
            id: option.optionUUID,
            text: option.text,
            isCorrect: option.assigned_right_answer,
          })),
        };
        return (
          <div
            key={question.questionUUID}
            className="rounded-md border p-4"
          >
            <ChoiceItemAuthor
              value={choiceValue}
              disabled={disabled}
              onChange={(nextChoice) => {
                if (nextChoice.kind === 'MATCHING') return;
                const questions = contents.questions.map((candidate, candidateIndex) =>
                  candidateIndex === questionIndex
                    ? {
                        ...candidate,
                        questionText: nextChoice.prompt,
                        options: nextChoice.options.map((option) => ({
                          optionUUID: String(option.id),
                          text: option.text,
                          fileID: '',
                          type: 'text' as const,
                          assigned_right_answer: option.isCorrect === true,
                        })),
                      }
                    : candidate,
                );
                onChange({ ...value, contents: { ...contents, questions } });
              }}
            />
          </div>
        );
      })}
      <button
        type="button"
        className="border-input bg-background hover:bg-accent hover:text-accent-foreground inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm font-medium"
        disabled={disabled}
        onClick={() =>
          onChange({ ...value, contents: { ...contents, questions: [...contents.questions, createQuizQuestion()] } })
        }
      >
        Add question
      </button>
    </div>
  );
}

const FileTaskEditor: TaskTypeEditorModule = {
  type: 'FILE_SUBMISSION',
  label: 'File task',
  description: 'Upload-based task with file constraints.',
  buildDefaultContents: () => normalizeFileUploadConstraints(null) as unknown as Record<string, unknown>,
  validate: (value) => {
    const issues = validatePoints(value);
    const parsed = v.safeParse(FileContentsSchema, {
      ...normalizeFileUploadConstraints(value.contents),
      kind: 'FILE_SUBMISSION',
    });
    if (!parsed.success) {
      issues.push({ code: 'FILE_CONFIG_INVALID', message: parsed.issues[0]?.message ?? 'File settings are invalid.' });
    }
    return issues;
  },
  getPreviewPayload: (value) => ({ ...normalizeFileUploadConstraints(value.contents), kind: 'FILE_SUBMISSION' }),
  Component: FileEditorComponent,
};

const FormTaskEditor: TaskTypeEditorModule = {
  type: 'FORM',
  label: 'Form task',
  description: 'Structured written responses.',
  buildDefaultContents: () => normalizeFormItem(null) as unknown as Record<string, unknown>,
  validate: (value) => {
    const issues = validatePoints(value);
    const contents = normalizeFormItem(value.contents);
    const parsed = v.safeParse(FormContentsSchema, contents);
    if (!parsed.success)
      issues.push({ code: 'FORM_INVALID', message: parsed.issues[0]?.message ?? 'Form content is invalid.' });
    return issues;
  },
  getPreviewPayload: (value) => normalizeFormItem(value.contents) as unknown as Record<string, unknown>,
  Component: FormEditorComponent,
};

const QuizTaskEditor: TaskTypeEditorModule = {
  type: 'QUIZ',
  label: 'Quiz task',
  description: 'Auto-gradable questions and options.',
  buildDefaultContents: () =>
    normalizeQuizContents({
      assignment_task_uuid: '',
      assignment_type: 'QUIZ',
      title: '',
      description: '',
      hint: '',
      max_grade_value: 1,
      contents: {},
    }),
  validate: (value) => {
    const issues = validatePoints(value);
    const contents = normalizeQuizContents(value);
    const parsed = v.safeParse(QuizContentsSchema, contents);
    if (!parsed.success)
      issues.push({ code: 'QUIZ_INVALID', message: parsed.issues[0]?.message ?? 'Quiz content is invalid.' });
    return issues;
  },
  getPreviewPayload: (value) => normalizeQuizContents(value),
  Component: QuizEditorComponent,
};

const TextTaskEditor: TaskTypeEditorModule = {
  type: 'OTHER',
  label: 'Text task',
  description: 'Manual-response task.',
  buildDefaultContents: () => normalizeOpenText(null) as unknown as Record<string, unknown>,
  validate: validatePoints,
  getPreviewPayload: (value) => normalizeOpenText(value.contents) as unknown as Record<string, unknown>,
  Component: TextEditorComponent,
};

export const TASK_TYPE_EDITORS: Record<AssignmentTaskType, TaskTypeEditorModule> = {
  FILE_SUBMISSION: FileTaskEditor,
  QUIZ: QuizTaskEditor,
  FORM: FormTaskEditor,
  OTHER: TextTaskEditor,
};

export function getTaskTypeEditor(type: AssignmentTaskType): TaskTypeEditorModule {
  return TASK_TYPE_EDITORS[type] ?? TextTaskEditor;
}
