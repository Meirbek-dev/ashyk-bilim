'use client';

import { apiFetch } from '@/lib/api-client';
import { useExamConfig } from '@/features/exams/hooks/useExam';

import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { valibotResolver } from '@hookform/resolvers/valibot';
import WhitelistManagement from './WhitelistManagement';
import { Separator } from '@/components/ui/separator';
import { useEffect, useMemo } from 'react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import * as v from 'valibot';

const createValidationSchema = (
  limits = {
    time_limit: { min: 1, max: 180 },
    attempt_limit: { min: 1, max: 5 },
    question_limit: { min: 1 },
    violation_threshold: { min: 1, max: 10 },
  },
) =>
  v.object({
    time_limit: v.nullable(
      v.optional(v.pipe(v.number(), v.minValue(limits.time_limit.min), v.maxValue(limits.time_limit.max))),
    ),
    attempt_limit: v.nullable(
      v.optional(v.pipe(v.number(), v.minValue(limits.attempt_limit.min), v.maxValue(limits.attempt_limit.max))),
    ),
    shuffle_questions: v.boolean(),
    // shuffle_answers is always true (enforced server-side)
    question_limit: v.nullable(v.optional(v.pipe(v.number(), v.minValue(limits.question_limit.min)))),
    access_mode: v.picklist(['NO_ACCESS', 'WHITELIST', 'ALL_ENROLLED']),
    allow_result_review: v.boolean(),
    show_correct_answers: v.boolean(),
    copy_paste_protection: v.boolean(),
    tab_switch_detection: v.boolean(),
    devtools_detection: v.boolean(),
    right_click_disable: v.boolean(),
    fullscreen_enforcement: v.boolean(),
    violation_threshold: v.nullable(
      v.optional(
        v.pipe(v.number(), v.minValue(limits.violation_threshold.min), v.maxValue(limits.violation_threshold.max)),
      ),
    ),
  });

interface ExamSettingsProps {
  exam: any;
  courseUuid: string;
  onSettingsUpdated: () => void;
}

type ExamSettingsFormValues = v.InferInput<ReturnType<typeof createValidationSchema>>;
type ExamSettingsSubmitValues = v.InferOutput<ReturnType<typeof createValidationSchema>>;

const clampNullableNumber = (value: number | null | undefined, min?: number, max?: number) => {
  if (value === null || value === undefined) return null;
  if (min !== undefined && value < min) return min;
  if (max !== undefined && value > max) return max;
  return value;
};

