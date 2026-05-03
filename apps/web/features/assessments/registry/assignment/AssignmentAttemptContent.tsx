'use client';

import { useMemo } from 'react';

import PageLoading from '@components/Objects/Loaders/PageLoading';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import AttemptHistoryList from '@/features/assessments/shared/AttemptHistoryList';
import { useAttemptShellControls } from '@/features/assessments/shell';
import { useAssessmentSubmission } from '@/features/assessments/hooks/useAssessmentSubmission';
import { ChoiceItemAttempt } from '@/features/assessments/items/choice';
import type { ChoiceAttemptItem, ChoiceAnswer } from '@/features/assessments/items/choice';
import { FileUploadAttempt, normalizeFileUploadConstraints } from '@/features/assessments/items/file-upload';
import { FormItemAttempt, normalizeFormItem } from '@/features/assessments/items/form';
import { OpenTextAttempt, normalizeOpenText } from '@/features/assessments/items/open-text';
import { getItemKindModule } from '@/features/assessments/items/registry';
import type { AssessmentItem, ItemAnswer, MatchPair } from '@/features/assessments/domain/items';
import type { AttemptSaveState } from '@/features/assessments/shell';
import type { KindAttemptProps } from '../index';
export default function AssignmentAttemptContent({ vm }: KindAttemptProps) {
  const assessmentUuid = vm?.assessmentUuid ?? null;
  const submissionState = useAssessmentSubmission(assessmentUuid);
  const { status } = submissionState;
  const saveState = mapSaveState(submissionState.saveState, status);
  const canEdit = status === null || status === 'DRAFT' || status === 'RETURNED';
  const canSave = canEdit && submissionState.saveState === 'dirty';
  const canSubmit = canEdit;

  const shellControls = useMemo(
    () => ({
      saveState,
      status,
      canSave,
      canSubmit,
      isSaving: submissionState.isSaving,
      isSubmitting: submissionState.isSubmitting,
      onSave: canSave ? () => void submissionState.save() : undefined,
      onSubmit: canSubmit ? () => void submissionState.submit() : undefined,
      navigation: null,
    }),
    [canSave, canSubmit, saveState, status, submissionState],
  );
  useAttemptShellControls(shellControls);

  if (!vm || submissionState.isLoading) {
    return <PageLoading />;
  }

  if (!assessmentUuid) {
    return (
      <div className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
        No assessment found.
      </div>
    );
  }

  const attemptHistory = submissionState.submissions.map((submission, index) => ({
    id: submission.submission_uuid,
    label: index === 0 ? 'Latest submission' : `Attempt ${submissionState.submissions.length - index}`,
    submittedAt: submission.submitted_at ?? submission.updated_at,
    status: submission.status,
    scoreLabel:
      submission.final_score !== null && submission.final_score !== undefined
        ? `${Math.round(submission.final_score)}%`
        : null,
  }));

  return (
    <div className="space-y-6">
      {attemptHistory.length ? <AttemptHistoryList items={attemptHistory} /> : null}

      <SubmissionStatePanel submission={submissionState.submission} />

      <div className="space-y-4">
        {vm.items.map((item, index) => (
          <AssessmentItemCard
            key={item.item_uuid}
            index={index}
            item={item}
            answer={submissionState.answers[item.item_uuid]}
            disabled={!canEdit || submissionState.isSaving || submissionState.isSubmitting}
            assessmentUuid={assessmentUuid}
            onChange={(answer) => submissionState.setItemAnswer(item.item_uuid, answer)}
          />
        ))}
      </div>
    </div>
  );
}

function mapSaveState(
  saveState: 'idle' | 'dirty' | 'saving' | 'saved' | 'conflict' | 'error',
  status: string | null,
): AttemptSaveState {
  if (status === 'PENDING') return 'submitted';
  if (status === 'RETURNED') return 'returned';
  switch (saveState) {
    case 'dirty': {
      return 'unsaved';
    }
    case 'saving': {
      return 'saving';
    }
    case 'error':
    case 'conflict': {
      return 'error';
    }
    default: {
      return 'saved';
    }
  }
}

