'use client'

import { Controller, useFormContext } from 'react-hook-form'
import { useTranslations } from 'next-intl'

import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import ComboboxMultiple from '@/components/ui/custom/multiple-combobox'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useJudge0Languages } from '@/features/assessments/hooks/code-challenge'
import type { CodeChallengeSettingsForm } from './CodeChallengeStudio'

export default function LanguagePolicyPanel() {
  const t = useTranslations('Activities.CodeChallenges')
  const form = useFormContext<CodeChallengeSettingsForm>()
  const { data: judge0Languages = [], isError: languagesUnavailable } = useJudge0Languages()

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('generalSettings')}</CardTitle>
        <CardDescription>{t('generalSettingsDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {languagesUnavailable ? (
          <Alert variant="destructive">
            <AlertTitle>{t('languageServiceUnavailableTitle')}</AlertTitle>
            <AlertDescription>{t('languageServiceUnavailableDescription')}</AlertDescription>
          </Alert>
        ) : null}

        <Controller
          control={form.control}
          name="allowed_languages"
          render={({ field }) => (
            <Field>
              <FieldLabel>{t('allowedLanguages')}</FieldLabel>
              <ComboboxMultiple<{ id: number; name: string }>
                options={judge0Languages}
                value={field.value}
                onChange={values => field.onChange(values.map(Number))}
                getOptionValue={option => option.id}
                getOptionLabel={option => option.name}
                placeholder={t('selectLanguages')}
                searchPlaceholder={t('searchLanguages')}
                emptyMessage={t('noLanguagesFound')}
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => field.onChange(judge0Languages.map(l => l.id))}
                >
                  {t('selectAll')}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => field.onChange([])}>
                  {t('deselectAll')}
                </Button>
              </div>
              <FieldDescription>{t('allowedLanguagesDescription')}</FieldDescription>
            </Field>
          )}
        />

        <div className="grid gap-4 md:grid-cols-3">
          <NumberField name="time_limit" label={t('timeLimit')} min={1} max={60} />
          <NumberField name="memory_limit" label={t('memoryLimit')} min={16} max={2048} />
          <NumberField name="points" label={t('points')} min={0} max={10_000} />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <SelectField
            name="difficulty"
            label={t('difficultyLabel')}
            options={[
              ['EASY', t('difficulty.easy')],
              ['MEDIUM', t('difficulty.medium')],
              ['HARD', t('difficulty.hard')],
            ]}
          />
          <SelectField
            name="grading_strategy"
            label={t('gradingStrategyLabel')}
            options={[
              ['ALL_OR_NOTHING', t('allOrNothing')],
              ['PARTIAL_CREDIT', t('partialCredit')],
              ['BEST_SUBMISSION', t('bestSubmission')],
              ['LATEST_SUBMISSION', t('latestSubmission')],
            ]}
          />
          <SelectField
            name="execution_mode"
            label={t('executionModeLabel')}
            options={[
              ['FAST_FEEDBACK', t('fastFeedback')],
              ['COMPLETE_FEEDBACK', t('completeFeedback')],
            ]}
          />
        </div>

        <Controller
          control={form.control}
          name="allow_custom_input"
          render={({ field }) => (
            <Field orientation="horizontal" className="justify-between rounded-md border p-3">
              <div>
                <FieldLabel>{t('allowCustomInput')}</FieldLabel>
                <FieldDescription>{t('allowCustomInputDescription')}</FieldDescription>
              </div>
              <Switch checked={field.value} onCheckedChange={field.onChange} />
            </Field>
          )}
        />
      </CardContent>
    </Card>
  )
}

function NumberField({
  name,
  label,
  min,
  max,
}: {
  name: keyof CodeChallengeSettingsForm
  label: string
  min: number
  max: number
}) {
  const form = useFormContext<CodeChallengeSettingsForm>()
  return (
    <Controller
      control={form.control}
      name={name}
      render={({ field }) => (
        <Field>
          <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
          <Input
            id={field.name}
            type="number"
            min={min}
            max={max}
            value={Number(field.value ?? 0)}
            onChange={e => field.onChange(Number(e.target.value))}
          />
        </Field>
      )}
    />
  )
}

function SelectField({
  name,
  label,
  options,
}: {
  name: keyof CodeChallengeSettingsForm
  label: string
  options: [string, string][]
}) {
  const form = useFormContext<CodeChallengeSettingsForm>()
  return (
    <Controller
      control={form.control}
      name={name}
      render={({ field }) => (
        <Field>
          <FieldLabel>{label}</FieldLabel>
          <NativeSelect
            value={String(field.value)}
            onChange={event => field.onChange(event.target.value)}
          >
            {options.map(([value, optionLabel]) => (
              <NativeSelectOption key={value} value={value}>
                {optionLabel}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      )}
    />
  )
}