export default function ExamSettings({ exam, courseUuid, onSettingsUpdated }: ExamSettingsProps) {
  const t = useTranslations('Components.ExamSettings');

  const settings = exam.settings || {};

  const { data: limits, error: limitsError } = useExamConfig();

  // show a soft error; allow editing with default bounds
  if (limitsError) {
    console.error('Failed to load exam config limits', limitsError);
  }

  const validationSchema = useMemo(() => createValidationSchema(limits), [limits]);

  const form = useForm<ExamSettingsFormValues, any, ExamSettingsSubmitValues>({
    resolver: valibotResolver(validationSchema),
    defaultValues: {
      time_limit: settings.time_limit || null,
      attempt_limit: settings.attempt_limit || null,
      shuffle_questions: settings.shuffle_questions ?? true,
      question_limit: settings.question_limit || null,
      access_mode: settings.access_mode || 'NO_ACCESS',
      allow_result_review: settings.allow_result_review ?? true,
      show_correct_answers: settings.show_correct_answers ?? true,
      copy_paste_protection: settings.copy_paste_protection ?? true,
      tab_switch_detection: settings.tab_switch_detection ?? true,
      devtools_detection: settings.devtools_detection ?? true,
      right_click_disable: settings.right_click_disable ?? true,
      fullscreen_enforcement: settings.fullscreen_enforcement ?? true,
      violation_threshold: settings.violation_threshold || null,
    },
  });

  // If limits arrive after initial render, we could reset the form to clamp values to new defaults
  useEffect(() => {
    if (!limits) return;
    const current = form.getValues();
    const newValues = {
      ...current,
      time_limit: clampNullableNumber(current.time_limit, limits?.time_limit?.min, limits?.time_limit?.max),
      attempt_limit: clampNullableNumber(current.attempt_limit, limits?.attempt_limit?.min, limits?.attempt_limit?.max),
      question_limit: clampNullableNumber(current.question_limit, limits?.question_limit?.min),
      violation_threshold: clampNullableNumber(
        current.violation_threshold,
        limits?.violation_threshold?.min,
        limits?.violation_threshold?.max,
      ),
    };

    form.reset(newValues, { keepDirtyValues: true });
  }, [limits, form]);

  const onSubmit = async (values: ExamSettingsSubmitValues) => {
    const toastLoading = toast.loading(t('savingSettings'));
    try {
      const payload = { ...values, shuffle_answers: true };
      const response = await apiFetch(`exams/${exam.exam_uuid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: payload }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to update settings');
      }

      toast.success(t('settingsUpdated'), { id: toastLoading });
      onSettingsUpdated();
    } catch (error: any) {
      console.error('Error updating settings:', error);
      toast.error(error.message || t('errorUpdatingSettings'), { id: toastLoading });
    }
  };

  // Reset to sane defaults (uses server-provided limits when available)
  const resetToDefaults = () => {
    const defaults = {
      time_limit: limits?.time_limit?.min ?? 60,
      attempt_limit: null,
      shuffle_questions: true,
      question_limit: null,
      access_mode: 'NO_ACCESS',
      allow_result_review: true,
      show_correct_answers: true,
      copy_paste_protection: true,
      tab_switch_detection: true,
      devtools_detection: true,
      right_click_disable: true,
      fullscreen_enforcement: true,
      violation_threshold: null,
    } as const;

    form.reset(defaults);
    toast.success(t('settingsReset'));
  };

  const timeLimit = useWatch({ control: form.control, name: 'time_limit' });
  const attemptLimit = useWatch({ control: form.control, name: 'attempt_limit' });
  const questionLimit = useWatch({ control: form.control, name: 'question_limit' });
  const accessMode = useWatch({
    control: form.control,
    name: 'access_mode',
    defaultValue: settings.access_mode || 'NO_ACCESS',
  });
  const allowResultReview = useWatch({
    control: form.control,
    name: 'allow_result_review',
    defaultValue: settings.allow_result_review ?? true,
  });
  const copyPasteProtection = useWatch({
    control: form.control,
    name: 'copy_paste_protection',
    defaultValue: settings.copy_paste_protection ?? true,
  });
  const tabSwitchDetection = useWatch({
    control: form.control,
    name: 'tab_switch_detection',
    defaultValue: settings.tab_switch_detection ?? true,
  });
  const devtoolsDetection = useWatch({
    control: form.control,
    name: 'devtools_detection',
    defaultValue: settings.devtools_detection ?? true,
  });
  const rightClickDisable = useWatch({
    control: form.control,
    name: 'right_click_disable',
    defaultValue: settings.right_click_disable ?? true,
  });
  const fullscreenEnforcement = useWatch({
    control: form.control,
    name: 'fullscreen_enforcement',
    defaultValue: settings.fullscreen_enforcement ?? true,
  });
  const violationThreshold = useWatch({ control: form.control, name: 'violation_threshold' });

  const hasTimeLimit = timeLimit !== null && timeLimit !== undefined;
  const hasAttemptLimit = attemptLimit !== null && attemptLimit !== undefined;
  const hasQuestionLimit = questionLimit !== null && questionLimit !== undefined;
  const hasViolationThreshold = violationThreshold !== null && violationThreshold !== undefined;
  const anyAntiCheatEnabled =
    copyPasteProtection || tabSwitchDetection || devtoolsDetection || rightClickDisable || fullscreenEnforcement;

  const initialAccessMode = settings.access_mode || 'NO_ACCESS';

  const accessModes = [
    { value: 'NO_ACCESS', label: t('accessModeNoAccess') },
    { value: 'WHITELIST', label: t('accessModeWhitelist') },
    { value: 'ALL_ENROLLED', label: t('accessModeAllEnrolled') },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('examSettings')}</CardTitle>
        <CardDescription>{t('configureExamBehavior')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-8"
        >
          {/* Time & Attempts */}
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold">{t('timeAndAttempts')}</h3>
              <p className="text-muted-foreground text-sm">{t('timeAndAttemptsDescription')}</p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <FieldLabel>{t('enableTimeLimit')}</FieldLabel>
                  <FieldDescription>{t('timeLimitDescription')}</FieldDescription>
                </div>
                <Switch
                  checked={hasTimeLimit}
                  onCheckedChange={(checked) => {
                    form.setValue('time_limit', checked ? 60 : null);
                  }}
                />
              </div>

              {hasTimeLimit && (
                <Controller
                  control={form.control}
                  name="time_limit"
                  render={({ field, fieldState }) => (
                    <Field>
                      <FieldLabel htmlFor={field.name}>{t('timeLimitMinutes')}</FieldLabel>
                      <Input
                        id={field.name}
                        type="number"
                        min={limits?.time_limit?.min ?? 1}
                        max={limits?.time_limit?.max ?? 180}
                        {...field}
                        value={field.value ?? ''}
                        onChange={(e) =>
                          field.onChange(e.target.value === '' ? null : Number.parseInt(e.target.value, 10))
                        }
                      />
                      <FieldDescription>{t('timeLimitMinutesDescription')}</FieldDescription>
                      <FieldError errors={[fieldState.error]} />
                    </Field>
                  )}
                />
              )}

              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <FieldLabel>{t('enableAttemptLimit')}</FieldLabel>
                  <FieldDescription>{t('attemptLimitDescription')}</FieldDescription>
                </div>
                <Switch
                  checked={hasAttemptLimit}
                  onCheckedChange={(checked) => {
                    form.setValue('attempt_limit', checked ? 1 : null);
                  }}
                />
              </div>

              {hasAttemptLimit && (
                <Controller
                  control={form.control}
                  name="attempt_limit"
                  render={({ field, fieldState }) => (
                    <Field>
                      <FieldLabel htmlFor={field.name}>{t('attemptLimit')}</FieldLabel>
                      <Input
                        id={field.name}
                        type="number"
                        min={limits?.attempt_limit?.min ?? 1}
                        max={limits?.attempt_limit?.max ?? 5}
                        {...field}
                        value={field.value ?? ''}
                        onChange={(e) =>
                          field.onChange(e.target.value === '' ? null : Number.parseInt(e.target.value, 10))
                        }
                      />
                      <FieldDescription>{t('attemptLimitInputDescription')}</FieldDescription>
                      <FieldError errors={[fieldState.error]} />
                    </Field>
                  )}
                />
              )}
            </div>
          </div>

          <Separator />

          {/* Question Behavior */}
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold">{t('questionBehavior')}</h3>
              <p className="text-muted-foreground text-sm">{t('questionBehaviorDescription')}</p>
            </div>

            <div className="space-y-4">
              <Controller
                control={form.control}
                name="shuffle_questions"
                render={({ field }) => (
                  <Field
                    orientation="horizontal"
                    className="justify-between rounded-lg border p-4"
                  >
                    <div className="space-y-0.5">
                      <FieldLabel>{t('shuffleQuestions')}</FieldLabel>
                      <FieldDescription>{t('shuffleQuestionsDescription')}</FieldDescription>
                    </div>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </Field>
                )}
              />

              <div className="flex items-center justify-between rounded-lg border p-4 opacity-50">
                <div className="space-y-0.5">
                  <FieldLabel>{t('shuffleAnswers')}</FieldLabel>
                  <FieldDescription>{t('shuffleAnswersDescription')}</FieldDescription>
                </div>
                <Switch
                  checked
                  disabled
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <FieldLabel>{t('enableQuestionLimit')}</FieldLabel>
                  <FieldDescription>{t('questionLimitDescription')}</FieldDescription>
                </div>
                <Switch
                  checked={hasQuestionLimit}
                  onCheckedChange={(checked) => {
                    form.setValue('question_limit', checked ? 10 : null);
                  }}
                />
              </div>

              {hasQuestionLimit && (
                <Controller
                  control={form.control}
                  name="question_limit"
                  render={({ field, fieldState }) => (
                    <Field>
                      <FieldLabel htmlFor={field.name}>{t('questionLimit')}</FieldLabel>
                      <Input
                        id={field.name}
                        type="number"
                        min={limits?.question_limit?.min ?? 1}
                        {...field}
                        value={field.value ?? ''}
                        onChange={(e) =>
                          field.onChange(e.target.value === '' ? null : Number.parseInt(e.target.value, 10))
                        }
                      />
                      <FieldDescription>{t('questionLimitInputDescription')}</FieldDescription>
                      <FieldError errors={[fieldState.error]} />
                    </Field>
                  )}
                />
              )}
            </div>
          </div>

          <Separator />

          {/* Access Control */}
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold">{t('accessControl')}</h3>
              <p className="text-muted-foreground text-sm">{t('accessControlDescription')}</p>
            </div>

            <Controller
              control={form.control}
              name="access_mode"
              render={({ field }) => (
                <Field>
                  <FieldLabel>{t('accessMode')}</FieldLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value ?? 'NO_ACCESS'}
                    items={accessModes}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('selectAccessMode')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {accessModes.map((item) => (
                          <SelectItem
                            key={item.value}
                            value={item.value}
                          >
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FieldDescription>{t('accessModeDescription')}</FieldDescription>
                  <FieldError errors={[form.formState.errors.access_mode]} />
                </Field>
              )}
            />

            {/* Warning if switching away from whitelist - stored list will remain but be ignored */}
            {initialAccessMode === 'WHITELIST' && accessMode !== 'WHITELIST' && (
              <Alert>
                <AlertTitle>{t('whitelistWillBeIgnored')}</AlertTitle>
                <AlertDescription>{t('whitelistWillBeIgnoredDescription')}</AlertDescription>
              </Alert>
            )}

            {/* Whitelist Management - Only show when access mode is WHITELIST */}
            {accessMode === 'WHITELIST' && (
              <WhitelistManagement
                examUuid={exam.exam_uuid}
                courseUuid={courseUuid}
                currentWhitelist={settings.whitelist_user_ids || []}
                onWhitelistUpdated={onSettingsUpdated}
              />
            )}
          </div>

          <Separator />

          {/* Result Visibility */}
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold">{t('resultVisibility')}</h3>
              <p className="text-muted-foreground text-sm">{t('resultVisibilityDescription')}</p>
            </div>

            <div className="space-y-4">
              <Controller
                control={form.control}
                name="allow_result_review"
                render={({ field }) => (
                  <Field
                    orientation="horizontal"
                    className="justify-between rounded-lg border p-4"
                  >
                    <div className="space-y-0.5">
                      <FieldLabel>{t('allowResultReview')}</FieldLabel>
                      <FieldDescription>{t('allowResultReviewDescription')}</FieldDescription>
                    </div>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </Field>
                )}
              />

              {form.watch('allow_result_review') && (
                <Controller
                  control={form.control}
                  name="show_correct_answers"
                  render={({ field }) => (
                    <Field
                      orientation="horizontal"
                      className="ml-6 justify-between rounded-lg border p-4"
                    >
                      <div className="space-y-0.5">
                        <FieldLabel>{t('showCorrectAnswers')}</FieldLabel>
                        <FieldDescription>{t('showCorrectAnswersDescription')}</FieldDescription>
                      </div>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </Field>
                  )}
                />
              )}
            </div>
          </div>

          <Separator />

          {/* Anti-Cheating */}
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold">{t('antiCheating')}</h3>
              <p className="text-muted-foreground text-sm">{t('antiCheatingDescription')}</p>
            </div>

            <div className="space-y-4">
              <Controller
                control={form.control}
                name="copy_paste_protection"
                render={({ field }) => (
                  <Field
                    orientation="horizontal"
                    className="justify-between rounded-lg border p-4"
                  >
                    <div className="space-y-0.5">
                      <FieldLabel>{t('copyPasteProtection')}</FieldLabel>
                      <FieldDescription>{t('copyPasteProtectionDescription')}</FieldDescription>
                    </div>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </Field>
                )}
              />

              <Controller
                control={form.control}
                name="tab_switch_detection"
                render={({ field }) => (
                  <Field
                    orientation="horizontal"
                    className="justify-between rounded-lg border p-4"
                  >
                    <div className="space-y-0.5">
                      <FieldLabel>{t('tabSwitchDetection')}</FieldLabel>
                      <FieldDescription>{t('tabSwitchDetectionDescription')}</FieldDescription>
                    </div>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </Field>
                )}
              />

              <Controller
                control={form.control}
                name="devtools_detection"
                render={({ field }) => (
                  <Field
                    orientation="horizontal"
                    className="justify-between rounded-lg border p-4"
                  >
                    <div className="space-y-0.5">
                      <FieldLabel>{t('devtoolsDetection')}</FieldLabel>
                      <FieldDescription>{t('devtoolsDetectionDescription')}</FieldDescription>
                    </div>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </Field>
                )}
              />

              <Controller
                control={form.control}
                name="right_click_disable"
                render={({ field }) => (
                  <Field
                    orientation="horizontal"
                    className="justify-between rounded-lg border p-4"
                  >
                    <div className="space-y-0.5">
                      <FieldLabel>{t('rightClickDisable')}</FieldLabel>
                      <FieldDescription>{t('rightClickDisableDescription')}</FieldDescription>
                    </div>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </Field>
                )}
              />

              <Controller
                control={form.control}
                name="fullscreen_enforcement"
                render={({ field }) => (
                  <Field
                    orientation="horizontal"
                    className="justify-between rounded-lg border p-4"
                  >
                    <div className="space-y-0.5">
                      <FieldLabel>{t('fullscreenEnforcement')}</FieldLabel>
                      <FieldDescription>{t('fullscreenEnforcementDescription')}</FieldDescription>
                    </div>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </Field>
                )}
              />

              {anyAntiCheatEnabled && (
                <>
                  <div className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FieldLabel>{t('enableViolationThreshold')}</FieldLabel>
                      <FieldDescription>{t('violationThresholdDescription')}</FieldDescription>
                    </div>
                    <Switch
                      checked={hasViolationThreshold}
                      onCheckedChange={(checked) => {
                        form.setValue('violation_threshold', checked ? 3 : null);
                      }}
                    />
                  </div>

                  {hasViolationThreshold && (
                    <Controller
                      control={form.control}
                      name="violation_threshold"
                      render={({ field, fieldState }) => (
                        <Field>
                          <FieldLabel htmlFor={field.name}>{t('violationThreshold')}</FieldLabel>
                          <Input
                            id={field.name}
                            type="number"
                            min={limits?.violation_threshold?.min ?? 1}
                            max={limits?.violation_threshold?.max ?? 10}
                            {...field}
                            value={field.value ?? ''}
                            onChange={(e) =>
                              field.onChange(e.target.value === '' ? null : Number.parseInt(e.target.value, 10))
                            }
                          />
                          <FieldDescription>{t('violationThresholdInputDescription')}</FieldDescription>
                          <FieldError errors={[fieldState.error]} />
                        </Field>
                      )}
                    />
                  )}
                </>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={resetToDefaults}
            >
              {t('resetDefaults')}
            </Button>
            <Button
              type="submit"
              disabled={form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? t('saving') : t('saveSettings')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