function SubmissionStatePanel({
  submission,
}: {
  submission: {
    status: 'DRAFT' | 'PENDING' | 'GRADED' | 'PUBLISHED' | 'RETURNED';
    final_score?: number | null;
    grading_json?: { feedback?: string } | null;
    submitted_at?: string | null;
  } | null;
}) {
  if (!submission || submission.status === 'DRAFT') return null;

  if (submission.status === 'PENDING') {
    return (
      <Alert>
        <AlertTitle>Awaiting grade</AlertTitle>
        <AlertDescription>
          Submitted{submission.submitted_at ? ` on ${formatDateTime(submission.submitted_at)}` : ''}. Your teacher will
          release the grade when review is complete.
        </AlertDescription>
      </Alert>
    );
  }

  const scoreVisible = submission.status === 'PUBLISHED' || submission.status === 'RETURNED';
  const scoreLabel =
    scoreVisible && submission.final_score !== null && submission.final_score !== undefined
      ? `${Math.round(submission.final_score)}%`
      : null;

  return (
    <Alert>
      <AlertTitle>{submission.status === 'RETURNED' ? 'Returned for revision' : 'Result available'}</AlertTitle>
      <AlertDescription className="space-y-3">
        {scoreLabel ? (
          <span className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium">
            <Badge variant="secondary">Score</Badge>
            {scoreLabel}
          </span>
        ) : null}
        {submission.grading_json?.feedback ? (
          <p className="whitespace-pre-wrap">{submission.grading_json.feedback}</p>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

function AssessmentItemCard({
  index,
  item,
  answer,
  disabled,
  assessmentUuid,
  onChange,
}: {
  index: number;
  item: AssessmentItem;
  answer: ItemAnswer | undefined;
  disabled: boolean;
  assessmentUuid: string;
  onChange: (answer: ItemAnswer) => void;
}) {
  return (
    <section
      id={`item-${item.item_uuid}`}
      className="bg-card space-y-4 rounded-lg border p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-muted-foreground text-xs font-medium uppercase">Question {index + 1}</div>
          <h2 className="mt-1 text-base font-semibold">{item.title || `Item ${index + 1}`}</h2>
        </div>
        <Badge variant="outline">{item.max_score} pts</Badge>
      </div>

      <ItemAttemptRenderer
        item={item}
        answer={answer}
        disabled={disabled}
        assessmentUuid={assessmentUuid}
        onChange={onChange}
      />
    </section>
  );
}

function ItemAttemptRenderer({
  item,
  answer,
  disabled,
  assessmentUuid,
  onChange,
}: {
  item: AssessmentItem;
  answer: ItemAnswer | undefined;
  disabled: boolean;
  assessmentUuid: string;
  onChange: (answer: ItemAnswer) => void;
}) {
  const { body } = item;

  if (body.kind === 'CHOICE') {
    const choiceModule = getItemKindModule(body.multiple ? 'CHOICE_MULTIPLE' : 'CHOICE_SINGLE');
    const ChoiceAttempt = choiceModule.Attempt;
    const choiceItem = {
      id: item.item_uuid,
      kind: body.multiple ? 'CHOICE_MULTIPLE' : 'CHOICE_SINGLE',
      prompt: body.prompt,
      points: item.max_score,
      options: body.options.map((option) => ({
        id: option.id,
        text: option.text,
        isCorrect: option.is_correct,
      })),
    };
    const choiceAnswer = body.multiple
      ? answer?.kind === 'CHOICE'
        ? answer.selected
        : []
      : answer?.kind === 'CHOICE'
        ? (answer.selected[0] ?? null)
        : null;
    return (
      <ChoiceAttempt
        item={choiceItem}
        answer={choiceAnswer}
        disabled={disabled}
        onAnswerChange={(nextAnswer) => {
          const selected = Array.isArray(nextAnswer)
            ? nextAnswer.map(String)
            : nextAnswer === null || nextAnswer === undefined || nextAnswer === ''
              ? []
              : [String(nextAnswer)];
          onChange({ kind: 'CHOICE', selected });
        }}
      />
    );
  }

  if (body.kind === 'OPEN_TEXT') {
    return (
      <div className="space-y-3">
        {body.prompt ? <p className="text-sm">{body.prompt}</p> : null}
        <Textarea
          value={answer?.kind === 'OPEN_TEXT' ? answer.text : ''}
          disabled={disabled}
          className="min-h-36"
          onChange={(event) => onChange({ kind: 'OPEN_TEXT', text: event.target.value })}
        />
      </div>
    );
  }

  if (body.kind === 'ASSIGNMENT_FILE') {
    return (
      <FileUploadAttempt
        item={{
          taskUuid: item.item_uuid,
          assignmentUuid: assessmentUuid,
          referenceFile: body.reference_file,
          constraints: normalizeFileUploadConstraints({
            allowed_mime_types: body.allowed_mime_types,
            max_file_size_mb: body.max_file_size_mb ?? null,
            max_files: body.max_files,
          }),
        }}
        answer={answer?.kind === 'ASSIGNMENT_FILE' ? { kind: 'FILE_UPLOAD', uploads: answer.uploads } : null}
        disabled={disabled}
        onAnswerChange={(nextAnswer) =>
          onChange({
            kind: 'ASSIGNMENT_FILE',
            content_type: 'file',
            uploads: nextAnswer?.uploads ?? [],
            file_key: nextAnswer?.uploads?.[0]?.upload_uuid ?? null,
          })
        }
      />
    );
  }

  if (body.kind === 'ASSIGNMENT_FORM') {
    return (
      <FormItemAttempt
        item={{ ...normalizeFormItem({ questions: body.questions }), taskUuid: item.item_uuid }}
        answer={
          answer?.kind === 'ASSIGNMENT_FORM'
            ? { content_type: 'form', form_data: answer.form_data ?? { answers: {} } }
            : null
        }
        disabled={disabled}
        onAnswerChange={(nextAnswer) =>
          onChange({
            kind: 'ASSIGNMENT_FORM',
            content_type: 'form',
            form_data: nextAnswer?.form_data ?? { answers: {} },
          })
        }
      />
    );
  }

  if (body.kind === 'ASSIGNMENT_OTHER') {
    return (
      <OpenTextAttempt
        item={{
          ...normalizeOpenText({ body: body.body }),
          taskUuid: item.item_uuid,
        }}
        answer={answer?.kind === 'ASSIGNMENT_OTHER' ? { content_type: 'text', text: answer.text_content ?? '' } : null}
        disabled={disabled}
        onAnswerChange={(nextAnswer) =>
          onChange({
            kind: 'ASSIGNMENT_OTHER',
            content_type: 'text',
            text_content: nextAnswer?.text ?? '',
          })
        }
      />
    );
  }

  if (body.kind === 'ASSIGNMENT_QUIZ') {
    const normalizedAnswers = answer?.kind === 'ASSIGNMENT_QUIZ' ? (answer.quiz_answers?.answers ?? {}) : {};

    if (body.questions.length === 0) {
      return (
        <div className="text-muted-foreground rounded-md border border-dashed p-4 text-sm">No quiz questions.</div>
      );
    }

    return (
      <div className="space-y-4">
        {body.questions.map((question, questionIndex) => {
          const questionId = question.questionUUID || `question_${questionIndex}`;
          const choiceItem: ChoiceAttemptItem = {
            id: questionId,
            kind: 'CHOICE_MULTIPLE',
            prompt: question.questionText || 'Question',
            options: question.options.map((option, optionIndex) => ({
              id: option.optionUUID || `option_${optionIndex}`,
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
                <p className="font-medium">{choiceItem.prompt}</p>
              </div>
              <ChoiceItemAttempt
                item={choiceItem}
                answer={normalizedAnswers[questionId] ?? []}
                disabled={disabled}
                onAnswerChange={(nextAnswer: ChoiceAnswer) =>
                  onChange({
                    kind: 'ASSIGNMENT_QUIZ',
                    content_type: 'quiz',
                    quiz_answers: {
                      answers: {
                        ...normalizedAnswers,
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

  if (body.kind === 'FILE_UPLOAD') {
    const uploadModule = getItemKindModule('FILE_UPLOAD');
    const FileUploadAttempt = uploadModule.Attempt;
    return (
      <FileUploadAttempt
        item={{
          taskUuid: item.item_uuid,
          assignmentUuid: assessmentUuid,
          constraints: {
            kind: 'FILE_UPLOAD',
            allowed_mime_types: body.mimes,
            max_file_size_mb: body.max_mb ?? null,
            max_files: body.max_files,
          },
        }}
        answer={answer?.kind === 'FILE_UPLOAD' ? answer : null}
        disabled={disabled}
        onAnswerChange={(nextAnswer) =>
          onChange({
            kind: 'FILE_UPLOAD',
            uploads: nextAnswer?.uploads ?? [],
          })
        }
      />
    );
  }

  if (body.kind === 'FORM') {
    const currentValues = answer?.kind === 'FORM' ? answer.values : {};
    return (
      <div className="space-y-4">
        {body.prompt ? <p className="text-sm">{body.prompt}</p> : null}
        {body.fields.map((field, fieldIndex) => (
          <div
            key={field.id}
            className="space-y-2"
          >
            <Label htmlFor={`${item.item_uuid}-${field.id}`}>
              {field.label || `Field ${fieldIndex + 1}`}
              {field.required ? ' *' : ''}
            </Label>
            {field.field_type === 'textarea' ? (
              <Textarea
                id={`${item.item_uuid}-${field.id}`}
                value={currentValues[field.id] ?? ''}
                disabled={disabled}
                className="min-h-28"
                onChange={(event) =>
                  onChange({
                    kind: 'FORM',
                    values: {
                      ...currentValues,
                      [field.id]: event.target.value,
                    },
                  })
                }
              />
            ) : (
              <Input
                id={`${item.item_uuid}-${field.id}`}
                type={field.field_type === 'number' ? 'number' : field.field_type === 'date' ? 'date' : 'text'}
                value={currentValues[field.id] ?? ''}
                disabled={disabled}
                onChange={(event) =>
                  onChange({
                    kind: 'FORM',
                    values: {
                      ...currentValues,
                      [field.id]: event.target.value,
                    },
                  })
                }
              />
            )}
          </div>
        ))}
      </div>
    );
  }

  if (body.kind === 'MATCHING') {
    const rightOptions = body.pairs.map((pair) => pair.right);
    const currentMatches = new Map<string, string>(
      answer?.kind === 'MATCHING' ? answer.matches.map((pair) => [pair.left, pair.right]) : [],
    );
    const updateMatch = (left: string, right: string) => {
      const next = new Map(currentMatches);
      if (right) {
        next.set(left, right);
      } else {
        next.delete(left);
      }
      onChange({
        kind: 'MATCHING',
        matches: [...next.entries()].map(
          ([matchLeft, matchRight]): MatchPair => ({
            left: matchLeft,
            right: matchRight,
          }),
        ),
      });
    };

    return (
      <div className="space-y-3">
        {body.prompt ? <p className="text-sm">{body.prompt}</p> : null}
        {body.pairs.map((pair, pairIndex) => (
          <div
            key={`${pair.left}-${pairIndex}`}
            className="bg-background flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center"
          >
            <span className="min-w-0 flex-1 text-sm font-medium">{pair.left}</span>
            <NativeSelect
              value={currentMatches.get(pair.left) ?? ''}
              disabled={disabled}
              onChange={(event) => updateMatch(pair.left, event.target.value)}
              className="sm:max-w-xs"
            >
              <NativeSelectOption value="">Select match</NativeSelectOption>
              {rightOptions.map((option) => (
                <NativeSelectOption
                  key={option}
                  value={option}
                >
                  {option}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        ))}
      </div>
    );
  }

  if (body.kind === 'CODE') {
    const currentAnswer =
      answer?.kind === 'CODE'
        ? answer
        : { kind: 'CODE' as const, language: body.languages[0] ?? 71, source: '', latest_run: undefined };
    return (
      <div className="space-y-4">
        {body.prompt ? <p className="text-sm">{body.prompt}</p> : null}
        <div className="space-y-2">
          <Label htmlFor={`${item.item_uuid}-language`}>Language</Label>
          <NativeSelect
            id={`${item.item_uuid}-language`}
            value={String(currentAnswer.language)}
            disabled={disabled}
            onChange={(event) =>
              onChange({
                kind: 'CODE',
                language: Number(event.target.value),
                source: currentAnswer.source,
                latest_run: currentAnswer.latest_run,
              })
            }
          >
            {body.languages.map((language) => (
              <NativeSelectOption
                key={language}
                value={String(language)}
              >
                Language {language}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <Textarea
          value={currentAnswer.source}
          disabled={disabled}
          className="min-h-[20rem] font-mono text-sm"
          onChange={(event) =>
            onChange({
              kind: 'CODE',
              language: currentAnswer.language,
              source: event.target.value,
              latest_run: currentAnswer.latest_run,
            })
          }
        />
      </div>
    );
  }

  return <div className="text-muted-foreground rounded-md border border-dashed p-4 text-sm">Unsupported item.</div>;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
