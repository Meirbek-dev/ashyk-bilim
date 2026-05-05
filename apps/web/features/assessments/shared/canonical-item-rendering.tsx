'use client';

import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import type { ChoiceAnswer, ChoiceAttemptItem } from '@/features/assessments/items/choice';
import { normalizeFormItem } from '@/features/assessments/items/form';
import { getItemKindModule } from '@/features/assessments/items/registry';
import type { AssessmentItem, ItemAnswer, MatchPair } from '@/features/assessments/domain/items';

export function renderCanonicalAttemptItem({
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

  if (body.kind === 'FILE_UPLOAD') {
    const uploadModule = getItemKindModule('FILE_UPLOAD');
    const FileUploadAttemptModule = uploadModule.Attempt;
    return (
      <FileUploadAttemptModule
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

export function renderCanonicalReviewAnswer(item: AssessmentItem, answer: ItemAnswer | null | undefined) {
  const { body } = item;

  if (body.kind === 'CHOICE') {
    const choiceModule = getItemKindModule(body.multiple ? 'CHOICE_MULTIPLE' : 'CHOICE_SINGLE');
    const ReviewDetail = choiceModule.ReviewDetail;
    const reviewItem: ChoiceAttemptItem = {
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
    const reviewAnswer: ChoiceAnswer = body.multiple
      ? answer?.kind === 'CHOICE'
        ? answer.selected
        : []
      : answer?.kind === 'CHOICE'
        ? (answer.selected[0] ?? null)
        : null;
    return <ReviewDetail item={reviewItem} answer={reviewAnswer} />;
  }

  if (body.kind === 'OPEN_TEXT') {
    const ReviewDetail = getItemKindModule('OPEN_TEXT').ReviewDetail;
    return (
      <div className="space-y-3">
        <ReviewDetail
          item={{ kind: 'OPEN_TEXT', body: { prompt: body.prompt } }}
          answer={{ text: answer?.kind === 'OPEN_TEXT' ? answer.text : '' }}
        />
        {body.rubric ? (
          <div className="rounded-md border border-sky-200 bg-sky-50/70 p-3 text-xs text-sky-950">
            <div className="mb-1 font-medium">Rubric guidance</div>
            <pre className="whitespace-pre-wrap">{body.rubric}</pre>
          </div>
        ) : null}
      </div>
    );
  }

  if (body.kind === 'FILE_UPLOAD') {
    const ReviewDetail = getItemKindModule('FILE_UPLOAD').ReviewDetail;
    return (
      <ReviewDetail
        item={{
          taskUuid: item.item_uuid,
          assignmentUuid: item.item_uuid,
          constraints: {
            kind: 'FILE_UPLOAD',
            allowed_mime_types: body.mimes,
            max_file_size_mb: body.max_mb ?? null,
            max_files: body.max_files,
          },
        }}
        answer={answer?.kind === 'FILE_UPLOAD' ? answer : null}
      />
    );
  }

  if (body.kind === 'FORM') {
    const ReviewDetail = getItemKindModule('FORM').ReviewDetail;
    return (
      <ReviewDetail
        item={normalizeFormItem({
          questions: [
            {
              questionUUID: item.item_uuid,
              questionText: body.prompt,
              blanks: body.fields.map((field) => ({
                blankUUID: field.id,
                placeholder: field.label,
              })),
            },
          ],
        })}
        answer={{ form_data: { answers: answer?.kind === 'FORM' ? answer.values : {} } }}
      />
    );
  }

  if (body.kind === 'MATCHING') {
    const ReviewDetail = getItemKindModule('MATCHING').ReviewDetail;
    return <ReviewDetail item={body} answer={answer?.kind === 'MATCHING' ? answer : null} />;
  }

  if (body.kind === 'CODE') {
    const ReviewDetail = getItemKindModule('CODE').ReviewDetail;
    return <ReviewDetail answer={answer?.kind === 'CODE' ? answer : null} />;
  }

  return (
    <div className="bg-card rounded-md border p-3 text-sm">
      <div className="mb-2 flex items-center gap-2">
        <Badge variant="outline">Unsupported</Badge>
      </div>
      <pre className="bg-muted max-h-80 overflow-auto rounded-md p-3 text-xs">{JSON.stringify(answer ?? {}, null, 2)}</pre>
    </div>
  );
}
