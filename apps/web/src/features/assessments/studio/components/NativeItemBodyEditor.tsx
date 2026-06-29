import { Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { ChoiceItemAuthor } from '@/features/assessments/items/choice'
import { MarkdownEditor } from '@/features/content-markdown'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Switch } from '@/components/ui/switch'
import { InlineIssueList } from './ValidationIssues'
import type { classifyValidationIssue } from '@/features/assessments/domain/readiness'
import type { EditableItem } from '../studioTypes'
import { toChoiceAuthorValue, fromChoiceAuthorValue, createFormField } from '../utils'

interface ToggleRowProps {
  label: string
  checked: boolean
  disabled: boolean
  onChange: (checked: boolean) => void
}

export function ToggleRow({ label, checked, disabled, onChange }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
      <span className="text-sm font-medium">{label}</span>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  )
}

interface NativeItemBodyEditorProps {
  item: EditableItem
  disabled: boolean
  issues: ReturnType<typeof classifyValidationIssue>[]
  onChange: (nextItem: EditableItem) => void
}

export function NativeItemBodyEditor({ item, disabled, issues, onChange }: NativeItemBodyEditorProps) {
  const t = useTranslations('Features.Assessments.Studio.NativeItemStudio')
  const hasIssue = (code: string) =>
    issues.some(
      issue => issue.code === code || (code.endsWith('.prompt_missing') && issue.code === 'item.prompt_missing'),
    )
  const invalidFields = new Set(
    issues.map(issue => issue.field).filter((field): field is string => typeof field === 'string' && field.length > 0),
  )

  if (item.body.kind === 'CHOICE' || item.body.kind === 'MATCHING') {
    return (
      <div className="space-y-3">
        {hasIssue('choice.prompt_missing') ||
        hasIssue('matching.prompt_missing') ||
        hasIssue('choice.options_missing') ||
        hasIssue('choice.option_text_missing') ||
        hasIssue('choice.option_duplicate') ||
        hasIssue('choice.correct_missing') ||
        hasIssue('choice.too_many_correct') ||
        hasIssue('matching.pairs_missing') ||
        hasIssue('matching.pair_value_missing') ||
        hasIssue('matching.left_duplicate') ||
        hasIssue('matching.right_duplicate') ? (
          <InlineIssueList issues={issues} />
        ) : null}
        <ChoiceItemAuthor
          value={toChoiceAuthorValue(item.body)}
          disabled={disabled}
          invalidFields={invalidFields}
          onChange={nextValue => onChange({ ...item, ...fromChoiceAuthorValue(item, nextValue) })}
        />
      </div>
    )
  }

  if (item.body.kind === 'OPEN_TEXT') {
    const { body } = item
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>{t('Items.OpenText.prompt')}</Label>
          <MarkdownEditor
            value={body.prompt}
            disabled={disabled}
            placeholder={t('Items.promptPlaceholder')}
            className={hasIssue('open_text.prompt_missing') ? 'border-destructive' : ''}
            preset="questionPrompt"
            onChange={md =>
              onChange({
                ...item,
                body: { ...body, kind: 'OPEN_TEXT', prompt: md },
              })
            }
          />
        </div>
        <div className="grid gap-4 md:grid-cols-[12rem_1fr]">
          <div className="space-y-2">
            <Label htmlFor="open-text-min-words">{t('Items.OpenText.minWords')}</Label>
            <Input
              id="open-text-min-words"
              type="number"
              min={0}
              value={body.min_words ?? ''}
              disabled={disabled}
              aria-invalid={hasIssue('open_text.min_words_invalid')}
              onChange={event =>
                onChange({
                  ...item,
                  body: {
                    ...body,
                    kind: 'OPEN_TEXT',
                    min_words: event.target.value ? Number(event.target.value) : null,
                  },
                })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="open-text-rubric">{t('Items.OpenText.rubric')}</Label>
            <MarkdownEditor
              value={body.rubric ?? ''}
              disabled={disabled}
              preset="explanation"
              minHeight={140}
              onChange={markdown =>
                onChange({
                  ...item,
                  body: { ...body, kind: 'OPEN_TEXT', rubric: markdown || null },
                })
              }
            />
          </div>
        </div>
        {issues.length > 0 ? <InlineIssueList issues={issues} /> : null}
      </div>
    )
  }

  if (item.body.kind === 'FORM') {
    const { body } = item
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>{t('Items.Form.prompt')}</Label>
          <MarkdownEditor
            value={body.prompt}
            disabled={disabled}
            placeholder={t('Items.promptPlaceholder')}
            className={hasIssue('form.prompt_missing') ? 'border-destructive' : ''}
            preset="questionPrompt"
            onChange={md => onChange({ ...item, body: { ...body, kind: 'FORM', prompt: md } })}
          />
        </div>

        {issues.length > 0 ? <InlineIssueList issues={issues} /> : null}

        <div className="space-y-3">
          {body.fields.map((field, index) => (
            <div key={field.id} className="rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{t('Items.Form.fieldHeader', { number: index + 1 })}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={disabled || body.fields.length <= 1}
                  onClick={() =>
                    onChange({
                      ...item,
                      body: {
                        ...body,
                        kind: 'FORM',
                        fields: body.fields.filter(candidate => candidate.id !== field.id),
                      },
                    })
                  }
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>

              <div className="grid gap-4 md:grid-cols-[1fr_12rem_auto]">
                <div className="space-y-1.5">
                  <Label htmlFor={`form-field-label-${field.id}`}>{t('Items.Form.fieldLabel')}</Label>
                  <Input
                    id={`form-field-label-${field.id}`}
                    value={field.label}
                    disabled={disabled}
                    aria-invalid={hasIssue('form.field_label_missing')}
                    onChange={event =>
                      onChange({
                        ...item,
                        body: {
                          ...body,
                          kind: 'FORM',
                          fields: body.fields.map(candidate =>
                            candidate.id === field.id ? { ...candidate, label: event.target.value } : candidate,
                          ),
                        },
                      })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`form-field-type-${field.id}`}>{t('Items.Form.fieldType')}</Label>
                  <NativeSelect
                    id={`form-field-type-${field.id}`}
                    value={field.field_type}
                    disabled={disabled}
                    className="w-full"
                    onChange={event =>
                      onChange({
                        ...item,
                        body: {
                          ...body,
                          kind: 'FORM',
                          fields: body.fields.map(candidate =>
                            candidate.id === field.id
                              ? {
                                  ...candidate,
                                  field_type: event.target.value as typeof candidate.field_type,
                                }
                              : candidate,
                          ),
                        },
                      })
                    }
                  >
                    <NativeSelectOption value="text">{t('Items.Form.fieldTypes.text')}</NativeSelectOption>
                    <NativeSelectOption value="textarea">{t('Items.Form.fieldTypes.textarea')}</NativeSelectOption>
                    <NativeSelectOption value="number">{t('Items.Form.fieldTypes.number')}</NativeSelectOption>
                    <NativeSelectOption value="date">{t('Items.Form.fieldTypes.date')}</NativeSelectOption>
                  </NativeSelect>
                </div>
                <div className="flex items-end">
                  <ToggleRow
                    label={t('Items.Form.requiredLabel')}
                    checked={field.required}
                    disabled={disabled}
                    onChange={checked =>
                      onChange({
                        ...item,
                        body: {
                          ...body,
                          kind: 'FORM',
                          fields: body.fields.map(candidate =>
                            candidate.id === field.id ? { ...candidate, required: checked } : candidate,
                          ),
                        },
                      })
                    }
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() =>
            onChange({
              ...item,
              body: {
                ...body,
                kind: 'FORM',
                fields: [...body.fields, createFormField()],
              },
            })
          }
        >
          {t('Items.Form.addField')}
        </Button>
      </div>
    )
  }

  return <div className="text-muted-foreground text-sm">{t('Items.Form.unsupportedKind')}</div>
}
